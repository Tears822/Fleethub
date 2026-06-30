import Link from "next/link";
import type { SuperAdminSyncAlertSummary } from "@fleethub/auth";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";
import type { AppSession } from "@fleethub/auth";

export async function SuperAdminDashboardSyncAlerts({
  session,
  alerts,
}: {
  session: AppSession;
  alerts: SuperAdminSyncAlertSummary;
}) {
  const { t } = await getSessionTranslator(session);
  const hasQueue = alerts.queueFailed > 0;
  const hasTenants = alerts.tenantsWithProblems > 0;
  const hasStale = alerts.staleRunningCount > 0;
  if (!hasQueue && !hasTenants && !hasStale) return null;

  return (
    <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
      {hasQueue ? (
        <p className="text-sm font-semibold text-red-800">
          {t("superAdmin.dashboard.alertSyncFailures", { count: alerts.queueFailed })}{" "}
          <Link href="/super-admin/sync" className="underline">
            Sync global →
          </Link>
        </p>
      ) : null}
      {hasStale ? (
        <p className="text-sm text-red-800">
          {alerts.staleRunningCount} sync bloqueada(s) «En curso» — usa Reconciliar en Sync global.
        </p>
      ) : null}
      {hasTenants ? (
        <p className="text-sm text-red-800">
          {t("superAdmin.dashboard.alertStaleSync", { count: alerts.tenantsWithProblems })}{" "}
          <Link href="/super-admin/sync" className="underline">
            Sync global →
          </Link>
        </p>
      ) : null}
    </div>
  );
}
