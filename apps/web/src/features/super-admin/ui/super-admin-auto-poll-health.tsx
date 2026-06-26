"use client";

import type { GlobalAutoPollHealth } from "@fleethub/auth";
import { useTranslations } from "@/shared/i18n/i18n-provider";

export function SuperAdminAutoPollHealthCard({ health }: { health: GlobalAutoPollHealth }) {
  const { t, locale } = useTranslations();
  const dateLocale = locale === "ca" ? "ca-ES" : "es-ES";
  const stale = health.stale;

  const formatWhen = (d: Date | null): string => {
    if (!d) return t("superAdmin.common.noRecord");
    return d.toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "short" });
  };

  return (
    <div
      className={`rounded-lg border p-4 ${
        stale ? "border-red-300 bg-red-50" : "border-emerald-200 bg-emerald-50/60"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-600">
        {t("superAdmin.sync.autoPollTitle")}
      </p>
      <p
        className={`mt-1 text-lg font-bold ${stale ? "text-red-800" : "text-emerald-800"}`}
      >
        {stale ? t("superAdmin.sync.autoPollStale") : t("superAdmin.sync.autoPollActive")}
      </p>
      <p className="mt-1 text-xs text-zinc-700">
        {t("superAdmin.sync.autoPollLastOk", { when: formatWhen(health.lastAutoSuccessAt) })}
        {health.minutesSinceAutoSuccess != null
          ? t("superAdmin.common.minutesAgo", { minutes: health.minutesSinceAutoSuccess })
          : null}
      </p>
      <p className="mt-1 text-xs text-zinc-600">
        {t("superAdmin.sync.autoPollAlert", { minutes: health.alertThresholdMinutes })}{" "}
        <span className="font-semibold tabular-nums">
          {health.tenantsMissingRecentAutoPoll}/{health.activeTenantCount}
        </span>
      </p>
      {stale ? (
        <p className="mt-2 text-xs text-red-800">{t("superAdmin.sync.autoPollStaleHelp")}</p>
      ) : null}
      <ul className="mt-2 flex flex-wrap gap-3 text-[11px] text-zinc-600">
        {health.byPlatform.map((p) => (
          <li key={p.platform}>
            <span className="font-semibold">{p.platform}</span>: {formatWhen(p.lastAutoSuccessAt)}
          </li>
        ))}
      </ul>
    </div>
  );
}
