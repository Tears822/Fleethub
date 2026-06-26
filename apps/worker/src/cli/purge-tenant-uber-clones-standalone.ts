/**
 * Standalone Uber clone purge (no @fleethub/* workspace deps).
 * Usage: cd apps/worker && npx tsx src/cli/purge-tenant-uber-clones-standalone.ts [--dry-run]
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import { PrismaClient, RidePlatform } from "@prisma/client";
import {
  normalizeTaxId,
  tenantSlugForTaxId,
} from "../../../../packages/auth/src/group-tenant-company-map.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

const prisma = new PrismaClient();
const GROUP_SLUGS = ["cosculluela", "trevino", "trade-taxi-sl"] as const;

const CSV_BY_SLUG: Partial<Record<(typeof GROUP_SLUGS)[number], string>> = {
  cosculluela: "fixtures/cosculluela-group-drivers.csv",
  "trade-taxi-sl": "fixtures/trade-taxi-sl-group-drivers.csv",
};

type CsvUberRow = { platformDriverId: string; companyTaxId: string; tenantSlug: string };

function parseCsvUberRows(content: string, defaultSlug: string): CsvUberRow[] {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const cols: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cols.push(cur.trim());
        cur = "";
      } else cur += ch;
    }
    cols.push(cur.trim());
    return cols;
  };
  const headers = parseLine(lines[0]!).map((h) => h.toLowerCase());
  const idx = (name: string) => headers.indexOf(name);
  const out: CsvUberRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]!);
    if (cols[idx("platform")]?.toLowerCase() !== "uber") continue;
    const uuid = (cols[idx("platformdriverid")] ?? "").trim();
    if (!uuid) continue;
    const taxId = normalizeTaxId(cols[idx("companytaxid")] ?? "");
    out.push({
      platformDriverId: uuid,
      companyTaxId: taxId,
      tenantSlug: tenantSlugForTaxId(taxId) ?? defaultSlug,
    });
  }
  return out;
}

type DpaRow = {
  tenantId: string;
  slug: string;
  dpaId: string;
  driverId: string;
  source: string;
  companyTaxId: string | null;
};

type CsvCanonical = { tenantSlug: string; companyTaxId: string };

function dpaSource(metadata: unknown): string {
  if (metadata && typeof metadata === "object" && "source" in metadata) {
    return String((metadata as { source?: unknown }).source ?? "").trim();
  }
  return "";
}

async function loadCsvCanonicalByExt(): Promise<Map<string, CsvCanonical>> {
  const byExt = new Map<string, CsvCanonical>();
  for (const slug of ["cosculluela", "trade-taxi-sl"] as const) {
    const rel = CSV_BY_SLUG[slug];
    if (!rel) continue;
    const content = await readFile(path.resolve(process.cwd(), rel), "utf8");
    for (const row of parseCsvUberRows(content, slug)) {
      const ext = row.platformDriverId.trim().toLowerCase();
      byExt.set(ext, { tenantSlug: row.tenantSlug, companyTaxId: row.companyTaxId });
    }
  }
  return byExt;
}

function canonicalRow(rows: DpaRow[], csvCanonical: CsvCanonical | undefined): DpaRow {
  if (csvCanonical) {
    const match = rows.find((r) => r.slug === csvCanonical.tenantSlug);
    if (match) return match;
  }
  const score = (r: DpaRow): number => {
    const intended = tenantSlugForTaxId(r.companyTaxId);
    if (intended && intended === r.slug) return 90;
    if (r.source === "group_spreadsheet") return 70;
    if (r.source && r.source !== "uber_import") return 50;
    if (r.slug === "cosculluela") return 40;
    if (r.slug === "trade-taxi-sl") return 30;
    return 10;
  };
  return rows.reduce((best, r) => (score(r) > score(best) ? r : best));
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const csvCanonicalByExt = await loadCsvCanonicalByExt();

  const allGroupTenants = await prisma.tenant.findMany({
    where: { slug: { in: [...GROUP_SLUGS] } },
    select: { id: true, slug: true },
  });

  const byExternal = new Map<string, DpaRow[]>();
  for (const tenant of allGroupTenants) {
    const rows = await prisma.driverPlatformAccount.findMany({
      where: {
        tenantId: tenant.id,
        platform: RidePlatform.UBER,
        isActive: true,
        externalDriverId: { not: { startsWith: "seed-" } },
      },
      select: {
        id: true,
        externalDriverId: true,
        driverId: true,
        metadata: true,
        driver: { select: { company: { select: { taxId: true } } } },
      },
    });
    for (const row of rows) {
      const ext = row.externalDriverId.trim().toLowerCase();
      const list = byExternal.get(ext) ?? [];
      list.push({
        tenantId: tenant.id,
        slug: tenant.slug,
        dpaId: row.id,
        driverId: row.driverId,
        source: dpaSource(row.metadata),
        companyTaxId: row.driver.company.taxId,
      });
      byExternal.set(ext, list);
    }
  }

  const clones: Array<DpaRow & { externalDriverId: string; canonicalSlug: string }> = [];
  for (const [ext, rows] of byExternal) {
    if (rows.length < 2) continue;
    const canonical = canonicalRow(rows, csvCanonicalByExt.get(ext));
    for (const row of rows) {
      if (row.dpaId === canonical.dpaId) continue;
      clones.push({ ...row, externalDriverId: ext, canonicalSlug: canonical.slug });
    }
  }

  console.log(dryRun ? "=== DRY RUN ===" : "=== APPLY ===");
  console.log(`Clone rows to remove: ${clones.length}`);

  let deactivatedDrivers = 0;
  let deactivatedDpas = 0;
  let deletedPendingTrips = 0;

  for (const clone of clones) {
    const driver = await prisma.driver.findUnique({
      where: { id: clone.driverId },
      select: { fullName: true },
    });
    const pendingCount = await prisma.trip.count({
      where: {
        tenantId: clone.tenantId,
        driverId: clone.driverId,
        liquidationStatus: "pending",
      },
    });
    console.log(
      `  ${clone.slug}: ${driver?.fullName ?? clone.driverId} (${clone.externalDriverId.slice(0, 8)}…, ${clone.source}) → keep in ${clone.canonicalSlug}, pending ${pendingCount}`,
    );

    if (dryRun) {
      deactivatedDrivers += 1;
      deactivatedDpas += 1;
      deletedPendingTrips += pendingCount;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const del = await tx.trip.deleteMany({
        where: {
          tenantId: clone.tenantId,
          driverId: clone.driverId,
          liquidationStatus: "pending",
        },
      });
      deletedPendingTrips += del.count;
      await tx.driverPlatformAccount.update({
        where: { id: clone.dpaId },
        data: { isActive: false },
      });
      deactivatedDpas += 1;
      await tx.driver.update({
        where: { id: clone.driverId },
        data: { isActive: false },
      });
      deactivatedDrivers += 1;
    });
  }

  console.log(
    `\nDone: drivers=${deactivatedDrivers}, dpas=${deactivatedDpas}, pending trips deleted=${deletedPendingTrips}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
