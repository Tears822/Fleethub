/**
 * Purge orphan clone drivers + merge same-person duplicates (split Uber/FreeNow rows).
 *
 * Usage:
 *   npx tsx src/cli/fix-group-driver-duplicates.ts [--dry-run] [slug...]
 */
import "../load-env.js";
import { prisma, RidePlatform, withoutTenant } from "@fleethub/db";
import { DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG } from "../lib/freenow-tenant-company-map.js";

const DEFAULT_SLUGS = ["trevino", "cosculluela", "trade-taxi-sl"] as const;

function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const val =
        a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], row[j], prev) + 1;
      row[j - 1] = prev;
      prev = val;
    }
    row[b.length] = prev;
  }
  return row[b.length];
}

function namesLikelySame(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const tokensA = a.trim().split(/\s+/);
  const tokensB = b.trim().split(/\s+/);
  if (tokensA.length < 2 || tokensB.length < 2) return false;
  const firstA = normalizeName(tokensA[0]);
  const firstB = normalizeName(tokensB[0]);
  const lastA = normalizeName(tokensA[tokensA.length - 1]);
  const lastB = normalizeName(tokensB[tokensB.length - 1]);
  if (lastA !== lastB && levenshtein(lastA, lastB) > 2) return false;
  return firstA === firstB || levenshtein(firstA, firstB) <= 1;
}

function freenowCompanyFromMeta(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const v = (metadata as { freenowPublicCompanyId?: unknown }).freenowPublicCompanyId;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type DriverBundle = {
  id: string;
  fullName: string;
  isActive: boolean;
  email: string | null;
  dni: string | null;
  companyId: string;
  tripCount: number;
  activePlatforms: number;
  dpas: Array<{
    id: string;
    platform: RidePlatform;
    isActive: boolean;
    externalDriverId: string;
    metadata: unknown;
  }>;
};

function keeperScore(d: DriverBundle): number {
  return d.tripCount * 100 + d.activePlatforms * 10 + (d.fullName === d.fullName.toUpperCase() ? 1 : 0);
}

async function loadBundles(tenantId: string): Promise<DriverBundle[]> {
  const rows = await withoutTenant(
    (tx) =>
      tx.driver.findMany({
        where: { tenantId },
        select: {
          id: true,
          fullName: true,
          isActive: true,
          email: true,
          dni: true,
          companyId: true,
          _count: { select: { trips: true } },
          driverPlatformAccounts: {
            select: {
              id: true,
              platform: true,
              isActive: true,
              externalDriverId: true,
              metadata: true,
            },
          },
        },
      }),
    undefined,
    tenantId,
  );

  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    isActive: r.isActive,
    email: r.email,
    dni: r.dni,
    companyId: r.companyId,
    tripCount: r._count.trips,
    activePlatforms: r.driverPlatformAccounts.filter((a) => a.isActive).length,
    dpas: r.driverPlatformAccounts,
  }));
}

async function purgeOrphan(
  tenantId: string,
  slug: string,
  d: DriverBundle,
  dryRun: boolean,
): Promise<boolean> {
  const tenantFnId = DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG[slug as keyof typeof DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG];
  const wrongFnCompany = d.dpas.some((a) => {
    const cid = freenowCompanyFromMeta(a.metadata);
    return cid && tenantFnId && cid !== tenantFnId;
  });

  const purge =
    !d.isActive &&
    d.activePlatforms === 0 &&
    d.tripCount === 0 &&
    (wrongFnCompany || d.dpas.length > 0 || d.fullName === d.fullName.toUpperCase());

  if (!purge) return false;

  console.log(`  PURGE orphan ${d.fullName} (${d.dpas.map((a) => a.platform).join("+") || "no dpa"})`);
  if (dryRun) return true;

  await withoutTenant(
    async (tx) => {
      await tx.driverPlatformAccount.deleteMany({ where: { driverId: d.id } });
      await tx.driver.delete({ where: { id: d.id } });
    },
    undefined,
    tenantId,
  );
  return true;
}

