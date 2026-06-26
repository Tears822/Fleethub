/**
 * Verify group tenant platform IDs in DB + live API fetch scope.
 * Usage: npx tsx src/cli/run-with-worker-uber-env.ts src/cli/verify-group-tenant-platform-fetch.ts
 */
import "../load-env.js";
import { getTenantIntegrationSettings } from "@fleethub/auth";
import { withoutTenant } from "@fleethub/db";
import { DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG } from "../lib/freenow-tenant-company-map.js";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { freenowLinkedCompanyName, listFreenowLinkedCompanies } from "../lib/freenow-client.js";
import {
  resolveTenantFreenowPublicCompanyIds,
} from "../lib/freenow-company-map.js";
import {
  resolveTenantFreenowPublicCompanyId,
  resolveTenantUberOrgId,
} from "../lib/tenant-platform-config.js";
import {
  listAllUberDrivers,
  listUberOrganizations,
  resolveUberOrgForTenantSlug,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";
import { fetchUberTripActivityRows } from "../lib/uber-reports.js";
import { DEFAULT_UBER_ORG_BY_TENANT_SLUG } from "../lib/uber-tenant-org-map.js";

const SLUGS = ["cosculluela", "trade-taxi-sl", "trevino"] as const;
const BADAVI_ORG_ID = DEFAULT_UBER_ORG_BY_TENANT_SLUG.cosculluela!.orgId;

type UberVerify = {
  syncOrgId: string;
  syncOrgName: string;
  expectedOrgId: string;
  matchesExpectedOrg: boolean;
  usesBadaviUmbrella: boolean;
  apiDriverCount: number;
  tripActivityRows7d: number;
  dbActiveUberDrivers: number;
  dbInSyncOrg: number;
  dbMissingFromSyncOrg: number;
  dbOnlyInBadaviOrg: number;
  dbInWrongTenantOrg: number;
  uberWarnings: string[];
  sampleDrivers: string[];
};

type Row = {
  slug: string;
  ok: boolean;
  issues: string[];
  freenowSettings: string;
  freenowResolved: string;
  freenowSyncIds: string[];
  freenowBookings: number;
  uber: UberVerify;
};

async function countFreenowBookings(publicCompanyId: string, days = 3): Promise<number> {
  const to = new Date();
  const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  const listed = await listFreenowCompanyBookings({ publicCompanyId, from, to });
  return listed.ok ? listed.bookings.length : -1;
}

async function driverIdSet(orgId: string): Promise<Set<string>> {
  const drivers = await listAllUberDrivers(orgId);
  if (!drivers.ok) return new Set();
  const ids = new Set<string>();
  for (const d of drivers.data) {
    const id = uberDriverExternalId(d);
    if (id) ids.add(id.toLowerCase());
  }
  return ids;
}

/** All Uber sub-orgs under the shared umbrella except Tradetaxi / Treviño. */
async function cosculluelaGroupDriverIds(): Promise<Set<string>> {
  const orgs = await listUberOrganizations();
  if (!orgs.ok) return new Set();
  const allowed = new Set<string>();
  const blocked = ["tradetaxi", "taxi business"];
  for (const org of orgs.data) {
    const name = (org.name ?? "").toLowerCase();
    if (blocked.some((b) => name.includes(b))) continue;
    const ids = await driverIdSet(org.id);
    for (const id of ids) allowed.add(id);
  }
  return allowed;
}

async function forbiddenUberDriverIds(): Promise<Set<string>> {
  const forbidden = new Set<string>();
  for (const slug of ["trade-taxi-sl", "trevino"] as const) {
    const ref = DEFAULT_UBER_ORG_BY_TENANT_SLUG[slug];
    if (!ref) continue;
    const ids = await driverIdSet(ref.orgId);
    for (const id of ids) forbidden.add(id);
  }
  return forbidden;
}

async function verifyUberSide(
  slug: (typeof SLUGS)[number],
  tenantId: string,
  issues: string[],
): Promise<UberVerify> {
  const expected = DEFAULT_UBER_ORG_BY_TENANT_SLUG[slug]!;
  const syncOrgId = (await resolveTenantUberOrgId(tenantId)) ?? "";
  const slugOrg = await resolveUberOrgForTenantSlug(slug);

  const syncOrgName = slugOrg.ok ? slugOrg.data.orgName : "?";
  const matchesExpectedOrg = syncOrgId === expected.orgId;
  const usesBadaviUmbrella = syncOrgId === BADAVI_ORG_ID;

  if (!syncOrgId) issues.push("uber: resolveTenantUberOrgId returned empty");
  if (!matchesExpectedOrg) {
    issues.push(`uber: sync org id != expected ${expected.orgName}`);
  }
  if (slug !== "cosculluela" && usesBadaviUmbrella) {
    issues.push("uber: sync uses BADAVI umbrella org (wrong for this tenant)");
  }
  if (slugOrg.ok && syncOrgId && syncOrgId !== slugOrg.data.orgId) {
    issues.push("uber: settings org id differs from slug/API org id");
  }

  const [syncOrgDrivers, badaviDrivers, groupDrivers, forbiddenDrivers] = await Promise.all([
    syncOrgId ? driverIdSet(syncOrgId) : Promise.resolve(new Set<string>()),
    driverIdSet(BADAVI_ORG_ID),
    slug === "cosculluela" ? cosculluelaGroupDriverIds() : Promise.resolve(new Set<string>()),
    slug === "cosculluela" ? forbiddenUberDriverIds() : Promise.resolve(new Set<string>()),
  ]);

  const to = new Date();
  const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
  let tripActivityRows7d = -1;
  if (syncOrgId) {
    const activity = await fetchUberTripActivityRows(syncOrgId, from, to);
    if (!activity.ok) {
      issues.push(`uber trip activity API: ${activity.message}`);
    } else {
      tripActivityRows7d = activity.data.length;
    }
  }

  const dbUberAccounts = await withoutTenant(
    (tx) =>
      tx.driverPlatformAccount.findMany({
        where: {
          tenantId,
          platform: "UBER",
          isActive: true,
          NOT: { externalDriverId: "" },
        },
        select: { externalDriverId: true, driver: { select: { fullName: true } } },
      }),
    undefined,
    tenantId,
  );

  let dbInSyncOrg = 0;
  let dbMissingFromSyncOrg = 0;
  let dbOnlyInBadaviOrg = 0;
  let dbInWrongTenantOrg = 0;

  for (const acc of dbUberAccounts) {
    const ext = acc.externalDriverId.trim().toLowerCase();
    if (!ext) continue;
    const inSync = syncOrgDrivers.has(ext);
    const inBadavi = badaviDrivers.has(ext);
    const inGroup = slug === "cosculluela" ? groupDrivers.has(ext) : inSync;
    const inForbidden = forbiddenDrivers.has(ext);

    if (slug === "cosculluela") {
      if (inGroup) dbInSyncOrg += 1;
      else dbMissingFromSyncOrg += 1;
      if (inForbidden) dbInWrongTenantOrg += 1;
    } else {
      if (inSync) dbInSyncOrg += 1;
      else dbMissingFromSyncOrg += 1;
      if (inBadavi && !inSync) dbOnlyInBadaviOrg += 1;
    }
  }

  if (dbMissingFromSyncOrg > 0 && slug !== "cosculluela") {
    issues.push(
      `uber: ${dbMissingFromSyncOrg} active DB driver(s) missing from sync org API list`,
    );
  }
  if (dbOnlyInBadaviOrg > 0) {
    issues.push(
      `uber: ${dbOnlyInBadaviOrg} DB driver(s) only in BADAVI org, not in tenant sync org`,
    );
  }
  if (dbInWrongTenantOrg > 0) {
    issues.push(
      `uber: ${dbInWrongTenantOrg} DB driver(s) belong to Tradetaxi/Treviño org API`,
    );
  }

  const sampleDrivers: string[] = [];
  if (slugOrg.ok) {
    const listed = await listAllUberDrivers(slugOrg.data.orgId);
    if (listed.ok) {
      for (const d of listed.data.slice(0, 3)) {
        sampleDrivers.push(uberDriverDisplayName(d));
      }
    }
  }

  const uberWarnings: string[] = [];
  if (dbMissingFromSyncOrg > 0 && slug === "cosculluela") {
    uberWarnings.push(
      `${dbMissingFromSyncOrg} DB driver(s) UUID not found in any Uber sub-org API (may be stale)`,
    );
  }

  return {
    syncOrgId,
    syncOrgName,
    expectedOrgId: expected.orgId,
    matchesExpectedOrg,
    usesBadaviUmbrella,
    apiDriverCount: syncOrgDrivers.size,
    tripActivityRows7d,
    dbActiveUberDrivers: dbUberAccounts.length,
    dbInSyncOrg,
    dbMissingFromSyncOrg,
    dbOnlyInBadaviOrg,
    dbInWrongTenantOrg,
    uberWarnings,
    sampleDrivers,
  };
}

async function verifyTenant(slug: (typeof SLUGS)[number]): Promise<Row> {
  const issues: string[] = [];
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    }),
  );
  if (!tenant) {
    return {
      slug,
      ok: false,
      issues: ["tenant not in DB"],
      freenowSettings: "",
      freenowResolved: "",
      freenowSyncIds: [],
      freenowBookings: -1,
      uber: {
        syncOrgId: "",
        syncOrgName: "",
        expectedOrgId: "",
        matchesExpectedOrg: false,
        usesBadaviUmbrella: false,
        apiDriverCount: -1,
        tripActivityRows7d: -1,
        dbActiveUberDrivers: -1,
        dbInSyncOrg: -1,
        dbMissingFromSyncOrg: -1,
        dbOnlyInBadaviOrg: -1,
        dbInWrongTenantOrg: -1,
        uberWarnings: [],
        sampleDrivers: [],
      },
    };
  }

  const settings = await getTenantIntegrationSettings(tenant.id);
  const freenowExpected = DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG[slug] ?? "";

  if (!settings.freenowPublicCompanyId) {
    issues.push("freenowPublicCompanyId empty in settings");
  } else if (settings.freenowPublicCompanyId !== freenowExpected) {
    issues.push(`freenow settings ${settings.freenowPublicCompanyId} != expected ${freenowExpected}`);
  }

  const freenowResolved = await resolveTenantFreenowPublicCompanyId(tenant.id);
  const freenowSyncIds = await resolveTenantFreenowPublicCompanyIds(tenant.id);

  if (freenowResolved !== freenowExpected) {
    issues.push(`freenow resolved ${freenowResolved} != expected ${freenowExpected}`);
  }
  if (freenowSyncIds.includes("GEYTMOBQGE") && slug !== "cosculluela") {
    issues.push(`freenow sync ids leak umbrella GEYTMOBQGE: ${freenowSyncIds.join(",")}`);
  }
  if (slug === "trade-taxi-sl") {
    if (freenowSyncIds.includes("HEYTIMZR") || freenowSyncIds.includes("GIYTMMZV")) {
      issues.push(`trade-taxi must not sync trevino/galera companies: ${freenowSyncIds.join(",")}`);
    }
  }
  if (slug === "trevino") {
    if (freenowSyncIds.some((id) => id === "GEYDMNJUG4" || id === "GEYTMOBQGE")) {
      issues.push(`trevino must not sync badavi/tradetaxi companies: ${freenowSyncIds.join(",")}`);
    }
  }
  if (slug === "cosculluela") {
    if (freenowSyncIds.includes("HEYTIMZR") || freenowSyncIds.includes("GEYDMNJUG4")) {
      issues.push(`cosculluela must not sync trevino/tradetaxi companies: ${freenowSyncIds.join(",")}`);
    }
  }

  const freenowBookings = await countFreenowBookings(freenowResolved);
  const uber = await verifyUberSide(slug, tenant.id, issues);

  return {
    slug,
    ok: issues.length === 0,
    issues,
    freenowSettings: settings.freenowPublicCompanyId,
    freenowResolved,
    freenowSyncIds,
    freenowBookings,
    uber,
  };
}

