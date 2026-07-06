"use client";

import { useRouter } from "next/navigation";
import type { TopDriversPeriod } from "@/features/dashboard/lib/top-drivers-period";
import type { MockTopDriver } from "@/features/dashboard/mock/dashboard-mock";
import { DashboardTopDriversMock } from "@/features/dashboard/ui/dashboard-top-drivers-mock";
import { useTranslations } from "@/shared/i18n/i18n-provider";

const PERIOD_OPTIONS: { value: TopDriversPeriod; labelKey: string }[] = [
  { value: "today", labelKey: "dashboard.topDrivers.periodToday" },
  { value: "week", labelKey: "dashboard.topDrivers.periodWeek" },
  { value: "month", labelKey: "dashboard.topDrivers.periodMonth" },
];

export function DashboardTopDriversCard({
  drivers,
  period,
  subtitleKey,
  emptyMessageKey,
}: {
  drivers: MockTopDriver[];
  period: TopDriversPeriod;
  subtitleKey: string;
  emptyMessageKey: string;
}) {
  const router = useRouter();
  const { t } = useTranslations();

  return (
    <div className="relative">
      <label className="absolute right-4 top-4 z-10 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        {t("dashboard.topDrivers.periodLabel")}
        <select
          className="erp-inline-input mt-1 block min-w-[6.5rem] text-[11px] normal-case"
          value={period}
          aria-label={t("dashboard.topDrivers.periodAria")}
          onChange={(e) => {
            const next = e.target.value as TopDriversPeriod;
            router.push(next === "today" ? "/dashboard" : `/dashboard?top=${next}`);
            router.refresh();
          }}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
      </label>
      <DashboardTopDriversMock
        title={t("dashboard.topDrivers.title")}
        subtitle={t(subtitleKey)}
        drivers={drivers}
        emptyMessage={t(emptyMessageKey)}
      />
    </div>
  );
}
