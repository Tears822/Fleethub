/**
 * Compare authoritative group driver CSV vs DB per tenant.
 * Usage: tsx src/cli/compare-group-drivers-db.ts
 */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";
import {
  companiesForTenantSlug,
  GROUP_TENANT_COMPANY_BY_TAX_ID,
  normalizeTaxId,
} from "@fleethub/auth/group-tenant-company-map";
import { prisma, RidePlatform } from "@fleethub/db";
import {
  parseGroupDriverCsv,
  type GroupDriverSpreadsheetRow,
} from "../lib/group-driver-spreadsheet-import.js";

config({ path: path.resolve(process.cwd(), "../../.env") });

const GROUP_SLUGS = ["cosculluela", "trevino", "trade-taxi-sl"] as const;

const CSV_BY_SLUG: Partial<Record<(typeof GROUP_SLUGS)[number], string>> = {
  cosculluela: "fixtures/cosculluela-group-drivers.csv",
  "trade-taxi-sl": "fixtures/trade-taxi-sl-group-drivers.csv",
};

type ExpectedEntry = {
  fullName: string;
  dni: string | null;
  companyLegalName: string;
  companyTaxId: string;
  platform: RidePlatform;
  platformDriverId: string | null;
  email: string | null;
};

type DbDriver = {
  id: string;
  fullName: string;
  dni: string | null;
  isActive: boolean;
  companyLegalName: string;
  companyTaxId: string | null;
  uber: { active: boolean; externalId: string; source: string } | null;
  freenow: { active: boolean; externalId: string; source: string } | null;
};

function normName(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, " ");
}

function normDni(s: string | null | undefined): string {
  return (s ?? "").trim().toUpperCase();
}

function dpaSource(metadata: unknown): string {
  if (metadata && typeof metadata === "object" && "source" in metadata) {
    return String((metadata as { source?: unknown }).source ?? "").trim();
  }
  return "";
}

function expectedKey(e: ExpectedEntry): string {
  const dni = normDni(e.dni);
  return `${e.platform}|${normalizeTaxId(e.companyTaxId)}|${dni || normName(e.fullName)}`;
}

function dbKey(d: DbDriver, platform: RidePlatform): string | null {
  const dni = normDni(d.dni);
  const tax = normalizeTaxId(d.companyTaxId);
  if (!tax) return null;
  return `${platform}|${tax}|${dni || normName(d.fullName)}`;
}

async function loadExpectedForSlug(slug: (typeof GROUP_SLUGS)[number]): Promise<ExpectedEntry[]> {
  const rel = CSV_BY_SLUG[slug];
  if (!rel) return [];
  const content = await readFile(path.resolve(process.cwd(), rel), "utf8");
  return parseGroupDriverCsv(content).map((r) => ({
    fullName: r.fullName,
    dni: r.dni,
    companyLegalName: r.companyLegalName,
    companyTaxId: normalizeTaxId(r.companyTaxId),
    platform: r.platform,
    platformDriverId: r.platformDriverId,
    email: r.email,
  }));
}

async function loadDbDrivers(tenantId: string): Promise<DbDriver[]> {
  const rows = await prisma.driver.findMany({
    where: { tenantId },
    select: {
      id: true,
      fullName: true,
      dni: true,
      isActive: true,
      company: { select: { legalName: true, taxId: true } },
      driverPlatformAccounts: {
        where: { platform: { in: [RidePlatform.UBER, RidePlatform.FREENOW] } },
        select: { platform: true, externalDriverId: true, isActive: true, metadata: true },
      },
    },
    orderBy: { fullName: "asc" },
  });

  return rows.map((r) => {
    const uber = r.driverPlatformAccounts.find((a) => a.platform === RidePlatform.UBER);
    const freenow = r.driverPlatformAccounts.find((a) => a.platform === RidePlatform.FREENOW);
    return {
      id: r.id,
      fullName: r.fullName,
      dni: r.dni,
      isActive: r.isActive,
      companyLegalName: r.company.legalName,
      companyTaxId: r.company.taxId,
      uber: uber
        ? {
            active: uber.isActive,
            externalId: uber.externalDriverId,
            source: dpaSource(uber.metadata),
          }
        : null,
      freenow: freenow
        ? {
            active: freenow.isActive,
            externalId: freenow.externalDriverId,
            source: dpaSource(freenow.metadata),
          }
        : null,
    };
  });
}

