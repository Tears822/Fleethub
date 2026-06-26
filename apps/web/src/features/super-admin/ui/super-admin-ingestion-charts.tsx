"use client";

import type {
  IngestionTimeBucket,
  SyncFailureTimeBucket,
} from "@/features/integrations/lib/ingestion-time-series";
import { IngestionTimeSeriesCharts } from "@/features/integrations/ui/ingestion-time-series-charts";

export function SuperAdminIngestionCharts({
  hourly24h,
  daily7d,
  syncFailures24h,
}: {
  hourly24h: IngestionTimeBucket[];
  daily7d: IngestionTimeBucket[];
  syncFailures24h: SyncFailureTimeBucket[];
}) {
  return (
    <IngestionTimeSeriesCharts
      hourly24h={hourly24h}
      daily7d={daily7d}
      syncFailures24h={syncFailures24h}
      variant="default"
    />
  );
}