async function mergeDonorIntoKeeper(
  tenantId: string,
  keeper: DriverBundle,
  donor: DriverBundle,
  dryRun: boolean,
): Promise<void> {
  const movePlatforms = donor.dpas
    .filter((a) => a.isActive)
    .map((a) => a.platform)
    .filter((p) => !keeper.dpas.some((k) => k.platform === p && k.isActive));

  console.log(
    `  MERGE ${donor.fullName} → ${keeper.fullName}` +
      (movePlatforms.length ? ` (+${movePlatforms.join("+")})` : "") +
      ` trips=${donor.tripCount}`,
  );
  if (dryRun) return;

  await withoutTenant(
    async (tx) => {
      if (donor.tripCount > 0) {
        await tx.trip.updateMany({
          where: { tenantId, driverId: donor.id },
          data: { driverId: keeper.id },
        });
      }

      const keeperRow = await tx.driver.findUnique({
        where: { id: keeper.id },
        select: { dni: true, email: true },
      });

      if (keeperRow) {
        await tx.driver.update({
          where: { id: keeper.id },
          data: {
            isActive: true,
            ...(donor.dni?.trim() && !keeperRow.dni?.trim() ? { dni: donor.dni.trim() } : {}),
            ...(donor.email?.trim() && !keeperRow.email?.trim()
              ? { email: donor.email.trim() }
              : {}),
          },
        });
      }

      for (const acc of donor.dpas) {
        const keeperAcc = await tx.driverPlatformAccount.findFirst({
          where: { tenantId, driverId: keeper.id, platform: acc.platform },
        });
        if (!keeperAcc) {
          await tx.driverPlatformAccount.update({
            where: { id: acc.id },
            data: { driverId: keeper.id, isActive: acc.isActive || undefined },
          });
          continue;
        }
        if (!keeperAcc.isActive && acc.isActive) {
          await tx.driverPlatformAccount.update({
            where: { id: keeperAcc.id },
            data: {
              externalDriverId: acc.externalDriverId,
              isActive: true,
              metadata: acc.metadata ?? keeperAcc.metadata,
            },
          });
          await tx.driverPlatformAccount.delete({ where: { id: acc.id } });
        } else {
          await tx.driverPlatformAccount.delete({ where: { id: acc.id } });
        }
      }

      await tx.driver.delete({ where: { id: donor.id } });
    },
    undefined,
    tenantId,
  );
}

async function fixTenant(slug: string, dryRun: boolean) {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true, name: true } }),
  );
  if (!tenant) {
    console.warn(`skip ${slug}: not found`);
    return;
  }

  console.log(`\n=== ${slug} (${tenant.name}) ===`);
  let purged = 0;
  let merged = 0;

  let bundles = await loadBundles(tenant.id);

  for (const d of [...bundles]) {
    if (await purgeOrphan(tenant.id, slug, d, dryRun)) purged += 1;
  }

  bundles = dryRun ? bundles : await loadBundles(tenant.id);

  const usedDonor = new Set<string>();
  for (let i = 0; i < bundles.length; i++) {
    for (let j = i + 1; j < bundles.length; j++) {
      const a = bundles[i]!;
      const b = bundles[j]!;
      if (a.companyId !== b.companyId) continue;
      if (!namesLikelySame(a.fullName, b.fullName)) continue;
      if (usedDonor.has(a.id) || usedDonor.has(b.id)) continue;

      const keeper = keeperScore(a) >= keeperScore(b) ? a : b;
      const donor = keeper === a ? b : a;
      if (keeper.id === donor.id) continue;

      // Skip if both have same active platform set already
      const keeperPlats = new Set(
        keeper.dpas.filter((d) => d.isActive).map((d) => d.platform),
      );
      const donorPlats = donor.dpas.filter((d) => d.isActive).map((d) => d.platform);
      const addsPlatform = donorPlats.some((p) => !keeperPlats.has(p));
      const donorIsOrphan = donor.activePlatforms === 0 && donor.tripCount === 0;
      if (!addsPlatform && !donorIsOrphan && keeper.activePlatforms > 0) continue;

      await mergeDonorIntoKeeper(tenant.id, keeper, donor, dryRun);
      usedDonor.add(donor.id);
      merged += 1;
    }
  }

  console.log(`  done: purged=${purged}, merged=${merged}`);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const slugs = process.argv.slice(2).filter((a) => a !== "--dry-run");
  const targets = slugs.length > 0 ? slugs : [...DEFAULT_SLUGS];

  console.log(dryRun ? "=== DRY RUN fix group driver duplicates ===" : "=== Fix group driver duplicates ===");

  for (const slug of targets) {
    await fixTenant(slug, dryRun);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