function printPlatformBlock(
  slug: string,
  platform: RidePlatform,
  expected: ExpectedEntry[],
  db: DbDriver[],
) {
  const label = platform === RidePlatform.UBER ? "UBER" : "FREENOW";
  const exp = expected.filter((e) => e.platform === platform);
  const expByKey = new Map(exp.map((e) => [expectedKey(e), e]));

  const dbMatches: DbDriver[] = [];
  const dbExtra: DbDriver[] = [];
  for (const d of db) {
    const acc = platform === RidePlatform.UBER ? d.uber : d.freenow;
    if (!acc?.active) continue;
    const key = dbKey(d, platform);
    if (key && expByKey.has(key)) dbMatches.push(d);
    else dbExtra.push(d);
  }

  const matchedKeys = new Set(
    dbMatches.map((d) => dbKey(d, platform)).filter((k): k is string => k != null),
  );
  const missing = exp.filter((e) => !matchedKeys.has(expectedKey(e)));

  console.log(`\n  --- ${label} ---`);
  console.log(`  Expected (CSV): ${exp.length} | DB active: ${dbMatches.length + dbExtra.length} | Match: ${dbMatches.length} | Missing: ${missing.length} | Extra: ${dbExtra.length}`);

  if (missing.length > 0) {
    console.log("  MISSING (in CSV, not in DB with same CIF+DNI/name):");
    for (const m of missing) {
      console.log(
        `    - ${m.fullName} | ${m.companyLegalName} (${m.companyTaxId}) | ext ${m.platformDriverId?.slice(0, 12) ?? "—"}`,
      );
    }
  }

  if (dbExtra.length > 0) {
    console.log("  EXTRA (in DB, not in this tenant CSV):");
    for (const d of dbExtra) {
      const acc = platform === RidePlatform.UBER ? d.uber! : d.freenow!;
      console.log(
        `    - ${d.fullName} | ${d.companyLegalName} (${normalizeTaxId(d.companyTaxId)}) | ext ${acc.externalId.slice(0, 12)} | src ${acc.source || "(link)"}`,
      );
    }
  }

  // Wrong company: in CSV for this tenant but DB has different CIF
  for (const e of exp) {
    if (e.platform !== platform) continue;
    const byDni = e.dni
      ? db.find((d) => normDni(d.dni) === normDni(e.dni))
      : db.find((d) => normName(d.fullName) === normName(e.fullName));
    if (!byDni) continue;
    const acc = platform === RidePlatform.UBER ? byDni.uber : byDni.freenow;
    if (!acc?.active) continue;
    if (normalizeTaxId(byDni.companyTaxId) !== e.companyTaxId) {
      console.log(
        `  WRONG COMPANY: ${e.fullName} — CSV says ${e.companyLegalName} (${e.companyTaxId}), DB has ${byDni.companyLegalName} (${normalizeTaxId(byDni.companyTaxId)})`,
      );
    }
    if (e.platformDriverId && acc.externalId.toLowerCase() !== e.platformDriverId.toLowerCase()) {
      console.log(
        `  WRONG UBER ID: ${e.fullName} — CSV ${e.platformDriverId.slice(0, 12)}… vs DB ${acc.externalId.slice(0, 12)}…`,
      );
    }
  }
}

async function crossTenantUberDupes(tenantIds: Map<string, string>) {
  const rows = await prisma.driverPlatformAccount.findMany({
    where: {
      platform: RidePlatform.UBER,
      isActive: true,
      tenantId: { in: [...tenantIds.values()] },
      externalDriverId: { not: { startsWith: "seed-" } },
    },
    select: {
      externalDriverId: true,
      tenantId: true,
      metadata: true,
      driver: {
        select: {
          fullName: true,
          company: { select: { legalName: true, taxId: true } },
        },
      },
    },
  });

  const slugById = new Map([...tenantIds.entries()].map(([slug, id]) => [id, slug]));
  const byExt = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.externalDriverId.trim().toLowerCase();
    const list = byExt.get(k) ?? [];
    list.push(r);
    byExt.set(k, list);
  }

  console.log("\n=== Cross-tenant Uber duplicates (same UUID, multiple tenants) ===");
  let count = 0;
  for (const [ext, list] of byExt) {
    const slugs = new Set(list.map((r) => slugById.get(r.tenantId)).filter(Boolean));
    if (slugs.size < 2) continue;
    count += 1;
    const detail = list
      .map((r) => {
        const slug = slugById.get(r.tenantId);
        const src = dpaSource(r.metadata) || "link";
        return `${slug}:${r.driver.fullName}@${r.driver.company.legalName}(${src})`;
      })
      .join(" | ");
    console.log(`  ${ext.slice(0, 12)}… → ${detail}`);
  }
  console.log(`Total shared Uber UUIDs across tenants: ${count}`);
}

