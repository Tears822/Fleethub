"use client";

import type {
  IngestionTimeBucket,
  SyncFailureTimeBucket,
} from "@/features/integrations/lib/ingestion-time-series";
import { formatIngestLatencyMs } from "@/features/integrations/lib/ingestion-kpis";
import {
  formatDayLabelInTenantTz,
  formatHourLabelInTenantTz,
  tenantTimezoneShortLabel,
} from "@/shared/lib/tenant-timezone";

function CountBarChart({
  items,
  maxValue,
  primaryClass = "bg-sky-500",
  secondaryClass = "bg-amber-400",
  showSecondary,
  compact,
}: {
  items: Array<{ label: string; primary: number; secondary?: number }>;
  maxValue: number;
  primaryClass?: string;
  secondaryClass?: string;
  showSecondary?: boolean;
  compact?: boolean;
}) {
  const max = Math.max(maxValue, 1);
  const chartHeight = compact ? "h-28" : "h-36";
  const barHeight = compact ? "h-20" : "h-28";
  return (
    <div className={`flex ${chartHeight} items-end gap-0.5 border-b border-zinc-200 pb-1 pt-2`}>
      {items.map((item) => {
        const primaryPct = Math.max(item.primary > 0 ? 6 : 0, Math.round((item.primary / max) * 100));
        const secondaryPct =
          showSecondary && item.secondary
            ? Math.max(item.secondary > 0 ? 4 : 0, Math.round((item.secondary / max) * 100))
            : 0;
        return (
          <div
            key={item.label}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${item.label}: ${item.primary}${item.secondary ? ` + ${item.secondary} dup` : ""}`}
          >
            <div className={`flex ${barHeight} w-full items-end justify-center gap-px`}>
              {showSecondary && secondaryPct > 0 ? (
                <div
                  className={`w-[45%] max-w-[0.65rem] rounded-t ${secondaryClass}`}
                  style={{ height: `${secondaryPct}%` }}
                />
              ) : null}
              <div
                className={`w-[45%] max-w-[0.65rem] rounded-t ${primaryClass}`}
                style={{ height: `${primaryPct}%` }}
              />
            </div>
            <span className="max-w-full truncate text-[8px] text-zinc-500">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function seriesMax(buckets: IngestionTimeBucket[]): number {
  return Math.max(...buckets.map((b) => b.totalEvents), 1);
}

export function IngestionTimeSeriesCharts({
  hourly24h,
  daily7d,
  syncFailures24h,
  variant = "default",
}: {
  hourly24h: IngestionTimeBucket[];
  daily7d: IngestionTimeBucket[];
  syncFailures24h: SyncFailureTimeBucket[];
  variant?: "default" | "tenant";
}) {
  const isTenant = variant === "tenant";
  const panelClass = isTenant
    ? "rounded-lg border border-sky-200/80 bg-white/90 p-3"
    : "rounded-lg border border-zinc-200 bg-white p-4";
  const titleClass = isTenant
    ? "text-xs font-semibold text-sky-950"
    : "text-sm font-semibold text-zinc-900";
  const subtitleClass = isTenant ? "text-[10px] text-sky-900/80" : "text-xs text-zinc-500";
  const tzLabel = tenantTimezoneShortLabel();

  const hasHourly = hourly24h.some((b) => b.totalEvents > 0);
  const hasDaily = daily7d.some((b) => b.totalEvents > 0);
  const hasSync = syncFailures24h.some((b) => b.failedRuns > 0 || b.successRuns > 0);

  if (!hasHourly && !hasDaily && !hasSync) {
    return (
      <div
        className={
          isTenant
            ? "mt-4 rounded-lg border border-sky-100 bg-sky-50/60 px-3 py-2 text-xs text-sky-900/85"
            : "rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600"
        }
      >
        Sin tendencia aún. Tras un sync o webhook verá gráficas por hora y por día.
      </div>
    );
  }

  const hourlyItems = hourly24h.map((b) => ({
    label: formatHourLabelInTenantTz(b.bucketStart),
    primary: b.totalEvents,
    secondary: b.duplicates,
  }));

  const dailyItems = daily7d.map((b) => ({
    label: formatDayLabelInTenantTz(b.bucketStart),
    primary: b.totalEvents,
    secondary: b.duplicates,
  }));

  const syncItems = syncFailures24h.map((b) => ({
    label: formatHourLabelInTenantTz(b.bucketStart),
    primary: b.successRuns,
    secondary: b.failedRuns,
  }));

  const latestP95 = [...hourly24h].reverse().find((b) => b.p95LatencyMs != null)?.p95LatencyMs;

  return (
    <div className={isTenant ? "mt-4 space-y-4" : "space-y-6"}>
      {hasHourly ? (
        <div className={panelClass}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={titleClass}>Ingesta (24 h, {tzLabel})</p>
            {latestP95 != null ? (
              <p className={subtitleClass}>
                p95:{" "}
                <span className="font-semibold tabular-nums">
                  {formatIngestLatencyMs(latestP95)}
                </span>
              </p>
            ) : null}
          </div>
          {!isTenant ? (
            <p className={`mt-0.5 ${subtitleClass}`}>
              Barras azules = eventos; ámbar = duplicados (origen distinto)
            </p>
          ) : null}
          <div className="mt-2">
            <CountBarChart
              items={hourlyItems}
              maxValue={seriesMax(hourly24h)}
              showSecondary
              compact={isTenant}
            />
          </div>
        </div>
      ) : null}

      {hasSync ? (
        <div className={panelClass}>
          <p className={titleClass}>Sync (24 h, {tzLabel})</p>
          {!isTenant ? (
            <p className={`mt-0.5 ${subtitleClass}`}>Verde = SUCCESS; rojo = FAILED</p>
          ) : null}
          <div className="mt-2">
            <CountBarChart
              items={syncItems}
              maxValue={Math.max(
                ...syncFailures24h.map((b) => b.failedRuns + b.successRuns),
                1,
              )}
              primaryClass="bg-emerald-500"
              secondaryClass="bg-red-400"
              showSecondary
              compact={isTenant}
            />
          </div>
        </div>
      ) : null}

      {hasDaily ? (
        <div className={panelClass}>
          <p className={titleClass}>Ingesta (7 días, {tzLabel})</p>
          <div className="mt-2">
            <CountBarChart
              items={dailyItems}
              maxValue={seriesMax(daily7d)}
              showSecondary
              compact={isTenant}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
