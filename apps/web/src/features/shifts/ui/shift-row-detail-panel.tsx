"use client";

import { memo, useCallback, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  TRIP_DETAIL_HEADERS,
  tripLineToRow,
  type PlatformBlock,
  type ShiftActivity,
  type TripLine,
} from "@/features/shifts/lib/cerrar-turnos-mock-detail";
import { downloadShiftDetailPdf } from "@/features/shifts/lib/shift-detail-pdf-export";
import {
  ShiftTripPaymentEditorCell,
  derivePaymentEditModeForLine,
  tripLineNeedsPaymentEditor,
  useShiftTripPaymentEditor,
} from "@/features/shifts/ui/shift-trip-payment-editor";
import { paymentModeNeedsManualReview } from "@fleethub/auth/trip-payment-amounts";
import {
  parseShiftHorasConectadoMinutes,
  resolveShiftEurHoraDisplay,
} from "@fleethub/auth/shift-activity";
import {
  platformSummaryLabel,
  type CerrarTurnosRow,
  type PlatformShiftMetrics,
  type ShiftPlatformName,
  type ShiftTableRow,
} from "@/features/shifts/ui/cerrar-turnos-types";
import { ShiftMetricsSummaryStrip } from "@/features/shifts/ui/shift-metrics-cells";
import {
  useLivePlatformShiftDetail,
  useLiveShiftRowDetail,
  type ShiftLiveDetailInput,
} from "@/features/shifts/ui/use-live-shift-detail";
import { downloadExcelTable } from "@/shared/lib/download-spreadsheet";
import { useToast } from "@/shared/ui/toast-provider";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import type { Translator } from "@fleethub/i18n";
import { OperativaWriteButton } from "@/shared/ui/operativa-write-button";
import { Check } from "lucide-react";

function platformDotClass(platform: PlatformBlock["platform"]): string {
  return platform === "FreeNow" ? "bg-red-500" : "bg-zinc-900";
}

/**
 * Estilos de relieve para los grupos de columnas del detalle de turno.
 * SERVICIO (Importe / Taxímetro / Tarifa 3) → azul. PAGO (App / Efectivo / Tarjeta) → ámbar.
 * El recuadro se forma con bordes laterales en las columnas de los extremos de cada grupo.
 */
const GROUP_TINT_SERVICIO = "bg-sky-50";
const GROUP_TINT_PAGO = "bg-amber-50";
const GROUP_CELL_SERVICIO_L = "bg-sky-50 border-l border-sky-200";
const GROUP_CELL_SERVICIO_M = "bg-sky-50";
const GROUP_CELL_SERVICIO_R = "bg-sky-50 border-r border-sky-200";
const GROUP_CELL_PAGO_L = "bg-amber-50 border-l border-amber-200";
const GROUP_CELL_PAGO_M = "bg-amber-50";
const GROUP_CELL_PAGO_R = "bg-amber-50 border-r border-amber-200";
const TOTAL_ROW_CELL = "bg-zinc-100";

/** En fila de totales, fondo gris uniforme; en viajes, tinte del grupo SERVICIO/PAGO. */
function groupCellClass(groupTint: string, isTotal: boolean): string {
  return isTotal ? TOTAL_ROW_CELL : groupTint;
}

function tripDetailHeaders(t: Translator): string[] {
  return [
    t("turnos.detail.headers.fechaHora"),
    t("turnos.detail.headers.tarifa"),
    t("turnos.detail.headers.tipoPago"),
    t("turnos.detail.headers.importe"),
    t("turnos.detail.headers.taximetro"),
    t("turnos.detail.headers.t3"),
    t("turnos.detail.headers.pagoApp"),
    t("turnos.detail.headers.efectivo"),
    t("turnos.detail.headers.tarjeta"),
    t("turnos.detail.headers.comision"),
    t("turnos.detail.headers.total"),
    t("turnos.detail.headers.propinas"),
    t("turnos.detail.headers.primas"),
    t("turnos.detail.headers.peajes"),
  ];
}

/** Tinte de fondo por índice de columna del detalle (grupos SERVICIO / PAGO). */
function detailGroupTint(i: number): string {
  if (i >= 3 && i <= 5) {
    if (i === 3) return GROUP_CELL_SERVICIO_L;
    if (i === 5) return GROUP_CELL_SERVICIO_R;
    return GROUP_CELL_SERVICIO_M;
  }
  if (i >= 6 && i <= 8) {
    if (i === 6) return GROUP_CELL_PAGO_L;
    if (i === 8) return GROUP_CELL_PAGO_R;
    return GROUP_CELL_PAGO_M;
  }
  return "bg-zinc-50";
}

