import type {
  ConnectionResult,
  DriverDayMetrics,
  FleetConnector,
  NormalizedTripUpsert,
} from "@fleethub/contracts";

export const cabifyConnector: FleetConnector = {
  platform: "CABIFY",

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
      hoursOnline: 3.8 + (day % 3) * 0.25,
      rejections: 0,
      missed: day % 6 === 0 ? 2 : 1,
    };
  },

  async getDriverConnectionState(): Promise<"online" | "offline" | "unknown"> {
    return "unknown";
  },
};
