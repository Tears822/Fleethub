/** Probe Santacoloma / Taxis Blanco sync gaps. */
import "../load-env.js";
import { withoutTenant, withTenant } from "@fleethub/db";
import { freenowLinkedCompanyName, listFreenowLinkedCompanies } from "../lib/freenow-client.js";
import { listAllFreenowLinkedCompanies } from "../lib/freenow-company-map.js";
import { fetchUberTripActivityRows } from "../lib/uber-reports.js";
import { resolveTenantUberOrgId } from "../lib/tenant-platform-config.js";
import { listUberOrganizations, resolveUberOrgId } from "../lib/uber-fleet-client.js";
import { pickColumn } from "../lib/uber-csv-columns.js";

async function main() {
  const linked = await listAllFreenowLinkedCompanies();
  console.log("=== FreeNow linked on umbrella ===");
  if (linked.ok) {
    for (const c of linked.companies) {
      console.log(" ", c.id, freenowLinkedCompanyName(c));
    }
  }

  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({ where: { slug: "cosculluela" }, select: { id: true } }),
  );
  if (!tenant) throw new Error("no tenant");

  for (const needle of ["SANTACOLOMA", "TAXIS BLANCO"]) {
    const co = await withTenant(tenant.id, (tx) =>
      tx.company.findFirst({
        where: { legalName: { contains: needle, mode: "insensitive" } },
        select: { id: true, legalName: true },
      }),
    );
    if (!co) continue;
    const dpas = await withTenant(tenant.id, (tx) =>
      tx.driverPlatformAccount.findMany({
        where: { driver: { companyId: co.id }, isActive: true },
        select: {
          externalDriverId: true,
          platform: true,
          driver: { select: { fullName: true } },
        },
      }),
    );
    console.log(`\n=== ${co.legalName} — platform IDs ===`);
    for (const d of dpas) {
      const pub =
        d.platform === "FREENOW"
          ? d.externalDriverId.length >= 12
          : /^[0-9a-f-]{36}$/i.test(d.externalDriverId);
      console.log(`  ${d.driver.fullName} | ${d.platform} | ${d.externalDriverId} | ok=${pub}`);
    }
  }

  const orgs = await listUberOrganizations();
  const santaOrg = orgs.ok
    ? orgs.data.find((o) => (o.name ?? "").toLowerCase().includes("santacoloma"))
    : null;
  console.log("\n=== Santacoloma Uber org ===", santaOrg?.name);

  const badaviOrg = await resolveUberOrgId(await resolveTenantUberOrgId(tenant.id));
  const from = new Date(Date.now() - 30 * 86400000);
  const to = new Date();

  const santDpas = await withTenant(tenant.id, (tx) =>
    tx.driverPlatformAccount.findMany({
      where: {
        platform: "UBER",
        isActive: true,
        driver: { company: { legalName: { contains: "SANTACOLOMA", mode: "insensitive" } } },
      },
      select: { externalDriverId: true, driver: { select: { fullName: true } } },
    }),
  );

  if (badaviOrg.ok && santaOrg?.id) {
    for (const [label, orgId] of [
      ["BADAVI sync org (used by FleetHub)", badaviOrg.data],
      ["Santacoloma Uber org (NOT synced today)", santaOrg.id],
    ] as const) {
      const act = await fetchUberTripActivityRows(orgId, from, to);
      const uuids = new Set<string>();
      if (act.ok) {
        for (const row of act.data) {
          const u = (pickColumn(row, ["Driver UUID", "UUID del conductor"]) ?? "").toLowerCase();
          if (u) uuids.add(u);
        }
      }
      console.log(`\n${label}: ${act.ok ? act.data.length : "FAIL"} rows, ${uuids.size} drivers`);
      for (const d of santDpas) {
        const hit = uuids.has(d.externalDriverId.toLowerCase());
        console.log(`  ${d.driver.fullName}: ${hit ? "trips in report" : "NOT in report"}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
