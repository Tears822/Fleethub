"use client";

import { useRouter } from "next/navigation";
import type { TopDriversPeriod } from "@/features/dashboard/lib/top-drivers-period";
import type { MockTopDriver } from "@/features/dashboard/mock/dashboard-mock";
import { DashboardTopDriversMock } from "@/features/dashboard/ui/dashboard-top-drivers-mock";

const PERIOD_OPTIONS: { value: TopDriversPeriod; label: string }[] = [
  { value: "today", label: "Hoy" },
  { value: "week", label: "7 días" },
  { value: "month", label: "Mes" },
];

export function DashboardTopDriversCard({
  drivers,
  period,
  subtitle,
  emptyMessage,
}: {
  drivers: MockTopDriver[];
  period: TopDriversPeriod;
  subtitle: string;
  emptyMessage: string;
}) {
  const router = useRouter();

  return (
    <div className="relative">
      <label className="absolute right-4 top-4 z-10 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        Periodo
        <select
          className="erp-inline-input mt-1 block min-w-[6.5rem] text-[11px] normal-case"
          value={period}
          aria-label="Periodo del ranking"
          onChange={(e) => {
            const next = e.target.value as TopDriversPeriod;
            router.push(next === "today" ? "/dashboard" : `/dashboard?top=${next}`);
            router.refresh();
          }}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <DashboardTopDriversMock
        title="Top 5 conductores"
        subtitle={subtitle}
        drivers={drivers}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
