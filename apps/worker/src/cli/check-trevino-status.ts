import "../load-env.js";
import { RidePlatform, withoutTenant } from "@fleethub/db";

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findUnique({
      where: { slug: "trevino" },
      select: { id: true, name: true, settings: true },
    }),
  );
  if (!tenant) return console.log("trevino not found");

  const [drivers, uberDpas, uberTrips, fnTrips] = await Promise.all([
    withoutTenant((tx) =>
      tx.driver.count({ where: { tenantId: tenant.id, isActive: true } }),
    ),
    withoutTenant((tx) =>
      tx.driverPlatformAccount.count({
        where: { tenantId: tenant.id, platform: RidePlatform.UBER, isActive: true },
      }),
    ),
    withoutTenant((tx) =>
      tx.trip.count({
        where: {
          tenantId: tenant.id,
          platform: RidePlatform.UBER,
          startedAt: { gte: new Date("2026-06-01") },
        },
      }),
    ),
    withoutTenant((tx) =>
      tx.trip.count({
        where: {
          tenantId: tenant.id,
          platform: RidePlatform.FREENOW,
          startedAt: { gte: new Date("2026-06-01") },
        },
      }),
    ),
  ]);

  const integrations = (tenant.settings as { integrations?: Record<string, unknown> } | null)
    ?.integrations;
  console.log({
    tenant: tenant.name,
    activeDrivers: drivers,
    activeUberDpas: uberDpas,
    uberTripsSinceJun: uberTrips,
    fnTripsSinceJun: fnTrips,
    uberOrgId: typeof integrations?.uberOrgId === "string" ? integrations.uberOrgId.slice(0, 40) + "…" : null,
  });

  const sample = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: { tenantId: tenant.id },
      select: { fullName: true, isActive: true },
      orderBy: { fullName: "asc" },
      take: 15,
    }),
  );
  console.log("sample drivers:", sample.map((d) => `${d.fullName}${d.isActive ? "" : " (inactive)"}`));
}

main().catch(console.error);
