"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorMessage } from "@/features/super-admin/lib/parse-api-error";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type RecoveryResponse = {
  ok?: boolean;
  reconciled?: number;
  enqueued?: number;
  retried?: number;
  orphansRemoved?: number;
  error?: string;
};

export function SuperAdminSyncRecoveryActions() {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<"reconcile" | "retry" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction(kind: "reconcile" | "retry") {
    setBusy(kind);
    setMessage(null);
    setError(null);

    const url =
      kind === "reconcile"
        ? "/api/super-admin/sync/reconcile-stale"
        : "/api/super-admin/sync/retry-failed";

    try {
      const res = await fetch(buildApiUrl(url), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });

      const text = await res.text();
      let data: RecoveryResponse = {};
      if (text) {
        try {
          data = JSON.parse(text) as RecoveryResponse;
        } catch {
          data = {};
        }
      }

      if (!res.ok) {
        const errMsg = apiErrorMessage(
          res,
          data,
          kind === "reconcile"
            ? t("superAdmin.sync.reconcileFailed")
            : t("superAdmin.sync.retryFailedActionFailed"),
          t("superAdmin.sync.actionNotFound"),
        );
        setError(errMsg);
        toast.error(errMsg);
        return;
      }

      if (kind === "reconcile") {
        const count = data.reconciled ?? 0;
        const enqueued = data.enqueued ?? 0;
        const orphans = data.orphansRemoved ?? 0;
        const msg =
          count === 0
            ? t("superAdmin.sync.reconcileStaleSuccessNone")
            : t("superAdmin.sync.reconcileStaleSuccess", { count: String(count) }) +
              (enqueued > 0
                ? ` · ${t("superAdmin.sync.reconcileEnqueued", { count: String(enqueued) })}`
                : "") +
              (orphans > 0
                ? ` · ${t("superAdmin.sync.orphansRemoved", { count: String(orphans) })}`
                : "");
        setMessage(msg);
        toast.success(msg);
      } else {
        const count = data.retried ?? 0;
        const msg =
          count === 0
            ? t("superAdmin.sync.retryFailedSuccessNone")
            : t("superAdmin.sync.retryFailedSuccess", { count: String(count) });
        setMessage(msg);
        toast.success(msg);
      }

      router.refresh();
    } catch {
      const errMsg = t("common.apiConnectionError");
      setError(errMsg);
      toast.error(errMsg);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/60 p-4">
      <p className="text-sm font-semibold text-zinc-900">{t("superAdmin.sync.actionsTitle")}</p>
      <p className="mt-1 text-xs text-zinc-600">{t("superAdmin.sync.actionsHint")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void runAction("reconcile")}
          className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
        >
          {busy === "reconcile" ? t("superAdmin.sync.reconcileWorking") : t("superAdmin.sync.reconcileStale")}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void runAction("retry")}
          className="rounded-md border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-60"
        >
          {busy === "retry" ? t("superAdmin.sync.retryWorking") : t("superAdmin.sync.retryFailedJobs")}
        </button>
      </div>
      {message ? <p className="mt-2 text-xs font-medium text-emerald-800">{message}</p> : null}
      {error ? <p className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}
    </div>
  );
}
