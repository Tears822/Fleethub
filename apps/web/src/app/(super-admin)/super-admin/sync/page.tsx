import { getSession } from "@/features/auth/server/session.service";
import { listGlobalSyncErrors } from "@/features/super-admin/server/reports.queries";
import { getSuperAdminSyncMonitorData } from "@/features/super-admin/server/sync-monitor.queries";
import {
  SuperAdminSyncErrorsSummary,
  SuperAdminSyncErrorsTable,
} from "@/features/super-admin/ui/super-admin-sync-errors-table";
import { SuperAdminAutoPollHealthCard } from "@/features/super-admin/ui/super-admin-auto-poll-health";
import { SuperAdminIngestionCharts } from "@/features/super-admin/ui/super-admin-ingestion-charts";
import { SuperAdminIngestionKpisSummary } from "@/features/super-admin/ui/super-admin-ingestion-kpis";
import { SuperAdminQueuesPanel } from "@/features/super-admin/ui/super-admin-queues-panel";
import { SuperAdminSyncApiSuccessCard } from "@/features/super-admin/ui/super-admin-sync-api-success";
import { SuperAdminSyncRecoveryActions } from "@/features/super-admin/ui/super-admin-sync-recovery-actions";
import { SuperAdminSyncHealthTable } from "@/features/super-admin/ui/super-admin-sync-health-table";
import {
  SuperAdminCard,
  SuperAdminPageChrome,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function SuperAdminSyncPage() {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  const [{ rows, summary }, monitor] = await Promise.all([
    listGlobalSyncErrors(80),
    getSuperAdminSyncMonitorData(),
  ]);

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.sync.title")}
      subtitle={t("superAdmin.pages.sync.subtitle")}
      backHref="/super-admin"
    >
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("superAdmin.pages.sync.queuesSection")}
      </p>
      <div className="mt-2 grid gap-3 lg:grid-cols-[1fr_280px]">
        <SuperAdminQueuesPanel queues={monitor.queues} />
        <SuperAdminSyncApiSuccessCard stats={monitor.syncApi24h} />
      </div>
      <div className="mt-3">
        <SuperAdminSyncRecoveryActions />
      </div>
      <div className="mt-3">
        <SuperAdminAutoPollHealthCard health={monitor.autoPoll} />
      </div>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("superAdmin.pages.sync.ingestionSection")}
      </p>
      <div className="mt-2">
        <SuperAdminIngestionKpisSummary kpis={monitor.ingestion} />
      </div>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("superAdmin.pages.sync.trendSection")}
      </p>
      <div className="mt-2">
        <SuperAdminIngestionCharts
          hourly24h={monitor.ingestionHourly24h}
          daily7d={monitor.ingestionDaily7d}
          syncFailures24h={monitor.syncFailures24h}
        />
      </div>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("superAdmin.pages.sync.coverageSection")}
      </p>
      <SuperAdminCard className="mt-2 overflow-hidden p-0">
        <SuperAdminSyncHealthTable rows={monitor.tenants} />
      </SuperAdminCard>

      <p className="mt-8 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("superAdmin.pages.sync.errorsSection")}
      </p>
      <div className="mt-2">
        <SuperAdminSyncErrorsSummary summary={summary} />
      </div>
      <SuperAdminCard className="mt-4 overflow-hidden p-0">
        <SuperAdminSyncErrorsTable rows={rows} />
      </SuperAdminCard>
    </SuperAdminPageChrome>
  );
}
