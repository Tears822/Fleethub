"use client";

import type { SyncApiSuccess24h } from "@fleethub/auth";
import { useTranslations } from "@/shared/i18n/i18n-provider";

export function SuperAdminSyncApiSuccessCard({ stats }: { stats: SyncApiSuccess24h }) {
  const { t } = useTranslations();
  const tone =
    stats.successPct >= 99
      ? "text-emerald-700"
      : stats.successPct >= 90
        ? "text-amber-700"
        : "text-red-700";

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        {t("superAdmin.sync.apiSuccessTitle")}
      </p>
      <p className={`mt-1 text-3xl font-bold tabular-nums ${tone}`}>{stats.successPct}%</p>
      <p className="mt-1 text-xs text-zinc-600">
        {t("superAdmin.sync.apiSuccessStats", {
          success: stats.success,
          failed: stats.failed,
          total: stats.total,
        })}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-500">{t("superAdmin.sync.apiSuccessHint")}</p>
    </div>
  );
}