export function blockTotalToMetrics(block: PlatformBlock): PlatformShiftMetrics {
  const t = block.total;
  return {
    platform: block.platform,
    viajes: block.viajes,
    total: t.importe,
    taximetro: t.taximetro,
    t3: t.t3,
    app: t.app,
    efectivo: t.efectivo,
    tarjetas: t.tarjeta,
    propinas: t.propinas,
    primas: t.primas,
    peajes: t.peajes,
    avisos: block.pendingPaymentTripIds?.length ?? 0,
  };
}

function PaymentValidationBanner({
  manualCount,
  appReconcileCount,
}: {
  manualCount: number;
  appReconcileCount: number;
}) {
  const { t } = useTranslations();
  if (manualCount <= 0 && appReconcileCount <= 0) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
      {manualCount > 0 ? (
        <p>{t("turnos.detail.paymentBannerManual", { count: manualCount })}</p>
      ) : null}
      {appReconcileCount > 0 ? (
        <p className={manualCount > 0 ? "mt-1" : undefined}>
          {t("turnos.detail.paymentBannerApp", { count: appReconcileCount })}
        </p>
      ) : null}
    </div>
  );
}

const TRIP_DETAIL_PAGE_SIZE = 40;

function tripRowClass(
  line: TripLine,
  isTotal: boolean,
  highlightPending: boolean,
  highlightVerified: boolean,
): string {
  if (isTotal) return "bg-zinc-100 font-semibold text-zinc-900";
  if (highlightPending) return "bg-rose-50/80 text-zinc-700";
  if (highlightVerified) return "bg-emerald-50/70 text-zinc-700";
  return "text-zinc-700";
}

type VerificationStatus = "verified" | "pending" | "none";

/** Estado de verificación de una línea de pago manual (efectivo/tarjeta/mixto). */
function lineVerificationStatus(line: TripLine): VerificationStatus {
  if (!line.tripId) return "none";
  if (!paymentModeNeedsManualReview(derivePaymentEditModeForLine(line))) return "none";
  if (line.pagoSinConfirmar || line.pagoDescuadrado) return "pending";
  return "verified";
}

/** Acento de borde izquierdo según el estado de verificación (escaneo de un vistazo). */
function statusAccentClass(status: VerificationStatus): string {
  if (status === "verified") return "border-l-4 border-emerald-400";
  if (status === "pending") return "border-l-4 border-rose-400";
  return "border-l-4 border-transparent";
}

/** Primera celda (Fecha/hora) con acento de estado e icono de verificación. */
function TripRowFirstCell({
  status,
  children,
}: {
  status: VerificationStatus;
  children: ReactNode;
}) {
  const { t } = useTranslations();
  return (
    <td className={`whitespace-nowrap px-2 py-2 ${statusAccentClass(status)}`}>
      <span className="flex items-center gap-1">
        {status === "verified" ? (
          <Check
            className="h-3.5 w-3.5 shrink-0 text-emerald-600"
            aria-label={t("turnos.payment.verified")}
          />
        ) : status === "pending" ? (
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-rose-500"
            aria-label={t("turnos.detail.paymentUnconfirmed")}
            title={t("turnos.detail.paymentUnconfirmed")}
          />
        ) : null}
        <span>{children}</span>
      </span>
    </td>
  );
}

