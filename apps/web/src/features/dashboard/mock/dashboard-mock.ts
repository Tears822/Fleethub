import type { LucideIcon } from "lucide-react";

export type DashboardKpiId =
  | "activeDriversToday"
  | "openShiftsNow"
  | "connectedNow"
  | "dayBilling"
  | "tripsToday"
  | "pendingShifts"
  | "alerts";

export type MockDashboardKpi = {
  id: DashboardKpiId;
  value: string;
  /** Interpolation params for localized hints (resolved in dashboard page). */
  hintParams?: { totalDrivers?: number };
  hint?: string;
  trend?: { text: string; positive?: boolean; tone?: "warning" | "danger" };
  icon: LucideIcon;
  accent?: "green" | "amber" | "red" | "brand";
};

export type MockRevenuePoint = { day: string; euro: number };

export type MockTopDriver = { name: string; euro: number };
