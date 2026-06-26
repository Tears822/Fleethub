export type DriverPerformanceStats = {
  monthTitle: string;
  facturacionMes: string;
  facturacionMesEur: number;
  facturacionVsPrevPct: number | null;
  viajesMes: number;
  viajesPerDayLabel: string;
  eurHoraMes: string;
  horasMesLabel: string;
  rankingPosition: number | null;
  rankingTotal: number;
  dailyBilling: Array<{ day: number; amountEur: number }>;
  dailyBillingTotal: string;
  evolution6m: Array<{ label: string; amountEur: number }>;
  peerComparison: Array<{ name: string; amountEur: number; isCurrent: boolean }>;
};