const TripPaymentTableRowReadOnly = memo(function TripPaymentTableRowReadOnly({
  line,
  isTotal,
  highlightPending,
  highlightVerified,
}: {
  line: TripLine;
  isTotal: boolean;
  highlightPending: boolean;
  highlightVerified: boolean;
}) {
  const { t } = useTranslations();
  const status: VerificationStatus = isTotal ? "none" : lineVerificationStatus(line);
  return (
    <tr className={tripRowClass(line, isTotal, highlightPending, highlightVerified)}>
      <TripRowFirstCell status={status}>{line.fechaHora}</TripRowFirstCell>
      <td className="px-2 py-2">{line.tarifa}</td>
      <td className="px-2 py-2 align-top">
        {line.tipoPago}
        {line.pagoSinConfirmar && !isTotal ? (
          <span className="ml-1 text-[10px] font-normal text-amber-700">{t("turnos.detail.paymentUnconfirmed")}</span>
        ) : null}
        {line.pagoDescuadrado && !isTotal ? (
          <span className="ml-1 text-[10px] font-normal text-red-700">{t("turnos.detail.paymentUnbalanced")}</span>
        ) : null}
      </td>
      <td className={`px-2 py-2 tabular-nums text-right ${groupCellClass(GROUP_CELL_SERVICIO_L, isTotal)}`}>{line.importe}</td>
      <td className={`px-2 py-2 tabular-nums text-right ${groupCellClass(GROUP_CELL_SERVICIO_M, isTotal)}`}>{line.taximetro}</td>
      <td className={`px-2 py-2 tabular-nums text-right ${groupCellClass(GROUP_CELL_SERVICIO_R, isTotal)}`}>{line.t3}</td>
      <td className={`px-2 py-2 tabular-nums text-right ${groupCellClass(GROUP_CELL_PAGO_L, isTotal)}`}>{line.app}</td>
      <td
        className={`px-2 py-2 tabular-nums text-right ${groupCellClass(GROUP_CELL_PAGO_M, isTotal)} ${!isTotal && line.efectivo !== "0,00 €" && line.efectivo !== "—" ? "text-red-600" : ""}`}
      >
        {line.efectivo}
      </td>
      <td className={`px-2 py-2 tabular-nums text-right ${groupCellClass(GROUP_CELL_PAGO_R, isTotal)}`}>{line.tarjeta}</td>
      <td
        className={`px-2 py-2 tabular-nums text-right ${line.comision.startsWith("-") ? "text-red-600" : ""}`}
      >
        {line.comision}
      </td>
      <td className="px-2 py-2 tabular-nums text-right font-semibold">{line.total}</td>
      <td className="px-2 py-2 tabular-nums text-right">{line.propinas}</td>
      <td className="px-2 py-2 tabular-nums text-right">{line.primas}</td>
      <td className="px-2 py-2 tabular-nums text-right">{line.peajes}</td>
    </tr>
  );
});

