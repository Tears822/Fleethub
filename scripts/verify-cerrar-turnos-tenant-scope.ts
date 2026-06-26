/**
 * Verifica aislamiento tenant + empresa en Cerrar turnos.
 * Usage: npx tsx scripts/verify-cerrar-turnos-tenant-scope.ts
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(root, ".env") });
loadEnv({ path: path.join(root, "apps/worker/.env"), override: true });

import {
  formatCompanyScopeCookie,
  parseCompanyScopeCookieSelection,
  resolveCompanyScopeWithCookie,
  COMPANY_SCOPE_ALL,
} from "@fleethub/auth/company-scope-cookie";
import { driverWhere } from "@fleethub/auth/tenant-scope";
import { withoutTenant, withTenantRls, TenantRole } from "@fleethub/db";

type TenantInfo = {
  id: string;
  slug: string;
  companies: { id: string; legalName: string }[];
};

async function loadTenant(slug: string): Promise<TenantInfo | null> {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({
      where: { slug },
      select: {
        id: true,
        slug: true,
        companies: {
          where: { isActive: true },
          select: { id: true, legalName: true },
          orderBy: { legalName: "asc" },
        },
      },
    }),
  );
  if (!tenant) return null;
  return tenant;
}

async function pendingDriverNames(
  tenantId: string,
  scope: { mode: "all" } | { mode: "restricted"; companyIds: string[] },
): Promise<string[]> {
  const trips = await withTenantRls(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        liquidationStatus: "pending",
        driver: driverWhere(scope),
      },
      select: { driver: { select: { fullName: true, companyId: true, company: { select: { legalName: true } } } } },
    }),
  );
  const byDriver = new Map<string, string>();
  for (const t of trips) {
    byDriver.set(t.driver.fullName, t.driver.company.legalName);
  }
  return [...byDriver.entries()].map(([name, company]) => `${name} (${company})`);
}

function adminSession(tid: string) {
  return {
    kind: "tenant" as const,
    tid,
    sub: "verify-script",
    role: TenantRole.ADMIN_TENANT,
    impersonating: false,
  };
}

async function verifyTenantScope(tenant: TenantInfo) {
  console.log(`\n=== ${tenant.slug} ===`);
  let fails = 0;

  for (const company of tenant.companies) {
    const scope = { mode: "restricted" as const, companyIds: [company.id] };
    const names = await pendingDriverNames(tenant.id, scope);
    const wrongCompany = names.filter((n) => !n.includes(company.legalName));
    if (wrongCompany.length > 0) {
      console.log(`FAIL empresa ${company.legalName}: conductores de otra empresa:`, wrongCompany);
      fails += 1;
    } else {
      console.log(`OK ${company.legalName}: ${names.length} conductores, todos de esa empresa`);
    }
  }

  const session = adminSession(tenant.id);
  for (const company of tenant.companies) {
    const cookie = formatCompanyScopeCookie(tenant.id, company.id);
    const resolved = await resolveCompanyScopeWithCookie(session, { cookieValue: cookie });
    if (resolved.mode !== "restricted" || resolved.companyIds[0] !== company.id) {
      console.log(`FAIL cookie scope ${company.legalName}:`, resolved);
      fails += 1;
    }
  }

  const otherTenant = tenant.slug === "trevino" ? "trade-taxi-sl" : "trevino";
  const other = await loadTenant(otherTenant);
  if (other && other.companies[0]) {
    const staleCookie = formatCompanyScopeCookie(other.id, other.companies[0].id);
    const parsed = parseCompanyScopeCookieSelection(staleCookie, tenant.id);
    if (parsed !== COMPANY_SCOPE_ALL) {
      console.log(`FAIL stale cookie from ${otherTenant} accepted for ${tenant.slug}: ${parsed}`);
      fails += 1;
    } else {
      console.log(`OK cookie de ${otherTenant} rechazada en ${tenant.slug}`);
    }
  }

  return fails;
}

async function verifyCrossTenantDriverLeak() {
  console.log("\n=== Cross-tenant driver id leak ===");
  const trevino = await loadTenant("trevino");
  const trade = await loadTenant("trade-taxi-sl");
  if (!trevino || !trade) {
    console.log("SKIP: missing tenants");
    return 0;
  }

  const samerTrevino = await withTenantRls(trevino.id, (tx) =>
    tx.driver.findFirst({
      where: { tenantId: trevino.id, fullName: { contains: "SAMER", mode: "insensitive" } },
      select: { id: true },
    }),
  );
  const samerTrade = await withTenantRls(trade.id, (tx) =>
    tx.driver.findFirst({
      where: { tenantId: trade.id, fullName: { contains: "SAMER", mode: "insensitive" } },
      select: { id: true },
    }),
  );
  if (!samerTrevino || !samerTrade) {
    console.log("SKIP: Samer not in both tenants");
    return 0;
  }

  let fails = 0;
  const leakInTrade = await withTenantRls(trade.id, (tx) =>
    tx.trip.count({ where: { tenantId: trade.id, driverId: samerTrevino.id } }),
  );
  const leakInTrevino = await withTenantRls(trevino.id, (tx) =>
    tx.trip.count({ where: { tenantId: trevino.id, driverId: samerTrade.id } }),
  );

  if (leakInTrade !== 0) {
    console.log(`FAIL trevino Samer visible in trade-taxi-sl: ${leakInTrade} trips`);
    fails += 1;
  } else {
    console.log("OK trevino driver id invisible in trade-taxi-sl");
  }
  if (leakInTrevino !== 0) {
    console.log(`FAIL trade Samer visible in trevino: ${leakInTrevino} trips`);
    fails += 1;
  } else {
    console.log("OK trade-taxi driver id invisible in trevino");
  }

  return fails;
}

async function main() {
  console.log("Verificación aislamiento tenant/empresa — Cerrar turnos");
  let totalFails = 0;

  for (const slug of ["trevino", "trade-taxi-sl"]) {
    const tenant = await loadTenant(slug);
    if (!tenant) {
      console.log(`SKIP ${slug}`);
      continue;
    }
    totalFails += await verifyTenantScope(tenant);
  }

  totalFails += await verifyCrossTenantDriverLeak();

  console.log(`\n=== Resultado ===`);
  if (totalFails === 0) {
    console.log("TODOS OK — aislamiento tenant/empresa verificado.");
    process.exit(0);
  } else {
    console.log(`${totalFails} fallo(s) — revisar aislamiento.`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
