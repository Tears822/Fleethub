import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { RidePlatform, prisma, withTenant } from "@fleethub/db";
import { classifyPaymentMethod } from "./trip-payment-buckets";
import { preferMergedFareType } from "./shift-liquidation";
import type { TripIngestSource } from "./ingest-source";
import {
  buildTripIngestionEventRows,
  type TripIngestContext,
} from "./ingestion-events";

export type { TripIngestContext } from "./ingestion-events";

export type TripUpsertResult = {
  upserted: number;
  created: number;
  updated: number;
  ingestCollisions: number;
};

function hasPositiveCents(value: bigint | null | undefined): boolean {
  return value != null && Number(value) > 0;
}

function preferIncomingCents(
  incoming: bigint | null | undefined,
  existing: bigint | null | undefined,
): bigint | null | undefined {
  if (hasPositiveCents(incoming)) return incoming;
  if (incoming != null && existing == null) return incoming;
  return existing ?? incoming ?? null;
}

function tripUpsertUpdateFields(
  data: ReturnType<typeof mapTripRow>,
  paymentLocked: boolean,
  existing?: {
    fareType: string | null;
    paymentMethod: string | null;
    grossAmountCents: bigint | null;
    netAmountCents: bigint | null;
    platformFeeCents: bigint | null;
    tipCents: bigint | null;
    tollCents: bigint | null;
    cashPaymentCents: bigint | null;
    cardPaymentCents: bigint | null;
    appPaymentCents: bigint | null;
  } | null,
): Record<string, unknown> {
  const update: Record<string, unknown> = {
    endedAt: data.endedAt,
    fareType: preferMergedFareType(data.fareType, existing?.fareType ?? null),
    ingestSource: data.ingestSource,
  };

  update.grossAmountCents = preferIncomingCents(
    data.grossAmountCents,
    existing?.grossAmountCents ?? null,
  );
  update.netAmountCents = preferIncomingCents(
    data.netAmountCents,
    existing?.netAmountCents ?? null,
  );
  update.tipCents = preferIncomingCents(data.tipCents, existing?.tipCents ?? null) ?? data.tipCents;
  update.tollCents =
    preferIncomingCents(data.tollCents, existing?.tollCents ?? null) ?? data.tollCents;

  const fee = preferIncomingCents(data.platformFeeCents, existing?.platformFeeCents ?? null);
  if (fee != null) update.platformFeeCents = fee;

  // Confirmed payments must not be overwritten by platform re-sync (e.g. CASH import re-filling cash
  // after the operator validated the trip as card).
  if (!paymentLocked) {
    const cash = preferIncomingCents(data.cashPaymentCents, existing?.cashPaymentCents ?? null);
    if (cash != null) update.cashPaymentCents = cash;
    const card = preferIncomingCents(data.cardPaymentCents, existing?.cardPaymentCents ?? null);
    if (card != null) update.cardPaymentCents = card;
    const app = preferIncomingCents(data.appPaymentCents, existing?.appPaymentCents ?? null);
    if (app != null) update.appPaymentCents = app;
  } else if (
    classifyPaymentMethod(existing?.paymentMethod ?? data.paymentMethod) === "app" ||
    classifyPaymentMethod(data.paymentMethod) === "app"
  ) {
    // App trips are auto-validated; still refresh settlement columns when FreeNow re-syncs net/fee.
    const app = preferIncomingCents(data.appPaymentCents, existing?.appPaymentCents ?? null);
    if (app != null) update.appPaymentCents = app;
    update.cashPaymentCents = data.cashPaymentCents ?? null;
    update.cardPaymentCents = data.cardPaymentCents ?? null;
  }

  if (hasPositiveCents(data.platformBonusCents)) {
    update.platformBonusCents = data.platformBonusCents;
  }
  if (!paymentLocked) {
    update.paymentMethod = data.paymentMethod;
    update.paymentValidated = data.paymentValidated;
  }
  return update;
}

