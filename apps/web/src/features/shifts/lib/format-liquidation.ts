import { formatDateTimeRangeInTenantTz } from "@/shared/lib/tenant-timezone";

export type LiquidationPreviewDto = {
  driverId: string;
  driverName: string;
  companyName: string;
  tripIds: string[];
  timeRangeApplied?: boolean;
  tripCount: number;
  unvalidatedCount: number;
  unbalancedPaymentCount?: number;
  grossCents: number;
  netCents: number;
  vatCents: number;
  tipsCents: number;
  tollsCents: number;
  bonusCents: number;
  driverBonusSharePct: number;
  driverBonusCents: number;
  companyBonusCents: number;
  platformFeeCents: number;
  driverPlatformFeeSharePct: number;
  driverPlatformFeeCents: number;
  companyPlatformFeeCents: number;
  dailyFixedCents: number;
  t3Cents: number;
  cashCents: number;
  driverSharePct: number;
  driverNetCents: number;
  companyNetCents: number;
  totalToSettleCents: number;
  periodFrom: string | null;
  periodTo: string | null;
};

import { formatEuroAmount } from "@/shared/lib/format-euro";

export function formatEuroFromCents(cents: number): string {
  return formatEuroAmount(cents / 100);
}

export function formatLiquidationPeriod(from: string | null, to: string | null): string {
  if (!from || !to) return "—";
  return formatDateTimeRangeInTenantTz(from, to);
}
