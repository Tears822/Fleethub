/** Tipos de configuración del tenant (seguros en componentes cliente). */

export type ProductivityThresholds = {
  eurPerHourMin: number;
  tripsPerHourMin: number;
  acceptanceRateMin: number;
  useFleetDayAverages?: boolean;
};

export type TenantNotificationSettings = {
  emailOnPendingShifts: boolean;
  emailOnProductivityLow: boolean;
  emailOnSyncStale: boolean;
};
