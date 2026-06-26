"use client";

import { useCallback, useState } from "react";
import { Ruler } from "lucide-react";
import type { TenantAuditLogRow } from "@/features/settings/lib/audit-log-types";
import type {
  ProductivityThresholds,
  TenantNotificationSettings,
} from "@/features/settings/lib/tenant-settings-types";
import { ConfiguracionAuditLogSection } from "@/features/settings/ui/configuracion-audit-log-section";
import { ConfiguracionSyncHistorySection } from "@/features/settings/ui/configuracion-sync-history-section";
import { ConfiguracionNotificationsSection } from "@/features/settings/ui/configuracion-notifications-section";
import type { TenantUserSettingsRow } from "@/features/settings/server/users.queries";
import { buildApiUrl } from "@/shared/lib/api-url";
import {
  ConfiguracionGeneralSection,
  type ConfiguracionGeneralProps,
} from "@/features/settings/ui/configuracion-general-section";
import {
  ConfiguracionUsersSection,
  type CompanyOption,
} from "@/features/settings/ui/configuracion-users-section";
import { ConfiguracionAnalyticsSection } from "@/features/settings/ui/configuracion-analytics-section";
import { ConfiguracionIntegrationsPanel } from "@/features/settings/ui/configuracion-integrations-panel";
import type { TenantAnalyticsSettings } from "@fleethub/auth/tenant-analytics-settings";
import type { SyncHistoryRow } from "@/features/settings/ui/sync-history-table";
import type { TenantIntegrationSettings } from "@/features/settings/server/settings.queries";
import type { TenantDriverCoverage } from "@fleethub/auth";
import type { IngestionKpiSummary } from "@/features/integrations/lib/ingestion-kpis";
import type { TenantIngestionTimeSeries } from "@/features/integrations/lib/ingestion-time-series";
import { useToast } from "@/shared/ui/toast-provider";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";

type SyncRunRow = {
  id: string;
  platform: string;
  status: string;
  startedAt: Date;
  finishedAt: Date | null;
};

function CardHeader({ icon: Icon, title }: { icon: typeof Ruler; title: string }) {
  return (
    <div className="mb-4 flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
        <Icon className="h-4 w-4" strokeWidth={2} aria-hidden />
      </span>
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
    </div>
  );
}

type ConfiguracionPrototypeSectionsProps = {
  tenant: ConfiguracionGeneralProps;
  syncRuns?: SyncRunRow[];
  syncHistory?: SyncHistoryRow[];
  users: TenantUserSettingsRow[];
  companies: CompanyOption[];
  currentUserId: string;
  productivity: ProductivityThresholds;
  notifications: TenantNotificationSettings;
  smtpConfigured: boolean;
  auditLogs: TenantAuditLogRow[];
  canExportAuditLog?: boolean;
  canManageSync?: boolean;
  integrations?: TenantIntegrationSettings;
  driverCoverage?: TenantDriverCoverage;
  ingestionKpis?: IngestionKpiSummary;
  ingestionTimeSeries?: TenantIngestionTimeSeries;
  canEditIntegrationSettings?: boolean;
  showPlatformTenantIds?: boolean;
  analytics?: TenantAnalyticsSettings;
  canManageAnalytics?: boolean;
};

