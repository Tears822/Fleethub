/**
 * Live API: detalle viajes respeta cookie de empresa (tenant-bound).
 * Usage: npx tsx scripts/verify-cerrar-turnos-api-scope.ts
 */
import { config as loadEnv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: path.join(root, ".env") });
loadEnv({ path: path.join(root, "apps/worker/.env"), override: true });

import { formatCompanyScopeCookie, FH_COMPANY_SCOPE_COOKIE } from "@fleethub/auth/company-scope-cookie";
import { FH_SESSION_COOKIE } from "@fleethub/auth/constants";
import { withoutTenant } from "@fleethub/db";

const API = (process.env.FLEETHUB_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");

async function login(slug: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantSlug: slug, email, password }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `login ${slug} failed ${res.status}`);
  const setCookie = res.headers.getSetCookie?.() ?? [];
  const session = setCookie.find((c) => c.startsWith(FH_SESSION_COOKIE));
  if (!session) throw new Error(`no session cookie for ${slug}`);
  return session.split(";")[0]!;
}

async function fetchTrips(
  sessionCookie: string,
  companyCookie: string | null,
  driverId: string,
  platform: string,
): Promise<{ trips?: { id: string }[]; error?: string }> {
  const headers: Record<string, string> = { Cookie: sessionCookie };
  if (companyCookie) {
    headers.Cookie += `; ${companyCookie}`;
  }
  const url = `${API}/api/tenant/shifts/trips?status=pending&driverId=${driverId}&platform=${platform}`;
  const res = await fetch(url, { headers });
  return (await res.json()) as { trips?: { id: string }[]; error?: string };
}

async function main() {
  const trevino = await withoutTenant((tx) =>
    tx.tenant.findFirst({
      where: { slug: "trevino" },
      select: {
        id: true,
        companies: { where: { isActive: true }, select: { id: true, legalName: true } },
      },
    }),
  );
  const trade = await withoutTenant((tx) =>
    tx.tenant.findFirst({
      where: { slug: "trade-taxi-sl" },
      select: {
        id: true,
        companies: { where: { isActive: true }, select: { id: true, legalName: true } },
      },
    }),
  );
  if (!trevino || !trade) throw new Error("tenants missing");

  const taxiBusiness = trevino.companies.find((c) => c.legalName.includes("TAXI BUSINESS"));
  const tradeTaxi = trade.companies.find((c) => c.legalName.includes("TRADE TAXI"));
  if (!taxiBusiness || !tradeTaxi) throw new Error("companies missing");

  const samerTrevino = await withoutTenant((tx) =>
    tx.driver.findFirst({
      where: { tenantId: trevino.id, fullName: { contains: "SAMER", mode: "insensitive" } },
      select: { id: true },
    }),
  );
  const samerTrade = await withoutTenant((tx) =>
    tx.driver.findFirst({
      where: { tenantId: trade.id, fullName: { contains: "SAMER", mode: "insensitive" } },
      select: { id: true },
    }),
  );
  if (!samerTrevino || !samerTrade) throw new Error("Samer drivers missing");

  const trevinoSession = await login("trevino", "admin-trevino@fleethub.local", "Demo1234!");
  const tradeSession = await login("trade-taxi-sl", "vicente.h@outlook.com", process.env.TRADE_TAXI_PASSWORD ?? "Demo1234!");

  let fails = 0;

  // trevino session + trade-taxi company cookie → should not load trade driver
  const staleCookie = `${FH_COMPANY_SCOPE_COOKIE}=${encodeURIComponent(
    formatCompanyScopeCookie(trade.id, tradeTaxi.id),
  )}`;
  const cross = await fetchTrips(trevinoSession, staleCookie, samerTrade.id, "UBER");
  if (cross.trips?.length) {
    console.log("FAIL: trevino session returned trips for trade driver with stale cookie");
    fails += 1;
  } else {
    console.log("OK API: trevino session + cookie trade-taxi → 0 trips trade driver");
  }

  // trevino session + correct company cookie → loads trevino Samer
  const goodCookie = `${FH_COMPANY_SCOPE_COOKIE}=${encodeURIComponent(
    formatCompanyScopeCookie(trevino.id, taxiBusiness.id),
  )}`;
  const good = await fetchTrips(trevinoSession, goodCookie, samerTrevino.id, "UBER");
  if (!good.trips?.length) {
    console.log("FAIL: trevino session + TAXI BUSINESS cookie → no trips", good.error);
    fails += 1;
  } else {
    console.log(`OK API: trevino + TAXI BUSINESS cookie → ${good.trips.length} trips Samer`);
  }

  // trade session + trevino company cookie → should not expose trevino driver to trade session
  const staleForTrade = `${FH_COMPANY_SCOPE_COOKIE}=${encodeURIComponent(
    formatCompanyScopeCookie(trevino.id, taxiBusiness.id),
  )}`;
  const cross2 = await fetchTrips(tradeSession, staleForTrade, samerTrevino.id, "UBER");
  if (cross2.trips?.length) {
    console.log("FAIL: trade session returned trips for trevino driver");
    fails += 1;
  } else {
    console.log("OK API: trade session + cookie trevino → 0 trips trevino driver");
  }

  const tradeGoodCookie = `${FH_COMPANY_SCOPE_COOKIE}=${encodeURIComponent(
    formatCompanyScopeCookie(trade.id, tradeTaxi.id),
  )}`;
  const tradeGood = await fetchTrips(tradeSession, tradeGoodCookie, samerTrade.id, "UBER");
  if (!tradeGood.trips?.length) {
    console.log("FAIL: trade session + TRADE TAXI cookie → no trips", tradeGood.error);
    fails += 1;
  } else {
    console.log(`OK API: trade + TRADE TAXI cookie → ${tradeGood.trips.length} trips Samer`);
  }

  if (fails === 0) {
    console.log("\nAPI scope verification OK");
    process.exit(0);
  } else {
    console.log(`\n${fails} API scope failure(s)`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