async function main() {
  console.log("=== Group tenant platform verification ===\n");

  const linked = await listFreenowLinkedCompanies({ page: 0, size: 25 });
  if (linked.ok) {
    console.log("FreeNow linked companies (umbrella account):");
    for (const c of linked.companies) {
      console.log(`  ${c.id} — ${freenowLinkedCompanyName(c)}`);
    }
    console.log("");
  }

  const orgs = await listUberOrganizations();
  if (orgs.ok) {
    console.log(`Uber orgs API: ${orgs.data.length} org(s)`);
    for (const o of orgs.data.slice(0, 8)) {
      console.log(`  ${o.name ?? "?"} — ${o.id.slice(0, 28)}…`);
    }
    console.log("");
  }

  const rows: Row[] = [];
  for (const slug of SLUGS) {
    rows.push(await verifyTenant(slug));
  }

  for (const r of rows) {
    console.log(`--- ${r.slug} ${r.ok ? "OK" : "FAIL"} ---`);
    console.log(`  FreeNow settings:  ${r.freenowSettings || "(empty)"}`);
    console.log(`  FreeNow resolved:  ${r.freenowResolved}`);
    console.log(`  FreeNow sync ids:  ${r.freenowSyncIds.join(", ") || "(none)"}`);
    console.log(`  FreeNow bookings (3d): ${r.freenowBookings}`);
    console.log(`  Uber sync org:     ${r.uber.syncOrgName} (${r.uber.apiDriverCount} drivers API)`);
    console.log(`  Uber org id match: ${r.uber.matchesExpectedOrg ? "yes" : "no"} | BADAVI umbrella: ${r.uber.usesBadaviUmbrella ? "yes" : "no"}`);
    console.log(`  Uber trip activity (7d): ${r.uber.tripActivityRows7d} row(s)`);
    console.log(
      `  Uber DB drivers:   ${r.uber.dbActiveUberDrivers} active | in tenant org(s): ${r.uber.dbInSyncOrg} | missing: ${r.uber.dbMissingFromSyncOrg} | badavi-only: ${r.uber.dbOnlyInBadaviOrg} | wrong-tenant-org: ${r.uber.dbInWrongTenantOrg}`,
    );
    if (r.uber.sampleDrivers.length) {
      console.log(`  Uber API sample:   ${r.uber.sampleDrivers.join(", ")}`);
    }
    for (const w of r.uber.uberWarnings) {
      console.log(`  ~ ${w}`);
    }
    if (r.issues.length) {
      for (const i of r.issues) console.log(`  ! ${i}`);
    }
    console.log("");
  }

  const fail = rows.filter((r) => !r.ok).length;
  if (fail > 0) {
    console.error(`${fail}/${rows.length} tenant(s) failed verification.`);
    process.exit(1);
  }
  console.log(`All ${rows.length} group tenants verified (FreeNow + Uber settings, live API, DB).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