export function ConfiguracionPrototypeSections({
  tenant,
  syncRuns = [],
  syncHistory = [],
  users,
  companies,
  currentUserId,
  productivity,
  notifications,
  smtpConfigured,
  auditLogs,
  canExportAuditLog = false,
  canManageSync = false,
  integrations = {
    pollingMinutesUber: 15,
    pollingMinutesFreeNow: 15,
    freenowPublicCompanyId: "",
    uberOrgId: "",
    uberSyncDays: 7,
    freenowSyncDays: 7,
  },
  driverCoverage,
  ingestionKpis,
  ingestionTimeSeries,
  canEditIntegrationSettings = false,
  showPlatformTenantIds = false,
  analytics = { sectorBenchmarkOptIn: false },
  canManageAnalytics = false,
}: ConfiguracionPrototypeSectionsProps) {
  const toast = useToast();
  const { t } = useTranslations();
  const [eurPerHour, setEurPerHour] = useState(String(productivity.eurPerHourMin));
  const [tripsPerHour, setTripsPerHour] = useState(String(productivity.tripsPerHourMin));
  const [acceptanceRate, setAcceptanceRate] = useState(String(productivity.acceptanceRateMin));
  const [useFleetDayAverages, setUseFleetDayAverages] = useState(
    productivity.useFleetDayAverages === true,
  );
  const [saving, setSaving] = useState(false);

  const handleSaveThresholds = useCallback(async () => {
    setSaving(true);
    try {
      const res = await fetch(buildApiUrl("/api/tenant/settings/productivity"), {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eurPerHourMin: Number(eurPerHour.replace(",", ".")),
          tripsPerHourMin: Number(tripsPerHour.replace(",", ".")),
          acceptanceRateMin: Number(acceptanceRate.replace(",", ".")),
          useFleetDayAverages,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? t("config.productivity.saveError"));
        return;
      }
      toast.success(t("config.productivity.saved"));
    } catch {
      toast.error(t("common.apiConnectionError"));
    } finally {
      setSaving(false);
    }
  }, [acceptanceRate, eurPerHour, t, toast, tripsPerHour, useFleetDayAverages]);

  return (
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
        <ConfiguracionGeneralSection {...tenant} />

        <ConfiguracionUsersSection
          users={users}
          companies={companies}
          currentUserId={currentUserId}
        />

        <ConfiguracionNotificationsSection
          initial={notifications}
          smtpConfigured={smtpConfigured}
        />

        <ConfiguracionIntegrationsPanel
          initialSyncRuns={syncRuns}
          initialSyncHistory={syncHistory}
          integrations={integrations}
          driverCoverage={driverCoverage}
          ingestionKpis={ingestionKpis}
          ingestionTimeSeries={ingestionTimeSeries}
          canManageSync={canManageSync}
          canEditIntegrationSettings={canEditIntegrationSettings}
          showPlatformTenantIds={showPlatformTenantIds}
        />

        <ConfiguracionSyncHistorySection
          initialRows={syncHistory}
          canExport={canExportAuditLog}
        />

        <ConfiguracionAuditLogSection rows={auditLogs} canExport={canExportAuditLog} />
      </div>

      <div className="space-y-4 lg:sticky lg:top-4">
      <VuiPanel className="p-5 md:p-6">
        <CardHeader icon={Ruler} title={t("config.productivity.title")} />
        <div className="space-y-4">
          <label className="block text-xs font-medium text-zinc-600">
            {t("config.productivity.eurPerHourMin")}
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2">
              <input
                type="text"
                inputMode="decimal"
                value={eurPerHour}
                onChange={(e) => setEurPerHour(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold tabular-nums text-zinc-900 outline-none"
              />
              <span className="shrink-0 text-[10px] font-medium text-zinc-500">€/h</span>
            </div>
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            {t("config.productivity.tripsPerHourMin")}
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2">
              <input
                type="text"
                inputMode="decimal"
                value={tripsPerHour}
                onChange={(e) => setTripsPerHour(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold tabular-nums text-zinc-900 outline-none"
              />
              <span className="shrink-0 text-[10px] font-medium text-zinc-500">/h</span>
            </div>
          </label>
          <label className="block text-xs font-medium text-zinc-600">
            {t("config.productivity.acceptanceRateMinShort")}
            <div className="mt-1.5 flex items-center gap-2 rounded-lg border border-zinc-300 bg-white px-3 py-2">
              <input
                type="text"
                inputMode="numeric"
                value={acceptanceRate}
                onChange={(e) => setAcceptanceRate(e.target.value)}
                className="w-full bg-transparent text-sm font-semibold tabular-nums text-zinc-900 outline-none"
              />
              <span className="shrink-0 text-[10px] font-medium text-zinc-500">%</span>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-200 bg-zinc-50/80 px-3 py-3">
            <input
              type="checkbox"
              checked={useFleetDayAverages}
              onChange={(e) => setUseFleetDayAverages(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300"
            />
            <span className="text-xs leading-relaxed text-zinc-700">
              <span className="font-medium text-zinc-900">
                {t("config.productivity.fleetDayAveragesTitle")}
              </span>{" "}
              {t("config.productivity.fleetDayAveragesHint")}
            </span>
          </label>
        </div>
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={() => void handleSaveThresholds()}
            disabled={saving}
            className="erp-btn-primary px-6"
          >
            {saving ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </VuiPanel>

        <ConfiguracionAnalyticsSection
          initial={analytics}
          canEdit={canManageAnalytics}
        />
      </div>
    </div>
  );
}