const TripPaymentTableRowEditable = memo(function TripPaymentTableRowEditable({
  line,
  onPaymentSaved,
  onPaymentError,
}: {
  line: TripLine;
  onPaymentSaved: () => void;
  onPaymentError: (message: string) => void;
}) {
  const { t } = useTranslations();
  const editor = useShiftTripPaymentEditor(line, {
    onSaved: onPaymentSaved,
    onError: onPaymentError,
  });
  const needsPaymentSelector = paymentModeNeedsManualReview(editor.mode);
  const needsPaymentAttention = Boolean(line.pagoSinConfirmar && needsPaymentSelector);
  const paymentUnbalanced = Boolean(line.pagoDescuadrado);
  const isVerifiedManual =
    needsPaymentSelector &&
    !line.pagoSinConfirmar &&
    !editor.hasPendingChanges &&
    !paymentUnbalanced;
  const showAppReconcile = editor.mode === "app" && paymentUnbalanced;
  const rowStatus: VerificationStatus = isVerifiedManual
    ? "verified"
    : needsPaymentSelector
      ? "pending"
      : "none";

  return (
    <tr
      className={tripRowClass(
        line,
        false,
        needsPaymentAttention || paymentUnbalanced,
        isVerifiedManual,
      )}
    >
      <TripRowFirstCell status={rowStatus}>{line.fechaHora}</TripRowFirstCell>
      <td className="px-2 py-2">{line.tarifa}</td>
      <td
        className={`px-2 py-2 align-top ${
          needsPaymentAttention
            ? "font-semibold text-amber-800"
            : paymentUnbalanced
              ? "font-semibold text-red-800"
              : isVerifiedManual
                ? "text-emerald-900"
                : ""
        }`}
      >
        {needsPaymentSelector ? (
          <div className="flex items-center gap-1.5">
            <ShiftTripPaymentEditorCell editor={editor} cell="tipo" />
            <ShiftTripPaymentEditorCell editor={editor} cell="confirm" />
          </div>
        ) : showAppReconcile ? (
          <div className="flex items-center gap-1.5">
            <span>{line.tipoPago}</span>
            <OperativaWriteButton
              kind="shifts"
              type="button"
              disabled={editor.loading}
              onClick={() => void editor.save(true)}
              className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
              title={t("turnos.detail.fixAppPayment")}
            >
              <Check className="h-3.5 w-3.5" aria-hidden />
              {editor.loading ? "…" : t("turnos.detail.fix")}
            </OperativaWriteButton>
          </div>
        ) : (
          <span>{line.tipoPago}</span>
        )}
      </td>
      <td className={`px-2 py-2 tabular-nums text-right ${GROUP_CELL_SERVICIO_L}`}>{line.importe}</td>
      <td className={`px-2 py-2 tabular-nums text-right ${GROUP_CELL_SERVICIO_M}`}>{line.taximetro}</td>
      <td className={`px-2 py-2 tabular-nums text-right ${GROUP_CELL_SERVICIO_R}`}>{line.t3}</td>
      <td
        className={`px-2 py-2 tabular-nums text-right ${GROUP_CELL_PAGO_L} ${editor.mode === "app" ? "font-semibold text-zinc-900" : ""}`}
      >
        {editor.preview.app}
      </td>
      <td
        className={`px-2 py-2 align-top text-right ${GROUP_CELL_PAGO_M} ${editor.mode === "cash" ? "font-semibold text-red-600" : ""}`}
      >
        {editor.mode === "mixed" ? (
          <ShiftTripPaymentEditorCell editor={editor} cell="efectivo" />
        ) : (
          <span className="tabular-nums">{editor.preview.efectivo}</span>
        )}
      </td>
      <td
        className={`px-2 py-2 align-top text-right ${GROUP_CELL_PAGO_R} ${editor.mode === "card" ? "font-semibold text-zinc-900" : ""}`}
      >
        {editor.mode === "mixed" ? (
          <ShiftTripPaymentEditorCell editor={editor} cell="tarjeta" />
        ) : (
          <span className="tabular-nums">{editor.preview.tarjeta}</span>
        )}
      </td>
      <td
        className={`px-2 py-2 tabular-nums text-right ${line.comision.startsWith("-") ? "text-red-600" : ""}`}
      >
        {line.comision}
      </td>
      <td className="px-2 py-2 tabular-nums text-right font-semibold">{line.total}</td>
      <td className="px-2 py-2 tabular-nums text-right">{line.propinas}</td>
      <td className="px-2 py-2 tabular-nums text-right">{line.primas}</td>
      <td className="px-2 py-2 tabular-nums text-right">{line.peajes}</td>
    </tr>
  );
});

function TripPaymentTableRow({
  line,
  isTotal,
  showEditor,
  onPaymentSaved,
  onPaymentError,
}: {
  line: TripLine;
  isTotal: boolean;
  showEditor: boolean;
  onPaymentSaved: () => void;
  onPaymentError: (message: string) => void;
}) {
  if (isTotal) {
    return (
      <TripPaymentTableRowReadOnly line={line} isTotal highlightPending={false} highlightVerified={false} />
    );
  }

  const useEditor = showEditor && line.tripId && tripLineNeedsPaymentEditor(line);

  if (useEditor) {
    return (
      <TripPaymentTableRowEditable
        key={line.tripId}
        line={line}
        onPaymentSaved={onPaymentSaved}
        onPaymentError={onPaymentError}
      />
    );
  }

  const highlightPending = Boolean(
    showEditor && (line.pagoSinConfirmar || line.pagoDescuadrado),
  );

  return (
    <TripPaymentTableRowReadOnly
      line={line}
      isTotal={false}
      highlightPending={highlightPending}
      highlightVerified={false}
    />
  );
}

function platformBlockMetricsFingerprint(block: PlatformBlock): string {
  const m = blockTotalToMetrics(block);
  return [
    block.platform,
    block.viajes,
    block.trips.length,
    m.viajes,
    m.total,
    m.taximetro,
    m.t3,
    m.app,
    m.efectivo,
    m.tarjetas,
    m.propinas,
    m.primas,
    m.peajes,
    m.avisos ?? 0,
  ].join("|");
}

