"use client";

import { useCallback, useState } from "react";
import {
  formatEuroFromCents,
  formatLiquidationPeriod,
  type LiquidationPreviewDto,
} from "@/features/shifts/lib/format-liquidation";
import { useTranslations } from "@/shared/i18n/i18n-provider";

type Props = {
  preview: LiquidationPreviewDto;
  driverId: string;
  tripIds: string[];
  loading: boolean;
  pdfLoading: boolean;
  onDownloadPdf: (note: string) => void;
  onConfirm: (note: string) => void;
  onCancel: () => void;
};

function SummaryRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-zinc-600">{label}</span>
      <span className={highlight ? "font-semibold text-emerald-700" : "font-medium text-zinc-900"}>
        {value}
      </span>
    </div>
  );
}

export function ShiftCloseConfirmDialog({
  preview,
  driverId,
  tripIds,
  loading,
  pdfLoading,
  onDownloadPdf,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslations();
  const [note, setNote] = useState("");

  const handleConfirm = useCallback(() => {
    onConfirm(note.trim());
  }, [note, onConfirm]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shift-close-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 id="shift-close-title" className="text-base font-semibold text-zinc-900">
          {t("turnos.closeDialog.title")}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">
          {preview.driverName} · {preview.companyName}
        </p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {preview.tripCount} viaje{preview.tripCount === 1 ? "" : "s"} ·{" "}
          {formatLiquidationPeriod(preview.periodFrom, preview.periodTo)}
        </p>

        {preview.timeRangeApplied ? (
          <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            {t("turnos.closeDialog.partialClose")}
          </p>
        ) : null}

        {preview.unvalidatedCount > 0 ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            {t("turnos.closeDialog.unvalidated", { count: preview.unvalidatedCount })}
          </p>
        ) : null}

        {(preview.unbalancedPaymentCount ?? 0) > 0 ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
            {t("turnos.closeDialog.unbalanced", { count: preview.unbalancedPaymentCount ?? 0 })}
          </p>
        ) : null}

        <div className="mt-4 space-y-2 rounded-lg border border-zinc-100 bg-zinc-50 p-4">
          <SummaryRow label={t("turnos.closeDialog.gross")} value={formatEuroFromCents(preview.grossCents)} />
          <SummaryRow label={t("turnos.closeDialog.vat")} value={formatEuroFromCents(preview.vatCents)} />
          <SummaryRow label={t("turnos.closeDialog.net")} value={formatEuroFromCents(preview.netCents)} />
          <SummaryRow
            label={t("turnos.closeDialog.driverNet", { pct: preview.driverSharePct })}
            value={formatEuroFromCents(preview.driverNetCents)}
          />
          <SummaryRow label={t("turnos.closeDialog.companyNet")} value={formatEuroFromCents(preview.companyNetCents)} />
          {preview.t3Cents > 0 ? (
            <SummaryRow label={t("turnos.closeDialog.t3")} value={formatEuroFromCents(preview.t3Cents)} />
          ) : null}
          <SummaryRow label={t("turnos.closeDialog.platformBonus")} value={formatEuroFromCents(preview.bonusCents)} />
          {preview.bonusCents > 0 ? (
            <SummaryRow
              label={t("turnos.closeDialog.driverBonus", { pct: preview.driverBonusSharePct })}
              value={formatEuroFromCents(preview.driverBonusCents)}
            />
          ) : null}
          {preview.platformFeeCents > 0 ? (
            <>
              <SummaryRow
                label={t("turnos.closeDialog.platformFee")}
                value={formatEuroFromCents(preview.platformFeeCents)}
              />
              {preview.driverPlatformFeeCents > 0 ? (
                <SummaryRow
                  label={t("turnos.closeDialog.driverFee", { pct: preview.driverPlatformFeeSharePct })}
                  value={formatEuroFromCents(preview.driverPlatformFeeCents)}
                />
              ) : null}
            </>
          ) : null}
          {preview.dailyFixedCents > 0 ? (
            <SummaryRow
              label={t("turnos.closeDialog.dailyFixed")}
              value={formatEuroFromCents(preview.dailyFixedCents)}
            />
          ) : null}
          <SummaryRow label={t("turnos.closeDialog.cash")} value={formatEuroFromCents(preview.cashCents)} />
          <SummaryRow label={t("turnos.closeDialog.tips")} value={formatEuroFromCents(preview.tipsCents)} />
          <SummaryRow label={t("turnos.closeDialog.tolls")} value={formatEuroFromCents(preview.tollsCents)} />
          <SummaryRow
            label={t("turnos.closeDialog.totalSettle")}
            value={formatEuroFromCents(preview.totalToSettleCents)}
            highlight
          />
        </div>

        <label className="mt-4 block text-xs font-medium text-zinc-600">
          {t("turnos.closeDialog.noteOptional")}
          <textarea
            className="erp-inline-input mt-1 w-full resize-none"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={loading}
            placeholder={t("turnos.closeDialog.notePlaceholder")}
          />
        </label>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="erp-btn-secondary"
            disabled={loading || pdfLoading}
            onClick={onCancel}
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            className="erp-btn-secondary"
            disabled={loading || pdfLoading || !driverId || tripIds.length === 0}
            onClick={() => onDownloadPdf(note.trim())}
          >
            {pdfLoading ? t("turnos.closeDialog.generatingPdf") : t("turnos.closeDialog.previewPdf")}
          </button>
          <button
            type="button"
            className="erp-btn-primary"
            disabled={
              loading ||
              pdfLoading ||
              preview.unvalidatedCount > 0 ||
              (preview.unbalancedPaymentCount ?? 0) > 0
            }
            onClick={handleConfirm}
          >
            {loading ? t("turnos.closeDialog.closing") : t("turnos.closeDialog.confirmClose")}
          </button>
        </div>
      </div>
    </div>
  );
}
