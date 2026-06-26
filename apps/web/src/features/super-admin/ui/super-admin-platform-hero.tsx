"use client";

import type { SuperAdminPlatformStats } from "@/features/super-admin/server/tenants.queries";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { VuiStatCard } from "@/shared/ui/vui-stat-card";

const METRIC_KEYS: {
  key: keyof SuperAdminPlatformStats | "usersTotal" | "usersActive";
  labelKey:
    | "superAdmin.dashboard.metrics.tenantsTotal"
    | "superAdmin.dashboard.metrics.tenantsActive"
    | "superAdmin.dashboard.metrics.usersTotal"
    | "superAdmin.dashboard.metrics.usersActive"
    | "superAdmin.dashboard.metrics.driversTotal"
    | "superAdmin.dashboard.metrics.driversUber"
    | "superAdmin.dashboard.metrics.driversFreeNow";
  accent: "green" | "teal" | "brand";
}[] = [
  { key: "tenantTotal", labelKey: "superAdmin.dashboard.metrics.tenantsTotal", accent: "green" },
  { key: "tenantActive", labelKey: "superAdmin.dashboard.metrics.tenantsActive", accent: "green" },
  { key: "usersTotal", labelKey: "superAdmin.dashboard.metrics.usersTotal", accent: "teal" },
  { key: "usersActive", labelKey: "superAdmin.dashboard.metrics.usersActive", accent: "teal" },
  { key: "driverTotal", labelKey: "superAdmin.dashboard.metrics.driversTotal", accent: "brand" },
  { key: "driversUber", labelKey: "superAdmin.dashboard.metrics.driversUber", accent: "brand" },
  { key: "driversFreeNow", labelKey: "superAdmin.dashboard.metrics.driversFreeNow", accent: "brand" },
];

function metricValue(stats: SuperAdminPlatformStats, key: (typeof METRIC_KEYS)[number]["key"]): number {
  if (key === "usersTotal") return stats.tenantUserTotal + stats.platformUserTotal;
  if (key === "usersActive") return stats.tenantUserActive + stats.platformUserActive;
  return stats[key];
}

/** Platform summary header — light ERP KPI pattern (matches tenant shell). */
export function SuperAdminPlatformHero({
  stats,
  dateLabel,
}: {
  stats: SuperAdminPlatformStats;
  dateLabel: string;
}) {
  const { t } = useTranslations();

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm md:p-5">
      <div className="border-b border-zinc-100 pb-4">
        <p className="text-base font-bold text-zinc-900 md:text-lg">{t("superAdmin.dashboard.platformTitle")}</p>
        <p className="mt-0.5 text-xs text-zinc-600 md:text-sm">
          {t("superAdmin.dashboard.platformSubtitle", { dateLabel })}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {METRIC_KEYS.map((m) => (
          <VuiStatCard
            key={m.key}
            title={t(m.labelKey)}
            value={metricValue(stats, m.key)}
            accent={m.accent}
            valueClassName="text-emerald-700"
          />
        ))}
      </div>
    </section>
  );
}