function TripDetailTable({
  block,
  showActivitySidebar = true,
  showPaymentActions = false,
  onPaymentSaved,
  onPaymentError,
}: {
  block: PlatformBlock;
  showActivitySidebar?: boolean;
  showPaymentActions?: boolean;
  onPaymentSaved?: () => void;
  onPaymentError?: (message: string) => void;
}) {
  const { t } = useTranslations();
  const headers = tripDetailHeaders(t);
  const pendingCount = block.pendingPaymentTripIds?.length ?? 0;
  const manualPaymentCount = block.trips.filter(
    (trip) =>
      trip.pagoSinConfirmar &&
      paymentModeNeedsManualReview(derivePaymentEditModeForLine(trip)),
  ).length;
  const appReconcileCount = block.trips.filter(
    (trip) => trip.pagoDescuadrado && derivePaymentEditModeForLine(trip) === "app",
  ).length;
  const manualReviewTrips = block.trips.filter(
    (trip) =>
      trip.tripId && paymentModeNeedsManualReview(derivePaymentEditModeForLine(trip)),
  );
  const verifiedReviewCount = manualReviewTrips.filter(
    (trip) => !trip.pagoSinConfirmar && !trip.pagoDescuadrado,
  ).length;
  const totalReviewCount = manualReviewTrips.length;
  const [page, setPage] = useState(0);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [isPaging, startPagingTransition] = useTransition();

  const filteredTrips = showPendingOnly
    ? block.trips.filter((trip) => tripLineNeedsPaymentEditor(trip))
    : block.trips;

  const totalPages = Math.max(1, Math.ceil(filteredTrips.length / TRIP_DETAIL_PAGE_SIZE));
  const needsPaging = filteredTrips.length > TRIP_DETAIL_PAGE_SIZE;
  const safePage = Math.min(page, totalPages - 1);
  const visibleTrips = needsPaging
    ? filteredTrips.slice(
        safePage * TRIP_DETAIL_PAGE_SIZE,
        (safePage + 1) * TRIP_DETAIL_PAGE_SIZE,
      )
    : filteredTrips;

  useEffect(() => {
    setPage(0);
  }, [block.platform, block.viajes, showPendingOnly]);

  const stableOnPaymentSaved = useCallback(() => {
    onPaymentSaved?.();
  }, [onPaymentSaved]);

  const stableOnPaymentError = useCallback(
    (message: string) => {
      onPaymentError?.(message);
    },
    [onPaymentError],
  );

  const renderRow = (line: TripLine, isTotal: boolean) => {
    const showEditor =
      showPaymentActions &&
      !isTotal &&
      line.tripId &&
      onPaymentSaved &&
      onPaymentError;

    return (
      <TripPaymentTableRow
        key={`${block.platform}-${line.fechaHora}-${line.tripId ?? "total"}`}
        line={line}
        isTotal={isTotal}
        showEditor={Boolean(showEditor)}
        onPaymentSaved={stableOnPaymentSaved}
        onPaymentError={stableOnPaymentError}
      />
    );
  };

  const table = (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
      {needsPaging || showPendingOnly ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
          <span>
            {showPendingOnly
              ? t("turnos.detail.tripsWithWarning", { count: filteredTrips.length })
              : t("turnos.detail.tripsPlain", { count: filteredTrips.length })}
            {needsPaging
              ? t("turnos.detail.pageOf", { page: safePage + 1, total: totalPages })
              : null}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {pendingCount > 0 ? (
              <button
                type="button"
                className={`rounded border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  showPendingOnly
                    ? "border-orange-300 bg-orange-50 text-orange-800"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-100"
                }`}
                onClick={() => setShowPendingOnly((v) => !v)}
              >
                {showPendingOnly ? t("turnos.detail.viewAll") : t("turnos.detail.warningsOnly", { count: pendingCount })}
              </button>
            ) : null}
            {needsPaging ? (
              <>
                <button
                  type="button"
                  className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                  disabled={safePage <= 0 || isPaging}
                  onClick={() =>
                    startPagingTransition(() => setPage((p) => Math.max(0, p - 1)))
                  }
                >
                  {t("turnos.detail.previous")}
                </button>
                <button
                  type="button"
                  className="rounded border border-zinc-300 bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-700 hover:bg-zinc-100 disabled:opacity-40"
                  disabled={safePage >= totalPages - 1 || isPaging}
                  onClick={() =>
                    startPagingTransition(() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1)),
                    )
                  }
                >
                  {isPaging ? "…" : t("turnos.detail.next")}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <div className="vui-table-scroll-y">
      <table className="w-full min-w-[900px] border-collapse text-left text-[11px]">
        <thead className="vui-table-sticky-head">
          <tr className="text-[10px] font-bold uppercase tracking-wide">
            <th className="bg-zinc-50 px-2 py-1.5" colSpan={3} aria-hidden />
            <th
              className="border-x border-t border-sky-200 bg-sky-100 px-2 py-1.5 text-center text-sky-800"
              colSpan={3}
            >
              {t("turnos.detail.groups.servicio")}
            </th>
            <th
              className="border-x border-t border-amber-200 bg-amber-100 px-2 py-1.5 text-center text-amber-900"
              colSpan={3}
            >
              {t("turnos.detail.groups.pago")}
            </th>
            <th className="bg-zinc-50 px-2 py-1.5" colSpan={5} aria-hidden />
          </tr>
          <tr className="border-b border-zinc-200 bg-zinc-50 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            {TRIP_DETAIL_HEADERS.map((h, i) => (
              <th
                key={h}
                className={`whitespace-nowrap px-2 py-2 font-semibold ${i >= 3 ? "text-right" : ""} ${i === 0 ? "border-l-4 border-transparent" : ""} ${detailGroupTint(i)}`}
              >
                {headers[i]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {visibleTrips.map((trip) => renderRow(trip, false))}
          {renderRow(block.total, true)}
        </tbody>
      </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-zinc-800">
        <span className={`h-2 w-2 rounded-full ${platformDotClass(block.platform)}`} aria-hidden />
        {t("turnos.detail.tripsCount", { platform: block.platform, count: block.viajes })}
        {totalReviewCount > 0 ? (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
              verifiedReviewCount >= totalReviewCount
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-rose-200 bg-rose-50 text-rose-800"
            }`}
            title={t("turnos.detail.verifiedProgressHint")}
          >
            {verifiedReviewCount >= totalReviewCount ? (
              <Check className="h-3 w-3 shrink-0" aria-hidden />
            ) : null}
            {t("turnos.detail.verifiedProgress", {
              verified: verifiedReviewCount,
              total: totalReviewCount,
            })}
          </span>
        ) : null}
      </div>
      {showPaymentActions && pendingCount > 0 ? (
        <PaymentValidationBanner
          manualCount={manualPaymentCount}
          appReconcileCount={appReconcileCount}
        />
      ) : null}
      {showActivitySidebar ? (
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          <div className="min-w-0 flex-1">{table}</div>
          <ShiftActivitySidebar
            activity={block.activity}
            grossImporteCents={Math.round((block.total.importeNum ?? 0) * 100)}
          />
        </div>
      ) : (
        table
      )}
    </div>
  );
}

export function ShiftActivitySidebar({
  activity,
  grossImporteCents,
}: {
  activity: ShiftActivity;
  /** Sum of trip gross importe (cents) for €/hora aligned with the Importe column. */
  grossImporteCents?: number;
}) {
  const { t } = useTranslations();
  const connectedMinutes = parseShiftHorasConectadoMinutes(activity.horasConectado);
  const eurHoraDisplay =
    grossImporteCents != null && grossImporteCents > 0
      ? resolveShiftEurHoraDisplay(grossImporteCents, activity.horasConectado)
      : activity.eurHora;
  const eurHoraLabel = connectedMinutes >= 60 ? t("turnos.detail.eurHora") : t("turnos.detail.revenue");

  return (
    <aside className="w-full shrink-0 rounded-lg border border-zinc-200 bg-white p-4 xl:w-52">
      <h5 className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
        {t("turnos.detail.activityTitle")}
      </h5>
      {activity.source === "estimated" ? (
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          {t("turnos.detail.activityEstimated")}
        </p>
      ) : (
        <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
          {t("turnos.detail.activityLive")}
        </p>
      )}
      <dl className="mt-3 space-y-2.5 text-xs">
        <div>
          <dt className="text-zinc-500">{t("turnos.detail.tripsDone")}</dt>
          <dd className="font-semibold tabular-nums text-zinc-900">{activity.viajesRealizados}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">{t("turnos.detail.hoursConnected")}</dt>
          <dd className="font-semibold text-zinc-900">{activity.horasConectado}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">{eurHoraLabel}</dt>
          <dd className="font-semibold tabular-nums text-zinc-900">{eurHoraDisplay}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">{t("turnos.detail.notAnswered")}</dt>
          <dd className="font-semibold tabular-nums text-zinc-900">{activity.noAtendidos}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">{t("turnos.detail.rejected")}</dt>
          <dd className="font-semibold tabular-nums text-zinc-900">{activity.rechazados}</dd>
        </div>
      </dl>
    </aside>
  );
}

function DetailError({ message }: { message: string }) {
  return (
    <div className="border-t border-zinc-200 bg-red-50/80 px-4 py-6 text-center text-sm text-red-800">
      {message}
    </div>
  );
}

function DetailLoading() {
  const { t } = useTranslations();
  return (
    <div className="border-t border-zinc-200 bg-zinc-50/80 px-4 py-8 text-center text-sm text-zinc-500">
      {t("turnos.detail.loading")}
    </div>
  );
}

export function ShiftPlatformTripDetailPanel({
  row,
  platform,
  variant = "pendiente",
  live,
  onPaymentsValidated,
  onDetailMetricsLoaded,
}: {
  row: ShiftTableRow & {
    desglose?: CerrarTurnosRow["desglose"];
    tripIds?: string[];
    tripIdsByPlatform?: CerrarTurnosRow["tripIdsByPlatform"];
  };
  platform: ShiftPlatformName;
  variant?: "pendiente" | "cerrado";
  live?: ShiftLiveDetailInput;
  onPaymentsValidated?: () => void;
  /** Sync table row totals when live detail loads from API. */
  onDetailMetricsLoaded?: (metrics: PlatformShiftMetrics) => void;
}) {
  const toast = useToast();
  const { t } = useTranslations();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const { loading, block, fromDb, error } = useLivePlatformShiftDetail(row, platform, live, detailRefresh);
  const onDetailMetricsLoadedRef = useRef(onDetailMetricsLoaded);
  useEffect(() => {
    onDetailMetricsLoadedRef.current = onDetailMetricsLoaded;
  }, [onDetailMetricsLoaded]);

  const metricsFingerprint =
    fromDb && block ? platformBlockMetricsFingerprint(block) : null;
  const blockRef = useRef(block);
  blockRef.current = block;

  useEffect(() => {
    if (!fromDb || !metricsFingerprint) return;
    const current = blockRef.current;
    if (!current) return;
    onDetailMetricsLoadedRef.current?.(blockTotalToMetrics(current));
  }, [fromDb, metricsFingerprint]);

  const handlePdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      await downloadShiftDetailPdf({
        row,
        live,
        platform,
        allowClosed: variant === "cerrado",
      });
      toast.success(t("turnos.detail.pdfDownloaded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("turnos.pdfError"));
    } finally {
      setPdfLoading(false);
    }
  }, [live, platform, row, t, toast, variant]);

  if (loading && !block) return <DetailLoading />;
  if (error && !block) return <DetailError message={error} />;
  if (!block) return <DetailError message={t("turnos.detail.noTrips")} />;

  const title =
    variant === "cerrado"
      ? t("turnos.detail.closedPlatformTitle", {
          conductor: row.conductor,
          platform,
          range: row.rango,
        })
      : t("turnos.detail.pendingPlatformTitle", { conductor: row.conductor, platform });

  const fechaLabel = row.rango.includes("–")
    ? row.rango.split("–").pop()?.trim() ?? row.rango
    : row.rango;

  const handleExcel = async () => {
    const rows: (string | number)[][] = block.trips.map((trip) => tripLineToRow(trip));
    rows.push(tripLineToRow(block.total));
    await downloadExcelTable({
      filename: `detalle-turno-${row.conductor.replace(/\s+/g, "-").toLowerCase()}-${platform.toLowerCase()}.xlsx`,
      sheetName: platform,
      headers: tripDetailHeaders(t),
      rows,
    });
    toast.success(t("turnos.detail.excelDownloaded"));
  };

  return (
    <div className="border-t border-zinc-200 bg-zinc-50/80 px-4 py-4 md:px-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-zinc-900">{title}</h4>
          {variant === "pendiente" ? (
            <p className="mt-0.5 text-xs text-zinc-600">
              {fechaLabel}
              {fromDb ? <span className="ml-1 text-emerald-700">{t("turnos.detail.liveData")}</span> : null}
            </p>
          ) : fromDb ? (
            <p className="mt-0.5 text-xs text-emerald-700">{t("turnos.detail.fromDb")}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleExcel()}
            className="erp-btn-outline px-3 py-1 text-[10px]"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => void handlePdf()}
            disabled={pdfLoading || !live?.driverId}
            className="erp-btn-outline px-3 py-1 text-[10px] disabled:opacity-50"
          >
            {pdfLoading ? "PDF…" : "PDF"}
          </button>
        </div>
      </div>

      <ShiftMetricsSummaryStrip metrics={blockTotalToMetrics(block)} showAvisos />

      <TripDetailTable
        block={block}
        showPaymentActions={variant === "pendiente" && fromDb}
        onPaymentSaved={() => {
          setDetailRefresh((n) => n + 1);
          onPaymentsValidated?.();
        }}
        onPaymentError={(msg) => toast.error(msg)}
      />
    </div>
  );
}

export function ShiftRowDetailPanel({
  row,
  variant = "pendiente",
  live,
  onPaymentsValidated,
}: {
  row: ShiftTableRow & {
    desglose?: CerrarTurnosRow["desglose"];
    tripIds?: string[];
    tripIdsByPlatform?: CerrarTurnosRow["tripIdsByPlatform"];
  };
  variant?: "pendiente" | "cerrado";
  live?: ShiftLiveDetailInput;
  onPaymentsValidated?: () => void;
}) {
  const toast = useToast();
  const { t } = useTranslations();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [detailRefresh, setDetailRefresh] = useState(0);
  const { loading, detail, fromDb, error } = useLiveShiftRowDetail(row, live, detailRefresh);

  const handlePdf = useCallback(async () => {
    setPdfLoading(true);
    try {
      await downloadShiftDetailPdf({
        row,
        live,
        allowClosed: variant === "cerrado",
      });
      toast.success(t("turnos.detail.pdfDownloaded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("turnos.pdfError"));
    } finally {
      setPdfLoading(false);
    }
  }, [live, row, t, toast, variant]);

  if (loading) return <DetailLoading />;
  if (error) return <DetailError message={error} />;
  if (!detail.platforms.length && fromDb) {
    return <DetailError message={t("turnos.detail.noTrips")} />;
  }

  const title =
    variant === "cerrado"
      ? t("turnos.detail.closedTitle", {
          conductor: row.conductor,
          platforms: platformSummaryLabel(row.plataformas),
          range: row.rango,
        })
      : t("turnos.detail.pendingTitle", { conductor: row.conductor });

  const subtitle = variant === "cerrado" ? undefined : detail.fechaLabel;

  const handleExcel = async () => {
    const rows: (string | number)[][] = [];
    for (const block of detail.platforms) {
      for (const trip of block.trips) {
        rows.push(tripLineToRow(trip));
      }
      rows.push(tripLineToRow(block.total));
    }
    await downloadExcelTable({
      filename: `detalle-turno-${row.conductor.replace(/\s+/g, "-").toLowerCase()}.xlsx`,
      sheetName: t("turnos.detail.sheetDetail"),
      headers: tripDetailHeaders(t),
      rows,
    });
    toast.success(t("turnos.detail.excelDownloaded"));
  };

  return (
    <div className="border-t border-zinc-200 bg-zinc-50/80 px-4 py-4 md:px-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-zinc-900">{title}</h4>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-zinc-600">
              {subtitle}
              {fromDb ? <span className="ml-1 text-emerald-700">{t("turnos.detail.liveData")}</span> : null}
            </p>
          ) : fromDb ? (
            <p className="mt-0.5 text-xs text-emerald-700">{t("turnos.detail.fromDb")}</p>
          ) : null}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleExcel()}
            className="erp-btn-outline px-3 py-1 text-[10px]"
          >
            Excel
          </button>
          <button
            type="button"
            onClick={() => void handlePdf()}
            disabled={pdfLoading || !live?.driverId}
            className="erp-btn-outline px-3 py-1 text-[10px] disabled:opacity-50"
          >
            {pdfLoading ? "PDF…" : "PDF"}
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {detail.platforms.map((block) => (
          <TripDetailTable
            key={block.platform}
            block={block}
            showPaymentActions={variant === "pendiente" && fromDb}
            onPaymentSaved={() => {
              setDetailRefresh((n) => n + 1);
              onPaymentsValidated?.();
            }}
            onPaymentError={(msg) => toast.error(msg)}
          />
        ))}
      </div>
    </div>
  );
}
