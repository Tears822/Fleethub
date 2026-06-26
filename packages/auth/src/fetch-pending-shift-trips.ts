import type { RidePlatform } from "@fleethub/db";
import type { Prisma } from "@prisma/client";
import { resolveDriverEconomics } from "./company-economic-defaults";
import { filterTripsByTimeRange, type ShiftCloseTimeRange } from "./shift-close-filters";
import type { LiquidationDriverEconomics } from "./shift-liquidation";
import { driverWhere, type CompanyScope } from "./tenant-scope";

const tripSelect = {
  id: true,
  driverId: true,
  startedAt: true,
  endedAt: true,
  fareType: true,
  grossAmountCents: true,
  netAmountCents: true,
  platformFeeCents: true,
  tipCents: true,
  platformBonusCents: true,
  tollCents: true,
  paymentMethod: true,
  cashPaymentCents: true,
  cardPaymentCents: true,
  appPaymentCents: true,
  paymentValidated: true,
  driver: {
    select: {
      driverSharePct: true,
      driverBonusSharePct: true,
      driverPlatformFeeSharePct: true,
      dailyFixedCents: true,
      company: { select: { profile: true } },
    },
  },
} as const;

export type PendingShiftTrip = {
  id: string;
  driverId: string;
  startedAt: Date;
  endedAt: Date | null;
  fareType: string | null;
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
  platformFeeCents: bigint | null;
  tipCents: bigint | null;
  platformBonusCents: bigint | null;
  tollCents: bigint | null;
  paymentMethod: string | null;
  cashPaymentCents: bigint | null;
  cardPaymentCents: bigint | null;
  appPaymentCents: bigint | null;
  paymentValidated: boolean;
  driver: {
    driverSharePct: number | null;
    driverBonusSharePct: number | null;
    driverPlatformFeeSharePct: number | null;
    dailyFixedCents: bigint | null;
    company: { profile: unknown };
  };
};

export function driverEconomicsFromTrip(
  driver: PendingShiftTrip["driver"],
): LiquidationDriverEconomics {
  return resolveDriverEconomics(
    {
      driverSharePct: driver.driverSharePct,
      driverBonusSharePct: driver.driverBonusSharePct,
      driverPlatformFeeSharePct: driver.driverPlatformFeeSharePct,
      dailyFixedCents: driver.dailyFixedCents,
    },
    driver.company.profile,
  );
}

export async function fetchPendingShiftTrips(
  tx: Prisma.TransactionClient,
  input: {
    tenantId: string;
    scope: CompanyScope;
    driverId?: string;
    tripIds?: string[];
    platform?: RidePlatform;
    timeRange?: ShiftCloseTimeRange;
  },
): Promise<PendingShiftTrip[]> {
  const driverFilter = driverWhere(input.scope);
  const { driverId = "", tripIds = [], platform, tenantId, timeRange } = input;

  const where =
    tripIds.length > 0
      ? {
          id: { in: tripIds },
          tenantId,
          liquidationStatus: "pending",
          driver: driverFilter,
        }
      : {
          tenantId,
          driverId,
          liquidationStatus: "pending",
          ...(platform ? { platform } : {}),
          driver: driverFilter,
        };

  const trips = await tx.trip.findMany({
    where,
    orderBy: { startedAt: "asc" },
    select: tripSelect,
  });

  return filterTripsByTimeRange(trips, timeRange);
}
