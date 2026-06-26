/**
 * Fix stale Uber platform links + import Treviño drivers from TAXI Business org.
 *
 * cosculluela: re-link by email/name across all Uber orgs, or deactivate stale rows.
 * trevino: purge inactive BADAVI clone rows, import/link from tenant Uber org.
 *
 * Usage:
 *   npx tsx src/cli/run-with-worker-uber-env.ts src/cli/fix-group-stale-uber-links.ts [--dry-run]
 */
import "../load-env.js";
import { withoutTenant, RidePlatform } from "@fleethub/db";
import { importUberDriversForTenant } from "../lib/uber-import-drivers.js";
import { linkUberDriversForTenant } from "../lib/uber-link-drivers.js";
import {
  listAllUberDrivers,
  listUberOrganizations,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";

const COS_STALE_UUIDS = [
  "94f5ff07-d0bc-4bd6-9b52-4cf18df55b00", // ERIC SALAS RIO
  "2fa93770-8524-41ea-ab36-3149625bde05", // FIDEL DAVALOS MEDRANO
];

/** BADAVI org UUIDs wrongly cloned into trevino (already inactive). */
const TREVINO_BADAVI_CLONE_UUIDS = [
  "c12b9f5b-f953-4977-a898-8d800d79e602",
  "4547eb07-70f6-4fae-80ea-f953960b0ca9",
  "341e8f04-32fe-4349-a8de-5d8a49d55fea",
  "c4b25553-43f1-40e7-8e41-5d3c69df62bc",
  "4ab7a8fb-2855-4e4b-9389-b5066ea84e44",
  "16fddace-7c56-4268-9533-0b78602bac07",
  "538b60a6-d4d1-4df7-9c20-6dacd9bb6956",
  "4b09d22c-9624-4f36-a46c-7bc4226868fb",
  "81d4541c-7fa2-46e0-ae1b-6c95f75639a3",
  "b34df57a-e76d-47f1-8305-408d0ecd08bb",
];

type UberDriverHit = { uuid: string; name: string; org: string; email?: string };

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(" ").filter((t) => t.length > 1));
  const tb = new Set(nb.split(" ").filter((t) => t.length > 1));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  return shared >= Math.max(2, Math.min(ta.size, tb.size) - 1);
}

async function fetchAllUberDrivers(): Promise<UberDriverHit[]> {
  const hits: UberDriverHit[] = [];
  const orgs = await listUberOrganizations();
  if (!orgs.ok) return hits;
  for (const org of orgs.data) {
    const listed = await listAllUberDrivers(org.id);
    if (!listed.ok) continue;
    for (const d of listed.data) {
      const uuid = uberDriverExternalId(d);
      if (!uuid) continue;
      hits.push({
        uuid,
        name: uberDriverDisplayName(d),
        org: org.name ?? "?",
        email: typeof d.email === "string" ? d.email : undefined,
      });
    }
  }
  return hits;
}

function findUberMatch(
  hits: UberDriverHit[],
  fullName: string,
  email: string | null,
): UberDriverHit | null {
  if (email) {
    const byEmail = hits.find(
      (h) => h.email && h.email.toLowerCase() === email.toLowerCase(),
    );
    if (byEmail) return byEmail;
  }
  return hits.find((h) => namesMatch(fullName, h.name)) ?? null;
}

async function deactivateStaleDpa(
  tenantId: string,
  dpaId: string,
  driverId: string,
  dryRun: boolean,
): Promise<number> {
  const pending = await withoutTenant(
    (tx) =>
      tx.trip.count({
        where: { tenantId, driverId, liquidationStatus: "pending" },
      }),
    undefined,
    tenantId,
  );
  if (dryRun) return pending;
  await withoutTenant(
    async (tx) => {
      await tx.trip.deleteMany({
        where: { tenantId, driverId, liquidationStatus: "pending" },
      });
      await tx.driverPlatformAccount.update({
        where: { id: dpaId },
        data: { isActive: false },
      });
      const otherActive = await tx.driverPlatformAccount.count({
        where: { driverId, isActive: true },
      });
      if (otherActive === 0) {
        await tx.driver.update({ where: { id: driverId }, data: { isActive: false } });
      }
    },
    undefined,
    tenantId,
  );
  return pending;
}