async function main() {
  console.log("=== Authoritative CSV vs DB — group tenants ===\n");

  const tenants = await prisma.tenant.findMany({
    where: { slug: { in: [...GROUP_SLUGS] } },
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  const tenantIds = new Map(tenants.map((t) => [t.slug, t.id] as const));

  for (const slug of GROUP_SLUGS) {
    const tenant = tenants.find((t) => t.slug === slug);
    if (!tenant) continue;

    const expected = await loadExpectedForSlug(slug);
    const db = await loadDbDrivers(tenant.id);
    const activeDb = db.filter((d) => d.isActive);

    console.log(`\n${"=".repeat(72)}`);
    console.log(`${slug.toUpperCase()} — ${tenant.name}`);
    console.log("=".repeat(72));

    if (CSV_BY_SLUG[slug]) {
      console.log(`CSV: ${CSV_BY_SLUG[slug]} (${expected.length} rows)`);
    } else {
      console.log("CSV: (no fixture — authoritative companies from group-tenant-company-map)");
      for (const c of companiesForTenantSlug(slug)) {
        console.log(`  - ${c.legalName} (${Object.entries(GROUP_TENANT_COMPANY_BY_TAX_ID).find(([k]) => normalizeTaxId(k) && companiesForTenantSlug(slug).some((x) => x.legalName === c.legalName))?.[0] ?? "?"})`);
      }
    }

    console.log(`DB: ${db.length} drivers total, ${activeDb.length} active`);
    console.log(
      `DB companies: ${[...new Set(db.map((d) => `${d.companyLegalName} (${normalizeTaxId(d.companyTaxId)})`))].join("; ")}`,
    );

    if (expected.length > 0) {
      printPlatformBlock(slug, RidePlatform.UBER, expected, db);
      printPlatformBlock(slug, RidePlatform.FREENOW, expected, db);
    } else {
      const uberActive = db.filter((d) => d.uber?.active);
      const fnActive = db.filter((d) => d.freenow?.active);
      console.log(`\n  Active UBER in DB: ${uberActive.length}`);
      for (const d of uberActive) {
        console.log(
          `    - ${d.fullName} | ${d.companyLegalName} (${normalizeTaxId(d.companyTaxId)}) | ${d.uber!.externalId.slice(0, 12)} | ${d.uber!.source || "link"}`,
        );
      }
      console.log(`\n  Active FREENOW in DB: ${fnActive.length}`);
      for (const d of fnActive) {
        console.log(
          `    - ${d.fullName} | ${d.companyLegalName} (${normalizeTaxId(d.companyTaxId)}) | ${d.freenow!.externalId.slice(0, 12)} | ${d.freenow!.source || "link"}`,
        );
      }
    }
  }

  await crossTenantUberDupes(tenantIds);

  // Overlap: same person in multiple tenant CSVs (Uber)
  const cosExpected = await loadExpectedForSlug("cosculluela");
  const tradeExpected = await loadExpectedForSlug("trade-taxi-sl");
  const cosUber = cosExpected.filter((e) => e.platform === RidePlatform.UBER && e.platformDriverId);
  const tradeUber = tradeExpected.filter((e) => e.platform === RidePlatform.UBER && e.platformDriverId);

  console.log("\n=== Same Uber UUID in BOTH cosculluela + trade-taxi CSVs ===");
  for (const t of tradeUber) {
    const ext = t.platformDriverId!.toLowerCase();
    const inCos = cosUber.find((c) => c.platformDriverId?.toLowerCase() === ext);
    if (inCos) {
      console.log(
        `  ${t.fullName}: trade-taxi=${t.companyLegalName} (${t.companyTaxId}) vs cosculluela=${inCos.companyLegalName} (${inCos.companyTaxId}) | UUID ${ext.slice(0, 12)}…`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
