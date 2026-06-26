/**
 * Backfill FreeNow payment method + split columns on existing trips.
 *
 * Usage:
 *   npm run backfill:freenow-payments -w @fleethub/worker -- demo-a
 *   npm run backfill:freenow-payments -w @fleethub/worker -- demo-a --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { prisma, RidePlatform, withTenant } from "@fleethub/db";
import {
  freenowBookingToUpsert,
  freenowPaymentSplitCents,
} from "../lib/freenow-booking-mapper.js";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { enrichFreenowTripsWithDriverEarnings } from "../lib/freenow-earnings-mapper.js";
import {
  resolveTenantFreenowPublicCompanyId,
  resolveTenantFreenowSyncDays,
} from "../lib/tenant-platform-config.js";
import { freenowSyncRange } from "../lib/freenow-sync-window.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });

function isSeedTripId(externalTripId: string): boolean {
  return externalTripId.startsWith("seed-");
}

function hasAnySplit(trip: {
  cashPaymentCents: bigint | null;
  cardPaymentCents: bigint | null;
  appPaymentCents: bigint | null;
}): boolean {
  return (
    trip.cashPaymentCents != null ||
    trip.cardPaymentCents != null ||
    trip.appPaymentCents != null
  );
}

function splitFromMethod(
  paymentMethod: string | null,
  netAmountCents: bigint | null,
): Pick<NormalizedTripUpsert, "cashPaymentCents" | "cardPaymentCents" | "appPaymentCents"> {
  return freenowPaymentSplitCents(paymentMethod, netAmountCents);
}

function expectedSplit(
  paymentMethod: string | null,
  netAmountCents: bigint | null,
): Pick<NormalizedTripUpsert, "cashPaymentCents" | "cardPaymentCents" | "appPaymentCents"> {
  return splitFromMethod(paymentMethod, netAmountCents);
}

function splitMatchesMethod(
  trip: Pick<
    TripRow,
    "paymentMethod" | "netAmountCents" | "cashPaymentCents" | "cardPaymentCents" | "appPaymentCents"
  >,
): boolean {
  if (trip.netAmountCents == null || trip.netAmountCents <= 0n) return true;
  const exp = expectedSplit(trip.paymentMethod, trip.netAmountCents);
  const same = (a: bigint | null | undefined, b: bigint | null | undefined) =>
    (a ?? null) === (b ?? null);
  return (
    same(trip.cashPaymentCents, exp.cashPaymentCents) &&
    same(trip.cardPaymentCents, exp.cardPaymentCents) &&
    same(trip.appPaymentCents, exp.appPaymentCents)
  );
}

type TripRow = {
  id: string;
  externalTripId: string;
  paymentMethod: string | null;
  paymentValidated: boolean;
  netAmountCents: bigint | null;
  cashPaymentCents: bigint | null;
  cardPaymentCents: bigint | null;
  appPaymentCents: bigint | null;
  platformFeeCents: bigint | null;
  platformBonusCents: bigint | null;
  grossAmountCents: bigint | null;
  fareType: string | null;
  startedAt: Date;
  driverPlatformAccount: { externalDriverId: string } | null;
};

async function buildEnrichedApiMap(params: {
  publicCompanyId: string;
  from: Date;
  to: Date;
  bookings: Awaited<ReturnType<typeof listFreenowCompanyBookings>> & { ok: true };
}): Promise<Map<string, NormalizedTripUpsert>> {
  const tripsByDriver = new Map<string, NormalizedTripUpsert[]>();

  for (const booking of params.bookings.bookings) {
    const upsert = freenowBookingToUpsert(booking);
    if (!upsert) continue;
    const publicDriverId = booking.driver?.id?.trim();
    if (!publicDriverId) continue;
    const list = tripsByDriver.get(publicDriverId) ?? [];
    list.push(upsert);
    tripsByDriver.set(publicDriverId, list);
  }

  const apiByExternalId = new Map<string, NormalizedTripUpsert>();
  for (const [publicDriverId, driverTrips] of tripsByDriver) {
    const enriched = await enrichFreenowTripsWithDriverEarnings({
      publicCompanyId: params.publicCompanyId,
      publicDriverId,
      from: params.from,
      to: params.to,
      trips: driverTrips,
    });
    for (const trip of enriched.trips) {
      apiByExternalId.set(trip.externalTripId, trip);
    }
  }
  return apiByExternalId;
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  const dryRun = process.argv.includes("--dry-run");
  const slug = args[0]?.trim();
  if (!slug) {
    console.error("Usage: backfill-freenow-payments <tenant-slug> [--dry-run]");
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!tenant) {
    console.error("Tenant not found:", slug);
    process.exit(1);
  }

  const trips = await withTenant(tenant.id, (tx) =>
    tx.trip.findMany({
      where: { tenantId: tenant.id, platform: RidePlatform.FREENOW },
      select: {
        id: true,
        externalTripId: true,
        paymentMethod: true,
        paymentValidated: true,
        netAmountCents: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
        platformFeeCents: true,
        platformBonusCents: true,
        grossAmountCents: true,
        fareType: true,
        startedAt: true,
        driverPlatformAccount: { select: { externalDriverId: true } },
      },
      orderBy: { startedAt: "asc" },
    }),
  );

  if (trips.length === 0) {
    console.log("No FreeNow trips for tenant", slug);
    return;
  }

  const from = trips[0]!.startedAt;
  const to = trips[trips.length - 1]!.startedAt;
  const publicCompanyId = await resolveTenantFreenowPublicCompanyId(tenant.id);

  console.log(
    `Backfill ${tenant.name} (${slug}): ${trips.length} trip(s), ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}${dryRun ? " [dry-run]" : ""}`,
  );

  const syncDays = await resolveTenantFreenowSyncDays(tenant.id);
  const range = freenowSyncRange(to, syncDays);
  const fetchFrom = new Date(Math.min(from.getTime(), range.from.getTime()));
  const fetchTo = new Date(Math.max(to.getTime(), range.to.getTime()));

  const bookings = await listFreenowCompanyBookings({
    publicCompanyId,
    from: fetchFrom,
    to: fetchTo,
  });
  if (!bookings.ok) {
    console.error("FreeNow API fetch failed:", bookings.message);
    process.exit(1);
  }
  const apiByExternalId = await buildEnrichedApiMap({
    publicCompanyId,
    from: fetchFrom,
    to: fetchTo,
    bookings,
  });
  console.log(`API bookings loaded: ${bookings.bookings.length} (${apiByExternalId.size} enriched trip(s))`);

  let updated = 0;
  let apiMethodFixes = 0;
  let splitOnly = 0;
  let seedSplit = 0;
  let splitRepair = 0;
  let earningsFields = 0;

  for (const trip of trips) {
    const patch = buildPatch(trip, apiByExternalId.get(trip.externalTripId));
    if (!patch) continue;

    if (patch.kind === "api_method") apiMethodFixes += 1;
    else if (patch.kind === "seed_split") seedSplit += 1;
    else if (patch.kind === "split_repair") splitRepair += 1;
    else if (patch.kind === "earnings") earningsFields += 1;
    else splitOnly += 1;

    if (!dryRun) {
      await withTenant(tenant.id, (tx) =>
        tx.trip.update({
          where: { id: trip.id },
          data: patch.data,
        }),
      );
    }
    updated += 1;
  }

  console.log("Updated:", updated);
  console.log("  API paymentMethod fixes (card→app):", apiMethodFixes);
  console.log("  Split fill (real trips):", splitOnly);
  console.log("  Split fill (seed trips):", seedSplit);
  console.log("  Split repair (wrong column):", splitRepair);
  console.log("  Earnings fields (fee/prima/net/fare):", earningsFields);

  if (!dryRun) {
    const appNull = await withTenant(tenant.id, (tx) =>
      tx.trip.count({
        where: {
          platform: RidePlatform.FREENOW,
          paymentMethod: "app",
          appPaymentCents: null,
        },
      }),
    );
    const cardNoSplit = await withTenant(tenant.id, (tx) =>
      tx.trip.count({
        where: {
          platform: RidePlatform.FREENOW,
          paymentMethod: "card",
          cardPaymentCents: null,
          appPaymentCents: null,
          cashPaymentCents: null,
        },
      }),
    );
    console.log("After backfill — app without split:", appNull, "| card without split:", cardNoSplit);
  }
}

function buildPatch(
  trip: TripRow,
  api: NormalizedTripUpsert | undefined,
): {
  kind: "api_method" | "split" | "seed_split" | "split_repair" | "earnings";
  data: Record<string, unknown>;
} | null {
  const seed = isSeedTripId(trip.externalTripId);

  if (!seed && api) {
    const earningsPatch: Record<string, unknown> = {};
    if (api.platformFeeCents != null && (trip.platformFeeCents == null || trip.platformFeeCents <= 0n)) {
      earningsPatch.platformFeeCents = api.platformFeeCents;
    }
    if (api.platformBonusCents != null && (trip.platformBonusCents ?? 0n) === 0n && api.platformBonusCents > 0n) {
      earningsPatch.platformBonusCents = api.platformBonusCents;
    }
    if (api.netAmountCents != null && api.netAmountCents !== trip.netAmountCents) {
      earningsPatch.netAmountCents = api.netAmountCents;
    }
    if (api.fareType && api.fareType !== trip.fareType) {
      earningsPatch.fareType = api.fareType;
    }
    if (Object.keys(earningsPatch).length > 0) {
      if (api.cashPaymentCents != null || api.cardPaymentCents != null || api.appPaymentCents != null) {
        earningsPatch.cashPaymentCents = api.cashPaymentCents;
        earningsPatch.cardPaymentCents = api.cardPaymentCents;
        earningsPatch.appPaymentCents = api.appPaymentCents;
      }
      return { kind: "earnings", data: earningsPatch };
    }

    const mislabeledCard =
      trip.paymentMethod === "card" &&
      !hasAnySplit(trip) &&
      api.paymentMethod === "app";

    if (mislabeledCard) {
      return {
        kind: "api_method",
        data: {
          paymentMethod: api.paymentMethod,
          paymentValidated: api.paymentValidated ?? true,
          cashPaymentCents: api.cashPaymentCents,
          cardPaymentCents: api.cardPaymentCents,
          appPaymentCents: api.appPaymentCents,
        },
      };
    }

    if (!hasAnySplit(trip)) {
      return {
        kind: "split",
        data: {
          cashPaymentCents: api.cashPaymentCents,
          cardPaymentCents: api.cardPaymentCents,
          appPaymentCents: api.appPaymentCents,
          ...(trip.paymentValidated
            ? {}
            : {
                paymentMethod: api.paymentMethod,
                paymentValidated: api.paymentValidated ?? false,
              }),
        },
      };
    }
  }

  if (
    trip.netAmountCents != null &&
    trip.netAmountCents > 0n &&
    trip.paymentMethod &&
    !splitMatchesMethod(trip)
  ) {
    const split = splitFromMethod(trip.paymentMethod, trip.netAmountCents);
    return {
      kind: "split_repair",
      data: {
        cashPaymentCents: split.cashPaymentCents,
        cardPaymentCents: split.cardPaymentCents,
        appPaymentCents: split.appPaymentCents,
      },
    };
  }

  if (!hasAnySplit(trip) && trip.netAmountCents != null && trip.netAmountCents > 0n) {
    const split = splitFromMethod(trip.paymentMethod, trip.netAmountCents);
    return {
      kind: seed ? "seed_split" : "split",
      data: {
        cashPaymentCents: split.cashPaymentCents,
        cardPaymentCents: split.cardPaymentCents,
        appPaymentCents: split.appPaymentCents,
      },
    };
  }

  return null;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
