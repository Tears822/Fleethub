/**
 * Find duplicate-name drivers and active drivers with no platform link.
 * Usage: npx tsx src/cli/audit-no-platform-drivers.ts [slug...]
 */
import "../load-env.js";
import { withoutTenant } from "@fleethub/db";

const DEFAULT_SLUGS = ["trevino", "cosculluela", "trade-taxi-sl"] as const;

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function firstLastKey(name: string): string | null {
  const parts = normalizeName(name).split(" ").filter((t) => t.length > 1);
  if (parts.length < 2) return null;
  return `${parts[0]}|${parts[parts.length - 1]}`;
}

type DriverRow = {
  id: string;
  fullName: string;
  isActive: boolean;
  email: string | null;
  dni: string | null;
  company: string;
  uber: { active: boolean; ext: string } | null;
  freenow: { active: boolean; ext: string } | null;
};

async function loadDrivers(slug: string): Promise<DriverRow[]> {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug }, select: { id: true } }),
  );
  if (!tenant) return [];

  const rows = await withoutTenant(
    (tx) =>
      tx.driver.findMany({
        where: { tenantId: tenant.id },
        select: {
          id: true,
          fullName: true,
          isActive: true,
          email: true,
          dni: true,
          company: { select: { legalName: true } },
          driverPlatformAccounts: {
            select: { platform: true, isActive: true, externalDriverId: true },
          },
        },
        orderBy: { fullName: "asc" },
      }),
    undefined,
    tenant.id,
  );

  return rows.map((r) => {
    const uber = r.driverPlatformAccounts.find((a) => a.platform === "UBER");
    const freenow = r.driverPlatformAccounts.find((a) => a.platform === "FREENOW");
    return {
      id: r.id,
      fullName: r.fullName,
      isActive: r.isActive,
      email: r.email,
      dni: r.dni,
      company: r.company.legalName,
      uber: uber
        ? { active: uber.isActive, ext: uber.externalDriverId }
        : null,
      freenow: freenow
        ? { active: freenow.isActive, ext: freenow.externalDriverId }
        : null,
    };
  });
}

function hasActivePlatform(d: DriverRow): boolean {
  return !!(d.uber?.active || d.freenow?.active);
}

function platformLabel(d: DriverRow): string {
  const parts: string[] = [];
  if (d.uber?.active) parts.push(`UBER:${d.uber.ext.slice(0, 8)}`);
  else if (d.uber) parts.push(`uber(inactive)`);
  if (d.freenow?.active) parts.push(`FN:${d.freenow.ext.slice(0, 8)}`);
  else if (d.freenow) parts.push(`fn(inactive)`);
  return parts.length ? parts.join(" ") : "—";
}

async function auditSlug(slug: string) {
  const drivers = await loadDrivers(slug);
  console.log(`\n=== ${slug} (${drivers.length} drivers) ===`);

  const noPlatform = drivers.filter((d) => d.isActive && !hasActivePlatform(d));
  console.log(`\nActive, no platform (${noPlatform.length}):`);
  for (const d of noPlatform) {
    console.log(
      `  ${d.fullName} | ${d.company} | inactive: ${platformLabel(d)} | id=${d.id.slice(0, 8)}`,
    );
  }

  const inactiveWithStale = drivers.filter((d) => !d.isActive && (d.uber || d.freenow));
  const visibleStale = inactiveWithStale.filter((d) => !hasActivePlatform(d));
  if (visibleStale.length > 0) {
    console.log(`\nInactive, stale platform rows (${visibleStale.length}):`);
    for (const d of visibleStale.slice(0, 15)) {
      console.log(`  ${d.fullName} | ${platformLabel(d)}`);
    }
    if (visibleStale.length > 15) console.log(`  … +${visibleStale.length - 15} more`);
  }

  const byFirstLast = new Map<string, DriverRow[]>();
  for (const d of drivers) {
    const key = firstLastKey(d.fullName);
    if (!key) continue;
    const list = byFirstLast.get(key) ?? [];
    list.push(d);
    byFirstLast.set(key, list);
  }

  console.log("\nPossible duplicates (same first+last):");
  let dupCount = 0;
  for (const [key, group] of [...byFirstLast.entries()].sort()) {
    if (group.length < 2) continue;
    dupCount += 1;
    console.log(`  [${key}]`);
    for (const d of group) {
      console.log(
        `    ${d.fullName} active=${d.isActive} platforms=${platformLabel(d)} id=${d.id.slice(0, 8)}`,
      );
    }
  }
  if (dupCount === 0) console.log("  (none)");
}

async function main() {
  const slugs = process.argv.slice(2).filter(Boolean);
  const targets = slugs.length > 0 ? slugs : [...DEFAULT_SLUGS];
  for (const slug of targets) {
    await auditSlug(slug);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
