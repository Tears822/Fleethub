"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Translator } from "@fleethub/i18n";
import { useRouter } from "next/navigation";
import { Plug } from "lucide-react";
import { fetchSyncRuns } from "@/features/integrations/lib/request-platform-sync";
import {
  hasRunningSyncRuns,
  parseSyncRunDto,
} from "@/features/integrations/lib/sync-run-status";
import { formatDateTimeShortInTenantTz } from "@/shared/lib/tenant-timezone";
import { PlatformSyncButton } from "@/features/settings/ui/platform-sync-button";
import type { SyncHistoryRow } from "@/features/settings/ui/sync-history-table";
import { PlatformLogo } from "@/shared/ui/platform-logo";
import type { TenantIntegrationSettings } from "@/features/settings/server/settings.queries";
import { ConfiguracionIntegrationPlatformSection } from "@/features/settings/ui/configuracion-integration-platform-section";
import { DriverCoverageCard } from "@/features/settings/ui/driver-coverage-card";
import type { TenantDriverCoverage } from "@fleethub/auth";
import type { IngestionKpiSummary } from "@/features/integrations/lib/ingestion-kpis";
import type { TenantIngestionTimeSeries } from "@/features/integrations/lib/ingestion-time-series";
import { IngestionKpisCard } from "@/features/settings/ui/ingestion-kpis-card";
import { IngestionTimeSeriesCard } from "@/features/settings/ui/ingestion-time-series-card";
import { VuiPanel } from "@/shared/ui/vui-panel";
import { useTranslations } from "@/shared/i18n/i18n-provider";

type SyncRunRow = {
  id: string;
  platform: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
};

