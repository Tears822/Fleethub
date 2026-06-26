"use client";

import type { TenantIngestionTimeSeries } from "@/features/integrations/lib/ingestion-time-series";
import { IngestionTimeSeriesCharts } from "@/features/integrations/ui/ingestion-time-series-charts";

export function IngestionTimeSeriesCard({ series }: { series: TenantIngestionTimeSeries }) {
  return (
    <div className="mt-4 rounded-lg border border-sky-100 bg-sky-50/60 px-4 py-3">
      <p className="text-xs font-semibold text-sky-950">Tendencia de ingesta (24 h / 7 días)</p>
      <p className="mt-0.5 text-xs leading-relaxed text-sky-900/85">
        Solo datos de su operador: eventos, duplicados y sync por hora.
      </p>
      <IngestionTimeSeriesCharts
        hourly24h={series.hourly24h}
        daily7d={series.daily7d}
        syncFailures24h={series.syncFailures24h}
        variant="tenant"
      />
    </div>
  );
}
