/**
 * Fast on-demand sync before shift liquidation (1 driver, short window, minimal org prefetch).
 */
import { ingestSourceFromSyncTrigger, upsertNormalizedTripsForDriver } from "@fleethub/auth";
import { RidePlatform, withTenant } from "@fleethub/db";
import { getFleetConnector } from "../connectors/registry.js";
import { fetchFreenowTripsByDriver } from "../lib/freenow-bookings.js";
import { resolveFreenowTripsForDriverAccount } from "../lib/freenow-driver-match.js";
import { resolveFreenowPublicCompanyIdForDriver } from "../lib/freenow-company-map.js";
import { enrichFreenowTripsWithDriverEarnings } from "../lib/freenow-earnings-mapper.js";
import { LIQUIDATION_SYNC_DAYS } from "../lib/platform-sync-window.js";
import { prefetchUberOrgReports } from "../lib/uber-reports.js";
import { freenowSyncRange } from "../lib/freenow-sync-window.js";
import { uberSyncRange } from "../lib/uber-sync-window.js";

export type LiquidationDriverSyncResult = {
  ok: boolean;
  uberTripsUpserted: number;
  freenowTripsUpserted: number;
  message?: string;
};

export async function runLiquidationDriverSync(
  tenantId: string,
  driverId: string,
  options?: { platform?: RidePlatform },
): Promise<LiquidationDriverSyncResult> {
  const days = LIQUIDATION_SYNC_DAYS();
  const to = new Date();
  const uberFrom = uberSyncRange(to, days).from;
  const fnFrom = freenowSyncRange(to, days).from;
  const ingestSource = ingestSourceFromSyncTrigger("liquidation");

  const platformFilter = options?.platform;
  const platformIn =
    platformFilter != null
      ? [platformFilter]
      : [RidePlatform.UBER, RidePlatform.FREENOW];

  const dpas = await withTenant(tenantId, (tx) =>
    tx.driverPlatformAccount.findMany({
      where: {
        tenantId,
        driverId,
        isActive: true,
        platform: { in: platformIn },
      },
      select: {
        id: true,
        platform: true,
        driverId: true,
        externalDriverId: true,
        metadata: true,
      },
    }),
  );

  if (dpas.length === 0) {
    return { ok: true, uberTripsUpserted: 0, freenowTripsUpserted: 0 };
  }

  const driver = await withTenant(tenantId, (tx) =>
    tx.driver.findFirst({
      where: { tenantId, id: driverId },
      select: { fullName: true },
    }),
  );
  if (!driver) {
    return { ok: false, uberTripsUpserted: 0, freenowTripsUpserted: 0, message: "Conductor no encontrado." };
  }

  let uberTripsUpserted = 0;
  let freenowTripsUpserted = 0;

  const uberDpas = dpas.filter(
    (d) =>
      d.platform === RidePlatform.UBER &&
      d.externalDriverId.trim().length > 0 &&
      !d.externalDriverId.startsWith("seed-"),
  );

  if (uberDpas.length > 0) {
    await prefetchUberOrgReports(tenantId, uberFrom, to, {
      narrowDpas: uberDpas,
      tripActivityOnly: true,
    });
    const uberConnector = getFleetConnector(RidePlatform.UBER);
    for (const dpa of uberDpas) {
      const trips = await uberConnector.syncTrips({
        tenantId,
        driverPlatformAccountId: dpa.id,
        from: uberFrom,
        to,
      });
      const result = await upsertNormalizedTripsForDriver(
        tenantId,
        dpa.id,
        dpa.driverId,
        RidePlatform.UBER,
        trips,
        ingestSource,
      );
      uberTripsUpserted += result.upserted;
    }
  }

  for (const dpa of dpas.filter((d) => d.platform === RidePlatform.FREENOW)) {
    if (!dpa.externalDriverId.trim() || dpa.externalDriverId.startsWith("seed-")) continue;

    const companyId = await resolveFreenowPublicCompanyIdForDriver(
      tenantId,
      dpa.driverId,
      dpa.metadata,
    );
    const batch = await fetchFreenowTripsByDriver({
      publicCompanyId: companyId,
      from: fnFrom,
      to,
    });
    if (!batch.ok) {
      console.warn("[liquidation-sync] freenow:", batch.message);
      continue;
    }
    const resolved = resolveFreenowTripsForDriverAccount({
      externalDriverId: dpa.externalDriverId,
      driverFullName: driver.fullName,
      tripsByDriver: batch.tripsByDriver,
      bookings: batch.bookings,
    });
    const enriched = await enrichFreenowTripsWithDriverEarnings({
      publicCompanyId: companyId,
      publicDriverId: dpa.externalDriverId.trim(),
      from: fnFrom,
      to,
      trips: resolved.trips,
    });
    const result = await upsertNormalizedTripsForDriver(
      tenantId,
      dpa.id,
      dpa.driverId,
      RidePlatform.FREENOW,
      enriched.trips,
      ingestSource,
    );
    freenowTripsUpserted += result.upserted;
  }

  return { ok: true, uberTripsUpserted, freenowTripsUpserted };
}
