"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, Pencil } from "lucide-react";
import type { PaymentEditMode } from "@/features/shifts/lib/update-shift-trip-payments";
import { updateShiftTripPayments } from "@/features/shifts/lib/update-shift-trip-payments";
import type { TripLine } from "@/features/shifts/lib/cerrar-turnos-mock-detail";
import {
  derivePaymentEditMode,
  paymentModeNeedsManualReview,
} from "@fleethub/auth/trip-payment-amounts";
import { OperativaWriteButton } from "@/shared/ui/operativa-write-button";
import { useTranslations } from "@/shared/i18n/i18n-provider";

function centsFromEuros(euros: number): number {
  return Math.round(euros * 100);
}

function parseEuroInput(value: string): number {
  const n = Number(value.replace(",", ".").trim());
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

function clampCents(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function eurosFromCents(cents: number): number {
  return cents / 100;
}

function formatEuroDisplay(euros: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(euros);
}

export type PaymentPreview = {
  app: string;
  efectivo: string;
  tarjeta: string;
};

function computePaymentPreview(
  mode: PaymentEditMode,
  importeEuros: number,
  cashEuros: string,
  cardEuros: string,
): PaymentPreview {
  const zero = formatEuroDisplay(0);
  if (mode === "app") {
    return { app: formatEuroDisplay(importeEuros), efectivo: zero, tarjeta: zero };
  }
  if (mode === "cash") {
    return { app: zero, efectivo: formatEuroDisplay(importeEuros), tarjeta: zero };
  }
  if (mode === "card") {
    return { app: zero, efectivo: zero, tarjeta: formatEuroDisplay(importeEuros) };
  }
  return {
    app: zero,
    efectivo: formatEuroDisplay(parseEuroInput(cashEuros)),
    tarjeta: formatEuroDisplay(parseEuroInput(cardEuros)),
  };
}

/** Input display: 17,35 */
export function formatEuroInputValue(euros: number): string {
  return euros.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

type EditorState = {
  mode: PaymentEditMode;
  setMode: (mode: PaymentEditMode) => void;
  importeEuros: number;
  importeCents: number;
  cashEuros: string;
  setCashEuros: (v: string) => void;
  cardEuros: string;
  setCardEuros: (v: string) => void;
  stepCashEuros: (deltaCents: number) => void;
  stepCardEuros: (deltaCents: number) => void;
  fillCashWithImporte: () => void;
  fillCardWithImporte: () => void;
  loading: boolean;
  save: (confirm: boolean) => Promise<void>;
  isEditable: boolean;
  /** Tipo de pago confirmado en operativa (`paymentValidated`). */
  isPaymentVerified: boolean;
  /** Cambios locales pendientes de guardar/confirmar. */
  hasPendingChanges: boolean;
  preview: PaymentPreview;
  setModeAndPreview: (mode: PaymentEditMode) => void;
};

export function derivePaymentEditModeForLine(line: TripLine): PaymentEditMode {
  const cashCents = line.efectivoNum != null ? Math.round(line.efectivoNum * 100) : 0;
  const cardCents = line.tarjetaNum != null ? Math.round(line.tarjetaNum * 100) : 0;
  const appCents = line.appNum != null ? Math.round(line.appNum * 100) : 0;
  const netCents = Math.round((line.netCents ?? line.totalNum ?? line.importeNum ?? 0) * 100);
  return derivePaymentEditMode({
    netAmountCents: BigInt(netCents),
    paymentMethod: line.paymentMethod ?? null,
    cashPaymentCents: cashCents > 0 ? BigInt(cashCents) : null,
    cardPaymentCents: cardCents > 0 ? BigInt(cardCents) : null,
    appPaymentCents: appCents > 0 ? BigInt(appCents) : null,
  });
}

/** True when the row needs the heavy payment editor (not just read-only display). */
export function tripLineNeedsPaymentEditor(line: TripLine): boolean {
  if (!line.tripId) return false;
  if (line.pagoSinConfirmar || line.pagoDescuadrado) return true;
  return paymentModeNeedsManualReview(derivePaymentEditModeForLine(line));
}

export function useShiftTripPaymentEditor(
  line: TripLine,
  opts: {
    disabled?: boolean;
    onSaved: () => void;
    onError: (message: string) => void;
  },
): EditorState {
  const { t } = useTranslations();
  const importeEuros = line.importeNum ?? line.netCents ?? line.totalNum ?? 0;
  const importeCents = centsFromEuros(importeEuros);

  const initialMode = useMemo((): PaymentEditMode => derivePaymentEditModeForLine(line), [line]);

  const [mode, setMode] = useState<PaymentEditMode>(initialMode);

  const initialCashCard = useMemo(() => {
    const net = line.netCents ?? line.totalNum ?? importeEuros;
    const cashNet = line.efectivoNum ?? 0;
    const cardNet = line.tarjetaNum ?? 0;
    if (cashNet > 0 && cardNet > 0 && importeEuros > net && net > 0) {
      const cashGross = (importeEuros * cashNet) / net;
      const cardGross = importeEuros - cashGross;
      return {
        cash: formatEuroInputValue(cashGross),
        card: formatEuroInputValue(cardGross),
      };
    }
    return {
      cash: cashNet > 0 ? formatEuroInputValue(cashNet) : "",
      card: cardNet > 0 ? formatEuroInputValue(cardNet) : "",
    };
  }, [importeEuros, line.efectivoNum, line.netCents, line.tarjetaNum, line.totalNum]);

  const [cashEuros, setCashEurosState] = useState(() => initialCashCard.cash);
  const [cardEuros, setCardEurosState] = useState(() => initialCashCard.card);
  const [loading, setLoading] = useState(false);

  const isPaymentVerified = line.pagoSinConfirmar !== true;

  const savedSnapshot = useMemo(
    () => ({
      mode: derivePaymentEditModeForLine(line),
      cash: initialCashCard.cash,
      card: initialCashCard.card,
    }),
    [initialCashCard, line],
  );

  useEffect(() => {
    setMode(savedSnapshot.mode);
    setCashEurosState(savedSnapshot.cash);
    setCardEurosState(savedSnapshot.card);
  }, [line.tripId, line.pagoSinConfirmar, savedSnapshot]);

  const hasPendingChanges = useMemo(() => {
    if (mode !== savedSnapshot.mode) return true;
    if (mode === "mixed") {
      return cashEuros !== savedSnapshot.cash || cardEuros !== savedSnapshot.card;
    }
    return false;
  }, [cashEuros, cardEuros, mode, savedSnapshot]);

  const applyCashCardSplit = useCallback(
    (cashCents: number) => {
      const clampedCash = clampCents(cashCents, 0, importeCents);
      const cardCents = importeCents - clampedCash;
      setCashEurosState(formatEuroInputValue(eurosFromCents(clampedCash)));
      setCardEurosState(formatEuroInputValue(eurosFromCents(cardCents)));
    },
    [importeCents],
  );

  const setCashEuros = useCallback(
    (value: string) => {
      setCashEurosState(value);
      const cashCents = clampCents(centsFromEuros(parseEuroInput(value)), 0, importeCents);
      setCardEurosState(formatEuroInputValue(eurosFromCents(importeCents - cashCents)));
    },
    [importeCents],
  );

  const setCardEuros = useCallback(
    (value: string) => {
      setCardEurosState(value);
      const cardCents = clampCents(centsFromEuros(parseEuroInput(value)), 0, importeCents);
      setCashEurosState(formatEuroInputValue(eurosFromCents(importeCents - cardCents)));
    },
    [importeCents],
  );

  const stepCashEuros = useCallback(
    (deltaCents: number) => {
      const current = centsFromEuros(parseEuroInput(cashEuros));
      applyCashCardSplit(current + deltaCents);
    },
    [applyCashCardSplit, cashEuros],
  );

  const stepCardEuros = useCallback(
    (deltaCents: number) => {
      const current = centsFromEuros(parseEuroInput(cardEuros));
      const nextCard = clampCents(current + deltaCents, 0, importeCents);
      applyCashCardSplit(importeCents - nextCard);
    },
    [applyCashCardSplit, cardEuros, importeCents],
  );

  const fillCashWithImporte = useCallback(() => {
    applyCashCardSplit(importeCents);
  }, [applyCashCardSplit, importeCents]);

  const fillCardWithImporte = useCallback(() => {
    applyCashCardSplit(0);
  }, [applyCashCardSplit]);

  const setModeAndPreview = useCallback(
    (next: PaymentEditMode) => {
      setMode(next);
      if (next === "mixed") {
        if (mode === "card") {
          applyCashCardSplit(0);
        } else {
          applyCashCardSplit(importeCents);
        }
      }
    },
    [applyCashCardSplit, importeCents, mode],
  );

  const preview = useMemo(
    () => computePaymentPreview(mode, importeEuros, cashEuros, cardEuros),
    [mode, importeEuros, cashEuros, cardEuros],
  );

  const save = useCallback(
    async (confirm: boolean) => {
      if (!line.tripId) return;
      setLoading(true);
      try {
        const payload: Parameters<typeof updateShiftTripPayments>[0][number] = {
          tripId: line.tripId,
          mode,
          confirm,
        };
        if (mode === "mixed") {
          payload.cashCents = centsFromEuros(parseEuroInput(cashEuros));
          payload.cardCents = centsFromEuros(parseEuroInput(cardEuros));
          const sum = (payload.cashCents ?? 0) + (payload.cardCents ?? 0);
          if (sum !== importeCents) {
            opts.onError(
              t("turnos.payment.splitSumError", {
                amount: formatEuroInputValue(importeEuros),
              }),
            );
            setLoading(false);
            return;
          }
        }
        await updateShiftTripPayments([payload]);
        opts.onSaved();
      } catch (e) {
        opts.onError(e instanceof Error ? e.message : t("turnos.payment.saveError"));
      } finally {
        setLoading(false);
      }
    },
    [cardEuros, cashEuros, importeCents, importeEuros, line.tripId, mode, opts, t],
  );

  const isEditable = Boolean(line.tripId);

  return {
    mode,
    setMode: setModeAndPreview,
    importeEuros,
    importeCents,
    cashEuros,
    setCashEuros,
    cardEuros,
    setCardEuros,
    stepCashEuros,
    stepCardEuros,
    fillCashWithImporte,
    fillCardWithImporte,
    loading,
    save,
    isEditable,
    isPaymentVerified,
    hasPendingChanges,
    preview,
    setModeAndPreview,
  };
}

function EuroFillButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslations();
  const title = t("turnos.payment.fillWithTripAmount", { label });
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={title}
      aria-label={title}
      className="shrink-0 rounded border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
    >
      €
    </button>
  );
}

function SplitAmountInput({
  label,
  value,
  disabled,
  onChange,
  onStep,
  onFillImporte,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
  onStep: (deltaCents: number) => void;
  onFillImporte: () => void;
}) {
  const { t } = useTranslations();
  return (
    <div className="flex min-w-[96px] flex-col gap-0.5">
      <span className="text-[10px] font-medium text-zinc-500">{label}</span>
      <div className="flex items-center gap-0.5">
        <div className="flex min-w-0 flex-1 items-stretch overflow-hidden rounded border border-zinc-300 bg-white">
          <input
            type="text"
            inputMode="decimal"
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onBlur={() => {
              const normalized = formatEuroInputValue(parseEuroInput(value));
              if (normalized !== value) onChange(normalized);
            }}
            className="min-w-0 flex-1 border-0 bg-transparent px-1 py-0.5 text-[11px] tabular-nums focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400"
          />
          <div className="flex flex-col border-l border-zinc-300">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onStep(1)}
              aria-label={t("turnos.payment.increaseAmount", { label })}
              className="px-1 text-[9px] leading-none text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            >
              ▲
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onStep(-1)}
              aria-label={t("turnos.payment.decreaseAmount", { label })}
              className="border-t border-zinc-300 px-1 text-[9px] leading-none text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
            >
              ▼
            </button>
          </div>
          <span className="flex items-center border-l border-zinc-300 bg-zinc-50 px-1 text-[10px] text-zinc-600">
            €
          </span>
        </div>
        <EuroFillButton label={label} disabled={disabled} onClick={onFillImporte} />
      </div>
    </div>
  );
}

