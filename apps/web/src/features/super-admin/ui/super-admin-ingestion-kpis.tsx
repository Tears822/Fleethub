"use client";

import {
  formatIngestLatencyMs,
  ingestSourceLabel,
  type IngestionKpiSummary,
} from "@/features/integrations/lib/ingestion-kpis";
import { useTranslations } from "@/shared/i18n/i18n-provider";

export function SuperAdminIngestionKpisSummary({
  kpis,
}: {
  kpis: IngestionKpiSummary;
}) {
  const { t } = useTranslations();

  if (kpis.totalEvents === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        {t("superAdmin.sync.ingestionEmpty")}
      </div>
    );
  }

  const metricCards = [
    [t("superAdmin.sync.events24h"), kpis.totalEvents],
    [t("superAdmin.sync.created"), kpis.created],
    [t("superAdmin.sync.updated"), kpis.updated],
    [t("superAdmin.sync.duplicates"), kpis.duplicates],
    [t("superAdmin.sync.webhookVsPoll"), `${kpis.webhookSharePct}%`],
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metricCards.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-zinc-200 bg-white p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">{label}</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            {t("superAdmin.sync.latencyTitle")}
          </p>
          <p className="mt-1 font-semibold tabular-nums text-zinc-900">
            {formatIngestLatencyMs(kpis.avgLatencyMs)}
            {kpis.p95LatencyMs != null ? (
              <span className="text-zinc-500"> · p95 {formatIngestLatencyMs(kpis.p95LatencyMs)}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs text-zinc-500">{t("superAdmin.sync.latencyHint")}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            {t("superAdmin.sync.webhooks")}
          </p>
          <p className="mt-1 font-semibold tabular-nums text-zinc-900">{kpis.webhookEvents}</p>
        </div>
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            {t("superAdmin.sync.pollFallback")}
          </p>
          <p className="mt-1 font-semibold tabular-nums text-zinc-900">{kpis.pollEvents}</p>
        </div>
      </div>

      {kpis.webhookEvents === 0 && kpis.pollEvents > 0 ? (
        <p className="text-xs text-zinc-500">{t("superAdmin.sync.webhookZeroHint")}</p>
      ) : null}

      {kpis.bySource.length > 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            {t("superAdmin.sync.bySource")}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {kpis.bySource.map((row) => (
              <li
                key={row.source}
                className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs text-zinc-800"
              >
                <span className="font-semibold">{ingestSourceLabel(row.source)}</span>
                <span className="ml-1 tabular-nums text-zinc-500">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
