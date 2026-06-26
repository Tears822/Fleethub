"use client";

import type { FleetQueuesSnapshot } from "@/features/super-admin/server/sync-monitor.queries";
import { useTranslations } from "@/shared/i18n/i18n-provider";

function QueueBlock({
  title,
  counts,
  labels,
}: {
  title: string;
  counts: { waiting: number; active: number; delayed: number; failed: number };
  labels: {
    retryPending: string;
    active: string;
    waiting: string;
    failed: string;
  };
}) {
  const retryPending = counts.waiting + counts.delayed;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-zinc-700">{title}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-[10px] font-semibold uppercase text-zinc-500">{labels.retryPending}</dt>
          <dd className="font-bold tabular-nums text-amber-800">{retryPending}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase text-zinc-500">{labels.active}</dt>
          <dd className="font-bold tabular-nums">{counts.active}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase text-zinc-500">{labels.waiting}</dt>
          <dd className="font-bold tabular-nums">{counts.waiting}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-semibold uppercase text-zinc-500">{labels.failed}</dt>
          <dd
            className={`font-bold tabular-nums ${counts.failed > 0 ? "text-red-700" : "text-zinc-900"}`}
          >
            {counts.failed}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function SuperAdminQueuesPanel({ queues }: { queues: FleetQueuesSnapshot }) {
  const { t } = useTranslations();

  if (!queues.available) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
        {t("superAdmin.sync.queuesUnavailable")}
      </div>
    );
  }

  const queueLabels = {
    retryPending: t("superAdmin.sync.retryPendingShort"),
    active: t("superAdmin.sync.queueActive"),
    waiting: t("superAdmin.sync.queueWaiting"),
    failed: t("superAdmin.sync.queueFailedShort"),
  };

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">
          {t("superAdmin.sync.retryPendingTotal")}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-amber-950">
          {queues.retryPendingTotal}
        </p>
        <p className="mt-0.5 text-xs text-amber-900/80">{t("superAdmin.sync.retryPendingHint")}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <QueueBlock title="fleethub-fleet-sync" counts={queues.fleetSync} labels={queueLabels} />
        <QueueBlock title="fleethub-webhook-ingest" counts={queues.webhookIngest} labels={queueLabels} />
        <QueueBlock title="fleethub-tenant-export" counts={queues.tenantExport} labels={queueLabels} />
      </div>
    </div>
  );
}