type RowEditorProps = {
  editor: EditorState;
  disabled?: boolean;
  cell: "tipo" | "efectivo" | "tarjeta" | "confirm";
};

export function ShiftTripPaymentEditorCell({ editor, disabled, cell }: RowEditorProps) {
  const { t } = useTranslations();
  const busy = disabled || editor.loading;

  if (!editor.isEditable) {
    if (cell === "tipo") return null;
    return null;
  }

  if (cell === "tipo") {
    if (!paymentModeNeedsManualReview(editor.mode)) {
      return <span className="text-[11px] font-medium text-zinc-800">{t("turnos.payment.app")}</span>;
    }
    return (
      <select
        value={editor.mode}
        disabled={busy}
        onChange={(e) => editor.setModeAndPreview(e.target.value as PaymentEditMode)}
        className="w-full min-w-[120px] rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[11px]"
        aria-label={t("turnos.payment.typeLabel")}
      >
        <option value="app">{t("turnos.payment.app")}</option>
        <option value="cash">{t("turnos.payment.cash")}</option>
        <option value="card">{t("turnos.payment.card")}</option>
        <option value="mixed">{t("turnos.payment.mixed")}</option>
      </select>
    );
  }

  if (cell === "efectivo") {
    if (editor.mode !== "mixed") return null;
    return (
      <SplitAmountInput
        label={t("turnos.payment.cash")}
        value={editor.cashEuros}
        disabled={busy}
        onChange={editor.setCashEuros}
        onStep={editor.stepCashEuros}
        onFillImporte={editor.fillCashWithImporte}
      />
    );
  }

  if (cell === "tarjeta") {
    if (editor.mode !== "mixed") return null;
    return (
      <SplitAmountInput
        label={t("turnos.payment.card")}
        value={editor.cardEuros}
        disabled={busy}
        onChange={editor.setCardEuros}
        onStep={editor.stepCardEuros}
        onFillImporte={editor.fillCardWithImporte}
      />
    );
  }

  if (cell === "confirm") {
    if (!paymentModeNeedsManualReview(editor.mode)) return null;

    const showVerified = editor.isPaymentVerified && !editor.hasPendingChanges;

    if (showVerified) {
      return (
        <div className="flex flex-wrap items-center gap-1">
          <span
            className="inline-flex items-center gap-0.5 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
            title={t("turnos.payment.verifiedHint")}
          >
            <Check className="h-3 w-3 shrink-0" aria-hidden />
            {t("turnos.payment.verified")}
          </span>
          <OperativaWriteButton
            kind="shifts"
            type="button"
            disabled={busy}
            onClick={() => void editor.save(false)}
            className="inline-flex items-center gap-0.5 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
            title={t("turnos.payment.unconfirm")}
          >
            <Pencil className="h-3 w-3 shrink-0" aria-hidden />
            {editor.loading ? "…" : t("turnos.payment.edit")}
          </OperativaWriteButton>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-1">
        <OperativaWriteButton
          kind="shifts"
          type="button"
          disabled={busy}
          onClick={() => void editor.save(true)}
          className="inline-flex items-center gap-0.5 rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          title={t("turnos.payment.saveType")}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {editor.loading ? "…" : t("turnos.payment.confirm")}
        </OperativaWriteButton>
      </div>
    );
  }

  return null;
}

/** Legacy single-cell editor (tipo de pago only). */
export function ShiftTripPaymentEditor({
  line,
  disabled,
  onSaved,
  onError,
}: {
  line: TripLine;
  disabled?: boolean;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const { t } = useTranslations();
  const editor = useShiftTripPaymentEditor(line, { disabled, onSaved, onError });

  if (!editor.isEditable) {
    return <span>{line.tipoPago}</span>;
  }

  if (!paymentModeNeedsManualReview(editor.mode)) {
    return <span>{line.tipoPago}</span>;
  }

  return (
    <div className="flex flex-col gap-1.5">
      <ShiftTripPaymentEditorCell editor={editor} disabled={disabled} cell="tipo" />
      {editor.mode === "mixed" ? (
        <p className="text-[10px] text-zinc-500">
          {t("turnos.payment.mixedHint", {
            amount: formatEuroInputValue(editor.importeEuros),
          })}
        </p>
      ) : (
        <OperativaWriteButton
          kind="shifts"
          type="button"
          disabled={disabled || editor.loading}
          onClick={() => void editor.save(true)}
          className="erp-btn-primary w-fit px-2 py-0.5 text-[10px] disabled:opacity-50"
        >
          {t("turnos.payment.confirm")}
        </OperativaWriteButton>
      )}
    </div>
  );
}
