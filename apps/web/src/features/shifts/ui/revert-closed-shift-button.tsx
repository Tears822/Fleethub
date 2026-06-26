"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { buildApiUrl } from "@/shared/lib/api-url";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";
import type { ClosedShiftRow } from "@/features/shifts/ui/cerrar-turnos-types";

export type RevertClosedShiftVariant = "admin" | "superAdmin";

type Props = {
  row: ClosedShiftRow;
  endpoint: string;
  variant: RevertClosedShiftVariant;
};

export function RevertClosedShiftButton({ row, endpoint, variant }: Props) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const [portalReady, setPortalReady] = useState(false);

  const buttonLabel =
    variant === "superAdmin" ? t("turnos.revert.superAdminButton") : t("turnos.revert.adminButton");
  const dialogTitle =
    variant === "superAdmin" ? t("turnos.revert.superAdminTitle") : t("turnos.revert.adminTitle");
  const warningMessage =
    variant === "superAdmin"
      ? t("turnos.revert.superAdminWarning")
      : t("turnos.revert.adminWarning");

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const handleRevert = useCallback(async () => {
    if (!row.tripIds.length) {
      toast.error(t("turnos.revert.noTrips"));
      return;
    }
    if (reason.trim().length < 3) {
      toast.error(t("turnos.revert.reasonRequired"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(buildApiUrl(endpoint), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripIds: row.tripIds,
          driverId: row.driverId,
          reason: reason.trim(),
        }),
      });
      const data = (await res.json()) as { error?: string; revertedCount?: number };
      if (!res.ok) {
        toast.error(data.error ?? t("turnos.revert.reopenError"));
        return;
      }
      toast.success(
        data.revertedCount === 1
          ? t("turnos.revert.reopenSuccessSingle")
          : t("turnos.revert.reopenSuccessMany", { count: data.revertedCount ?? 0 }),
      );
      setOpen(false);
      setReason("");
      router.refresh();
    } catch {
      toast.error(t("turnos.revert.connectionError"));
    } finally {
      setLoading(false);
    }
  }, [endpoint, reason, row.driverId, row.tripIds, router, t, toast]);

  return (
    <>
      <button
        type="button"
        className="erp-btn-secondary py-1 text-[11px] text-amber-900 ring-1 ring-amber-300"
        onClick={() => setOpen(true)}
        disabled={loading}
      >
        {buttonLabel}
      </button>

      {open && portalReady
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="revert-close-title"
            >
              <div className="flex w-full max-w-md max-h-[min(90vh,640px)] flex-col rounded-xl border border-zinc-200 bg-white shadow-xl">
                <div className="overflow-y-auto p-6">
                  <h2 id="revert-close-title" className="text-base font-semibold text-zinc-900">
                    {dialogTitle}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-600">{row.conductor}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {t("turnos.revert.tripSummary", { count: row.viajes, range: row.rango })}
                  </p>
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-950">
                    {warningMessage}
                  </p>
                  <div className="mt-4 space-y-1.5">
                    <label
                      htmlFor="revert-close-reason"
                      className="block text-xs font-medium text-zinc-600"
                    >
                      {t("turnos.revert.reasonLabel")}
                    </label>
                    <textarea
                      id="revert-close-reason"
                      className="erp-inline-input block w-full min-w-0 resize-none"
                      rows={3}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      disabled={loading}
                      placeholder={t("turnos.revert.reasonPlaceholder")}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 bg-zinc-50/80 px-6 py-4">
                  <button
                    type="button"
                    className="erp-btn-secondary"
                    disabled={loading}
                    onClick={() => {
                      setOpen(false);
                      setReason("");
                    }}
                  >
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className="erp-btn-primary bg-amber-700 hover:bg-amber-800"
                    disabled={loading || reason.trim().length < 3}
                    onClick={() => void handleRevert()}
                  >
                    {loading ? t("turnos.revert.reopening") : t("common.confirm")}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
