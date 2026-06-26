import type { LucideIcon } from "lucide-react";

export type MockDashboardKpi = {
  title: string;
  value: string;
  hint?: string;
  trend?: { text: string; positive?: boolean; tone?: "warning" | "danger" };
  icon: LucideIcon;
  accent?: "green" | "amber" | "red" | "brand";
};

export type MockRevenuePoint = { day: string; euro: number };

export type MockTopDriver = { name: string; euro: number };