function mapTripRow(
  tenantId: string,
  driverId: string,
  driverPlatformAccountId: string,
  platform: RidePlatform,
  t: NormalizedTripUpsert,
  ingestSource: TripIngestSource,
) {
  return {
    tenantId,
    driverId,
    driverPlatformAccountId,
    platform,
    externalTripId: t.externalTripId,
    startedAt: new Date(t.startedAt),
    endedAt: t.endedAt ? new Date(t.endedAt) : null,
    fareType: t.fareType ?? null,
    grossAmountCents: t.grossAmountCents ?? null,
    platformFeeCents: t.platformFeeCents ?? null,
    tipCents: t.tipCents ?? null,
    platformBonusCents: t.platformBonusCents ?? null,
    tollCents: t.tollCents ?? null,
    netAmountCents: t.netAmountCents ?? null,
    paymentMethod: t.paymentMethod ?? null,
    cashPaymentCents: t.cashPaymentCents ?? null,
    cardPaymentCents: t.cardPaymentCents ?? null,
    appPaymentCents: t.appPaymentCents ?? null,
    paymentValidated: t.paymentValidated ?? false,
    ingestSource,
  };
}

function tripUpsertTransactionTimeout(tripCount: number): number {
  return Math.min(120_000, 10_000 + tripCount * 100);
}

export async function upsertNormalizedTripsForDriver(
  tenantId: string,
  driverPlatformAccountId: string,
  driverId: string,
  platform: RidePlatform,
  trips: NormalizedTripUpsert[],
  ingestSource: TripIngestSource,
  ctx?: TripIngestContext,
): Promise<TripUpsertResult> {
  if (trips.length === 0) {
    return { upserted: 0, created: 0, updated: 0, ingestCollisions: 0 };
  }

  return withTenant(
    tenantId,
    async (tx) => {
      let upserted = 0;
      let created = 0;
      let updated = 0;
      let ingestCollisions = 0;

      const externalTripIds = trips.map((t) => t.externalTripId);
      const existingRows = await tx.trip.findMany({
        where: { tenantId, platform, externalTripId: { in: externalTripIds } },
        select: {
          externalTripId: true,
          ingestSource: true,
          fareType: true,
          paymentValidated: true,
          paymentMethod: true,
          grossAmountCents: true,
          netAmountCents: true,
          platformFeeCents: true,
          tipCents: true,
          tollCents: true,
          cashPaymentCents: true,
          cardPaymentCents: true,
          appPaymentCents: true,
        },
      });
      const existingByExternalId = new Map(
        existingRows.map((row) => [row.externalTripId, row]),
      );

      for (const t of trips) {
        const tripKey = {
          tenantId_platform_externalTripId: {
            tenantId,
            platform,
            externalTripId: t.externalTripId,
          },
        };

        const existing = existingByExternalId.get(t.externalTripId) ?? null;

        if (existing?.ingestSource && existing.ingestSource !== ingestSource) {
          ingestCollisions += 1;
        }
        if (existing) {
          updated += 1;
        } else {
          created += 1;
        }

        const data = mapTripRow(
          tenantId,
          driverId,
          driverPlatformAccountId,
          platform,
          t,
          ingestSource,
        );

        const paymentLocked = existing?.paymentValidated === true;

        await tx.trip.upsert({
          where: tripKey,
          create: data,
          update: tripUpsertUpdateFields(data, paymentLocked, existing),
        });
        upserted += 1;
      }

      const eventRows = buildTripIngestionEventRows(
        tenantId,
        platform,
        trips,
        ingestSource,
        existingByExternalId,
        ctx,
      );
      if (eventRows.length > 0) {
        await tx.ingestionEvent.createMany({ data: eventRows });
      }

      return { upserted, created, updated, ingestCollisions };
    },
    prisma,
    { timeout: tripUpsertTransactionTimeout(trips.length) },
  );
}

export async function findDriverPlatformAccount(
  tenantId: string,
  platform: RidePlatform,
  externalDriverId: string,
): Promise<{ id: string; driverId: string } | null> {
  return withTenant(tenantId, async (tx) => {
    const row = await tx.driverPlatformAccount.findFirst({
      where: {
        tenantId,
        platform,
        isActive: true,
        externalDriverId: externalDriverId.trim(),
      },
      select: { id: true, driverId: true },
    });
    return row;
  });
}