async function fixCosculluelaStale(dryRun: boolean, allUber: UberDriverHit[]) {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("cosculluela not found");

  console.log("\n=== cosculluela stale Uber links ===");
  let relinked = 0;
  let deactivated = 0;
  let pendingDeleted = 0;

  for (const ext of COS_STALE_UUIDS) {
    const dpa = await withoutTenant(
      (tx) =>
        tx.driverPlatformAccount.findFirst({
          where: {
            tenantId: tenant.id,
            platform: RidePlatform.UBER,
            externalDriverId: { equals: ext, mode: "insensitive" },
            isActive: true,
          },
          select: {
            id: true,
            driverId: true,
            driver: { select: { fullName: true, email: true } },
          },
        }),
      undefined,
      tenant.id,
    );
    if (!dpa) {
      console.log(`  skip ${ext.slice(0, 8)}… (not active in DB)`);
      continue;
    }

    const match = findUberMatch(allUber, dpa.driver.fullName, dpa.driver.email);
    if (match && match.uuid.toLowerCase() !== ext.toLowerCase()) {
      console.log(
        `  relink ${dpa.driver.fullName}: ${ext.slice(0, 8)}… → ${match.uuid.slice(0, 8)}… (${match.org})`,
      );
      if (!dryRun) {
        await withoutTenant(
          (tx) =>
            tx.driverPlatformAccount.update({
              where: { id: dpa.id },
              data: {
                externalDriverId: match.uuid,
                isActive: true,
                metadata: {
                  source: "stale_uuid_fix",
                  linkedAt: new Date().toISOString(),
                  uberOrg: match.org,
                },
              },
            }),
          undefined,
          tenant.id,
        );
      }
      relinked += 1;
      continue;
    }

    if (match) {
      console.log(`  keep ${dpa.driver.fullName} — UUID matches API (${match.org})`);
      continue;
    }

    console.log(`  deactivate stale: ${dpa.driver.fullName} (${ext.slice(0, 8)}…) — not in any Uber org API`);
    const pending = await deactivateStaleDpa(tenant.id, dpa.id, dpa.driverId, dryRun);
    pendingDeleted += pending;
    deactivated += 1;
  }

  console.log(
    `  cosculluela done: relinked=${relinked}, deactivated=${deactivated}, pending trips=${pendingDeleted}`,
  );
}

async function fixTrevinoUber(dryRun: boolean) {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "trevino" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("trevino not found");

  console.log("\n=== trevino Uber cleanup + import ===");
  let purged = 0;

  for (const ext of TREVINO_BADAVI_CLONE_UUIDS) {
    const dpa = await withoutTenant(
      (tx) =>
        tx.driverPlatformAccount.findFirst({
          where: {
            tenantId: tenant.id,
            platform: RidePlatform.UBER,
            externalDriverId: { equals: ext, mode: "insensitive" },
          },
          select: {
            id: true,
            driverId: true,
            isActive: true,
            driver: { select: { fullName: true } },
          },
        }),
      undefined,
      tenant.id,
    );
    if (!dpa) continue;
    console.log(
      `  purge BADAVI clone: ${dpa.driver.fullName} (${ext.slice(0, 8)}…) active=${dpa.isActive}`,
    );
    if (dryRun) {
      purged += 1;
      continue;
    }
    await withoutTenant(
      async (tx) => {
        await tx.trip.deleteMany({
          where: {
            tenantId: tenant.id,
            driverId: dpa.driverId,
            liquidationStatus: "pending",
          },
        });
        await tx.driverPlatformAccount.delete({ where: { id: dpa.id } });
        const otherPlatforms = await tx.driverPlatformAccount.count({
          where: { driverId: dpa.driverId },
        });
        if (otherPlatforms === 0) {
          await tx.driver.delete({ where: { id: dpa.driverId } });
        }
      },
      undefined,
      tenant.id,
    );
    purged += 1;
  }

  if (dryRun) {
    console.log(`  trevino purge (dry-run): would remove ${purged} clone row(s)`);
    console.log("  trevino import/link skipped in dry-run");
    return;
  }

  console.log(`  purged ${purged} BADAVI clone row(s)`);

  const imported = await importUberDriversForTenant(tenant.id);
  if (!imported.ok) {
    console.error("  import failed:", imported.message);
    return;
  }
  console.log(
    `  import: created=${imported.created}, linked=${imported.linked}, total API=${imported.total}, org=${imported.orgId.slice(0, 12)}…`,
  );

  // Import already upserts platform accounts; link pass is redundant and can hit unique constraints.
  if (imported.linked < imported.total) {
    const linked = await linkUberDriversForTenant(tenant.id);
    if (linked.message) {
      console.warn("  link warning:", linked.message);
    } else {
      console.log(`  link pass: +${linked.linked} name match(es), ${linked.uberDrivers} in org`);
    }
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "=== DRY RUN fix group stale uber ===" : "=== Fix group stale uber ===");

  const allUber = await fetchAllUberDrivers();
  console.log(`Uber API drivers across all orgs: ${allUber.length}`);

  await fixCosculluelaStale(dryRun, allUber);
  await fixTrevinoUber(dryRun);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
