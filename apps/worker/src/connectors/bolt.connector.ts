import type {
  ConnectionResult,
  DriverDayMetrics,
  FleetConnector,
  NormalizedTripUpsert,
} from "@fleethub/contracts";

export const boltConnector: FleetConnector = {
  platform: "BOLT",

  async verifyConnection(): Promise<ConnectionResult> {
    return { ok: true };
  },

  async syncTrips(): Promise<NormalizedTripUpsert[]> {
    return [];
  },

  async syncDriverDayMetrics(params: {
    tenantId: string;
    driverPlatformAccountId: string;
    date: Date;
  }): Promise<DriverDayMetrics> {
    void params.tenantId;
    void params.driverPlatformAccountId;
    const day = params.date.getUTCDate();
    return {
      hoursOnline: 3.2 + (day % 4) * 0.3,
      rejections: day % 7 === 0 ? 1 : 0,
      missed: day % 5 === 0 ? 1 : 0,
    };
  },

  async getDriverConnectionState(): Promise<"online" | "offline" | "unknown"> {
    return "unknown";
  },
};
