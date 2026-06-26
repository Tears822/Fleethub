/**
 * Merge Uber-import stubs (DNI, 0 trips, short FN id) into FreeNow operational drivers.
 *
 *   npm run merge:sync-duplicate-drivers -w @fleethub/worker -- cosculluela --dry-run
 *   npm run merge:sync-duplicate-drivers -w @fleethub/worker -- cosculluela
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma, withoutTenant } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function namesLikelySame(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 10 && nb.length >= 10 && na.slice(0, 10) === nb.slice(0, 10)) return true;

  const tokensA = a.trim().split(/\s+/);
  const tokensB = b.trim().split(/\s+/);
  if (tokensA.length < 2 || tokensB.length < 2) return false;
  const firstA = normalizeName(tokensA[0]);
  const firstB = normalizeName(tokensB[0]);
  const lastA = normalizeName(tokensA[tokensA.length - 1]);
  const lastB = normalizeName(tokensB[tokensB.length - 1]);
  return firstA === firstB && lastA === lastB;
}

function isShortFreenowStub(externalDriverId: string): boolean {
  const id = externalDriverId.trim();
  return id.length > 0 && id.length <= 8 && !id.startsWith("GY");
}

type DriverRow = {
  id: string;
  fullName: string;
  dni: string | null;
  companyId: string;
  tripCount: number;
  externalIds: string[];
};

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const dryRun = process.argv.includes("--dry-run");

  if (!tenantSlug) {
    console.error("Usage: merge-sync-duplicate-drivers.ts <tenant-slug> [--dry-run]");
    process.exit(1);
  }

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true } }),
  );
  if (!tenant) {
    console.error("Tenant not found:", tenantSlug);
    process.exit(1);
  }

  const rows = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: {
        id: true,
        fullName: true,
        dni: true,
        companyId: true,
        _count: { select: { trips: true } },
        driverPlatformAccounts: { select: { externalDriverId: true } },
      },
    }),
  );

  const drivers: DriverRow[] = rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    dni: r.dni,
    companyId: r.companyId,
    tripCount: r._count.trips,
    externalIds: r.driverPlatformAccounts.map((a) => a.externalDriverId),
  }));

  const merges: { keeper: DriverRow; donor: DriverRow; dni: string }[] = [];

  for (let i = 0; i < drivers.length; i++) {
    for (let j = i + 1; j < drivers.length; j++) {
      const a = drivers[i];
      const b = drivers[j];
      if (a.companyId !== b.companyId) continue;

      const keeper = a.tripCount >= b.tripCount ? a : b;
      const donor = keeper === a ? b : a;
      if (keeper.tripCount === 0 && donor.tripCount === 0) continue;

      const keeperNoDni = !keeper.dni?.trim();
      const donorHasDni = Boolean(donor.dni?.trim());
      if (!keeperNoDni || !donorHasDni) continue;
      if (donor.tripCount > 0) continue;
      if (!namesLikelySame(keeper.fullName, donor.fullName)) continue;

      const donorStub =
        donor.externalIds.length === 0 ||
        donor.externalIds.every((id) => isShortFreenowStub(id) || id.includes("-"));
      if (!donorStub) continue;

      merges.push({ keeper, donor, dni: donor.dni!.trim() });
    }
  }

  // Drop duplicate merge targets (same donor)
  const seenDonor = new Set<string>();
  const uniqueMerges = merges.filter((m) => {
    if (seenDonor.has(m.donor.id)) return false;
    seenDonor.add(m.donor.id);
    return true;
  });

  console.log(`=== Merge sync duplicate drivers — ${tenant.name} (${tenantSlug}) ===`);
  console.log("Dry run:", dryRun);
  console.log("Merges:", uniqueMerges.length);

  for (const m of uniqueMerges) {
    console.log(
      `MERGE DNI ${m.dni} | keep ${m.keeper.fullName} (${m.keeper.tripCount} trips) ← remove ${m.donor.fullName}`,
    );
  }

  if (!dryRun && uniqueMerges.length > 0) {
    for (const m of uniqueMerges) {
      await withoutTenant(async (tx) => {
        await tx.driver.update({
          where: { id: m.keeper.id },
          data: { dni: m.dni },
        });
        await tx.driver.delete({ where: { id: m.donor.id } });
      }, undefined, tenant.id);
    }
    console.log("Merged:", uniqueMerges.length);
  }

  const active = await withoutTenant((tx) =>
    tx.driver.count({ where: { tenantId: tenant.id, isActive: true } }),
  );
  const noDni = await withoutTenant((tx) =>
    tx.driver.count({
      where: { tenantId: tenant.id, isActive: true, OR: [{ dni: null }, { dni: "" }] },
    }),
  );
  console.log("Active drivers:", active, "| without DNI:", noDni);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
