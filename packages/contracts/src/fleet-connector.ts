/**
 * Cross-platform adapter contract (FRD §11.1).
 * Implementations live in `apps/worker` / future `packages/connectors-*`.
 */

export type RidePlatformCode = "UBER" | "FREENOW" | "BOLT" | "CABIFY";

export type NormalizedTripUpsert = {
  externalTripId: string;
  startedAt: string;
  endedAt?: string | null;
  grossAmountCents?: bigint | null;
  platformFeeCents?: bigint | null;
  tipCents?: bigint | null;
  platformBonusCents?: bigint | null;
  tollCents?: bigint | null;
  netAmountCents?: bigint | null;
  paymentMethod?: string | null;
  cashPaymentCents?: bigint | null;
  cardPaymentCents?: bigint | null;
  appPaymentCents?: bigint | null;
  paymentValidated?: boolean;
  fareType?: string | null;
};

export type DriverDayMetrics = {
  hoursOnline: number;
  rejections: number;
  missed: number;
};

export type ConnectionResult = { ok: true } | { ok: false; message: string };

export interface FleetConnector {
  readonly platform: RidePlatformCode;

  verifyConnection(tenantId: string, credentialsRef: string): Promise<ConnectionResult>;

  syncTrips(params: {
    tenantId: string;
    driverPlatformAccountId: string;
    from: Date;
    to: Date;
  }): Promise<NormalizedTripUpsert[]>;

  syncDriverDayMetrics(params: {
    tenantId: string;
    driverPlatformAccountId: string;
    date: Date;
  }): Promise<DriverDayMetrics>;

  getDriverConnectionState(params: {
    tenantId: string;
    driverPlatformAccountId: string;
  }): Promise<"online" | "offline" | "unknown">;
}