function formatRelativeSync(date: Date, t: Translator): string {
  const diffMs = Date.now() - date.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return t("config.integrations.justNow");
  if (mins < 60) return t("config.integrations.minutesAgo", { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("config.integrations.hoursAgo", { n: hours });
  return formatDateTimeShortInTenantTz(date);
}

function lastSyncForPlatform(
  runs: SyncRunRow[],
  platform: string,
  fallback: string,
  t: Translator,
): string {
  const match = runs.find((r) => r.platform.toUpperCase() === platform.toUpperCase());
  if (!match) return fallback;
  const when = match.finishedAt ?? match.startedAt;
  const status = match.status.toUpperCase();
  if (status === "FAILED") {
    return t("config.integrations.lastFailed", { when: formatRelativeSync(when, t) });
  }
  if (status === "RUNNING") {
    return t("config.integrations.syncInProgress");
  }
  return t("config.integrations.lastIngest", { when: formatRelativeSync(when, t) });
}

function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-block h-2 w-2 shrink-0 rounded-full ${active ? "bg-emerald-500" : "bg-zinc-400"}`}
      aria-hidden
    />
  );
}

function IntegrationRow({
  logo,
  name,
  active,
  statusLabel,
  subtitle,
  action,
  t,
}: {
  logo: ReactNode;
  name: string;
  active: boolean;
  statusLabel?: string;
  subtitle: string;
  action?: ReactNode;
  t: Translator;
}) {
  const label = statusLabel ?? (active ? t("config.integrations.active") : t("config.integrations.notConnected"));
  return (
    <li className="flex items-start gap-3 border-b border-zinc-100 py-3.5 last:border-0 last:pb-0 first:pt-0">
      {logo}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900">{name}</span>
          <StatusDot active={active} />
          <span
            className={`text-xs font-semibold ${active ? "text-emerald-700" : "text-zinc-500"}`}
          >
            {label}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
      </div>
      {action ? <div className="shrink-0 self-center">{action}</div> : null}
    </li>
  );
}

export function ConfiguracionIntegrationsPanel({
  initialSyncRuns,
  initialSyncHistory,
  integrations,
  driverCoverage,
  ingestionKpis,
  ingestionTimeSeries,
  canManageSync,
  canEditIntegrationSettings,
  showPlatformTenantIds,
}: {
  initialSyncRuns: SyncRunRow[];
  initialSyncHistory: SyncHistoryRow[];
  integrations: TenantIntegrationSettings;
  driverCoverage?: TenantDriverCoverage;
  ingestionKpis?: IngestionKpiSummary;
  ingestionTimeSeries?: TenantIngestionTimeSeries;
  canManageSync: boolean;
  canEditIntegrationSettings: boolean;
  showPlatformTenantIds: boolean;
}) {
  const router = useRouter();
  const { t } = useTranslations();
  const [syncRuns, setSyncRuns] = useState(initialSyncRuns);
  const [historyRows, setHistoryRows] = useState(initialSyncHistory);
  const [watching, setWatching] = useState(false);

  const refreshRuns = useCallback(async () => {
    const dtos = await fetchSyncRuns(30);
    const parsed = dtos.map(parseSyncRunDto);
    setHistoryRows(parsed);
    setSyncRuns(
      parsed.map((r) => ({
        id: r.id,
        platform: r.platform,
        status: r.status,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        errorMessage: r.errorMessage,
        trigger: r.trigger,
        ingestSource: r.ingestSource,
        tripsUpserted: r.tripsUpserted,
        ingestCollisions: r.ingestCollisions,
      })),
    );
    return parsed;
  }, []);

  const onSyncStarted = useCallback(() => {
    setWatching(true);
    void refreshRuns();
    window.dispatchEvent(new CustomEvent("fleethub:sync-started"));
  }, [refreshRuns]);

  useEffect(() => {
    if (!watching) return;
    const tick = async () => {
      const rows = await refreshRuns();
      if (!hasRunningSyncRuns(rows)) {
        setWatching(false);
        router.refresh();
      }
    };
    const id = window.setInterval(() => void tick(), 2000);
    void tick();
    const stop = window.setTimeout(() => setWatching(false), 60_000);
    return () => {
      window.clearInterval(id);
      window.clearTimeout(stop);
    };
  }, [watching, refreshRuns, router]);

  const uberSync = useMemo(
    () => lastSyncForPlatform(syncRuns, "UBER", t("config.integrations.noSyncRuns"), t),
    [syncRuns, t],
  );
  const fnSync = useMemo(
    () => lastSyncForPlatform(syncRuns, "FREENOW", t("config.integrations.noSyncRuns"), t),
    [syncRuns, t],
  );
  const showWatching = watching && hasRunningSyncRuns(historyRows);

  return (
    <VuiPanel className="p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
          <Plug className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <h2 className="text-sm font-semibold text-zinc-900">{t("config.integrations.panelTitle")}</h2>
      </div>

      {showWatching ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          {t("config.integrations.syncWatching")}
        </p>
      ) : null}

      <ul className="divide-y divide-zinc-100">
        <IntegrationRow
          logo={<PlatformLogo id="uber" size="lg" />}
          name={t("config.integrations.uber")}
          active
          subtitle={uberSync}
          t={t}
          action={
            canManageSync ? (
              <PlatformSyncButton options={{ platform: "UBER" }} onStarted={onSyncStarted} />
            ) : undefined
          }
        />
        <IntegrationRow
          logo={<PlatformLogo id="freenow" size="lg" />}
          name={t("config.integrations.freenow")}
          active
          subtitle={fnSync}
          t={t}
          action={
            canManageSync ? (
              <PlatformSyncButton options={{ platform: "FREENOW" }} onStarted={onSyncStarted} />
            ) : undefined
          }
        />
        <IntegrationRow
          logo={
            <span className="opacity-50">
              <PlatformLogo id="bolt" size="lg" />
            </span>
          }
          name={t("config.integrations.bolt")}
          active={false}
          statusLabel={t("config.integrations.comingSoon")}
          subtitle={t("config.integrations.boltSubtitle")}
          t={t}
        />
        <IntegrationRow
          logo={
            <span className="opacity-50">
              <PlatformLogo id="cabify" size="lg" />
            </span>
          }
          name={t("config.integrations.cabify")}
          active={false}
          statusLabel={t("config.integrations.comingSoon")}
          subtitle={t("config.integrations.cabifySubtitle")}
          t={t}
        />
      </ul>

      {canManageSync ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <PlatformSyncButton
            options={{}}
            label={t("config.integrations.syncAll")}
            onStarted={onSyncStarted}
          />
        </div>
      ) : null}

      <ConfiguracionIntegrationPlatformSection
        initial={integrations}
        canEdit={canEditIntegrationSettings}
        showPlatformTenantIds={showPlatformTenantIds}
      />

      {driverCoverage ? <DriverCoverageCard coverage={driverCoverage} /> : null}
      {ingestionKpis ? <IngestionKpisCard kpis={ingestionKpis} /> : null}
      {ingestionTimeSeries ? <IngestionTimeSeriesCard series={ingestionTimeSeries} /> : null}

      <div className="mt-6 rounded-lg border border-sky-100 bg-sky-50/80 px-4 py-3">
        <p className="text-xs font-medium text-sky-950">Ingesta y sync manual</p>
        <p className="mt-1 text-xs leading-relaxed text-sky-900/90">
          Los viajes se obtienen con sync programado o manual (worker + APIs de Uber/FreeNow).
          Respeta los intervalos de polling: consultas muy frecuentes pueden provocar bloqueos.
        </p>
        <p className="mt-2 text-xs text-sky-800/80">
          «Última ingesta» y el historial se actualizan al lanzar sync desde esta pantalla.
        </p>
      </div>

    </VuiPanel>
  );
}
