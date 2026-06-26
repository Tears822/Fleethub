/**
 * Remove inactive driver stubs that duplicate an active driver (same company, same person).
 * Moves platform accounts and DNI/email onto the active record when missing.
 *
 *   npm run dedupe:inactive-drivers -w @fleethub/worker -- trevino --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import { RidePlatform, prisma, withoutTenant } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });

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
  if (lastA === lastB) {
    return firstA === firstB || levenshtein(firstA, firstB) <= 1;
  }
  if (firstA !== firstB && levenshtein(firstA, firstB) > 1) return false;
  return levenshtein(lastA, lastB) <= 3;
}

async function main() {
  const tenantSlug = process.argv[2]?.trim();
  const dryRun = process.argv.includes("--dry-run");

  if (!tenantSlug) {
    console.error("Usage: dedupe-inactive-drivers.ts <tenant-slug> [--dry-run]");
    process.exit(1);
  }

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, name: true } }),
  );
  if (!tenant) {
    console.error("Tenant not found:", tenantSlug);
    process.exit(1);
  }

  const active = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: { tenantId: tenant.id, isActive: true },
      select: {
        id: true,
        fullName: true,
        companyId: true,
        dni: true,
        email: true,
        driverPlatformAccounts: { select: { platform: true } },
      },
    }),
  );

  const inactive = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: { tenantId: tenant.id, isActive: false },
      select: {
        id: true,
        fullName: true,
        companyId: true,
        dni: true,
        email: true,
        driverPlatformAccounts: {
          select: { id: true, platform: true, externalDriverId: true, isActive: true },
        },
      },
    }),
  );

  const actions: string[] = [];

  for (const donor of inactive) {
    const keeper = active.find(
      (a) => a.companyId === donor.companyId && namesLikelySame(a.fullName, donor.fullName),
    );
    if (!keeper) continue;

    const keeperPlatforms = new Set(keeper.driverPlatformAccounts.map((a) => a.platform));
    const moveAccounts = donor.driverPlatformAccounts.filter(
      (a) => !keeperPlatforms.has(a.platform),
    );
    const copyDni = donor.dni?.trim() && !keeper.dni?.trim() ? donor.dni.trim() : null;
    const copyEmail = donor.email?.trim() && !keeper.email?.trim() ? donor.email.trim() : null;

    actions.push(
      `REMOVE inactive «${donor.fullName}» → keep «${keeper.fullName}»` +
        (moveAccounts.length ? ` | move ${moveAccounts.map((a) => a.platform).join("+")}` : "") +
        (copyDni ? ` | DNI ${copyDni}` : "") +
        (copyEmail ? ` | email` : ""),
    );

    if (!dryRun) {
      await withoutTenant(async (tx) => {
        if (copyDni || copyEmail) {
          await tx.driver.update({
            where: { id: keeper.id },
            data: {
              ...(copyDni ? { dni: copyDni } : {}),
              ...(copyEmail ? { email: copyEmail } : {}),
            },
          });
        }
        for (const acc of moveAccounts) {
          const conflict = await tx.driverPlatformAccount.findFirst({
            where: {
              tenantId: tenant.id,
              platform: acc.platform,
              externalDriverId: acc.externalDriverId,
            },
          });
          if (conflict && conflict.driverId !== keeper.id) {
            await tx.driverPlatformAccount.delete({ where: { id: acc.id } });
          } else {
            await tx.driverPlatformAccount.update({
              where: { id: acc.id },
              data: { driverId: keeper.id },
            });
          }
        }
        await tx.driver.delete({ where: { id: donor.id } });
      }, undefined, tenant.id);
    }
  }

  console.log(`=== Dedupe inactive drivers — ${tenant.name} (${tenantSlug}) ===`);
  console.log("Dry run:", dryRun);
  console.log("Actions:", actions.length);
  for (const line of actions) console.log(" -", line);

  if (!dryRun) {
    const remainingInactive = await withoutTenant((tx) =>
      tx.driver.count({ where: { tenantId: tenant.id, isActive: false } }),
    );
    console.log("Inactive drivers remaining:", remainingInactive);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
