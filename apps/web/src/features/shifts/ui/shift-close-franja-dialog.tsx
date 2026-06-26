"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApiShiftTrip } from "@/features/shifts/lib/shift-trip-detail-mapper";
import {
  fetchPendingShiftTrips,
  formatShiftTripDateTime,
  rangeThroughTripIndex,
  shiftTripAmountLabel,
  shiftTripPaymentLabel,
} from "@/features/shifts/lib/shift-close-trip-picker";
import { isMultiPlatform, shiftPlatformDisplayName } from "@/features/shifts/lib/shift-platform";
import type { CerrarTurnosRow } from "@/features/shifts/ui/cerrar-turnos-types";
import { RidePlatform } from "@prisma/client";

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type ShiftCloseFranjaOptions = {
  useTimeRange: boolean;
  timeFrom?: string;
  timeTo?: string;
  platform?: RidePlatform;
};

type Props = {
  row: CerrarTurnosRow;
  loading: boolean;
  /** When set (e.g. from platform breakdown), only pending trips on this platform are closed. */
  initialPlatform?: RidePlatform;
  onContinue: (options: ShiftCloseFranjaOptions) => void;
  onCancel: () => void;
};

const TRIP_PICKER_SELECT_THRESHOLD = 25;
const TRIP_FETCH_TIMEOUT_MS = 30_000;

export function ShiftCloseFranjaDialog({
  row,
  loading,
  initialPlatform,
  onContinue,
  onCancel,
}: Props) {
  const defaultFrom = row.periodFromIso ? new Date(row.periodFromIso) : new Date();
  const defaultTo = row.periodToIso ? new Date(row.periodToIso) : new Date();
  const spansMultipleDays =
    defaultFrom.toDateString() !== defaultTo.toDateString() ||
    defaultTo.getTime() - defaultFrom.getTime() > 20 * 60 * 60 * 1000;

  const [useTimeRange, setUseTimeRange] = useState(
    () => spansMultipleDays || (row.avisos ?? 0) > 0,
  );
  const [timeFrom, setTimeFrom] = useState(() => toDatetimeLocalValue(defaultFrom));
  const [timeTo, setTimeTo] = useState(() => toDatetimeLocalValue(defaultTo));
  const [platform, setPlatform] = useState<"" | RidePlatform>(initialPlatform ?? "");
  const [trips, setTrips] = useState<ApiShiftTrip[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [tripsError, setTripsError] = useState<string | null>(null);
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const [manualTimes, setManualTimes] = useState(false);

  const showPlatform = isMultiPlatform(row.plataformas) && !initialPlatform;
  const closePlatform = initialPlatform ?? (showPlatform && platform ? platform : undefined);
  const driverId = row.driverId ?? "";
  const pendingTripCount = row.tripIds?.length ?? 0;
  const rowRef = useRef(row);
  rowRef.current = row;

  useEffect(() => {
    if (!useTimeRange) {
      setTrips([]);
      setTripsError(null);
      setSelectedTripId(null);
      setManualTimes(false);
      setTripsLoading(false);
      return;
    }

    if (!driverId) {
      setTrips([]);
      setTripsError("No hay conductor asociado a esta fila.");
      setTripsLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), TRIP_FETCH_TIMEOUT_MS);
    let active = true;

    setTripsLoading(true);
    setTripsError(null);

    void fetchPendingShiftTrips(rowRef.current, closePlatform, controller.signal)
      .then((loaded) => {
        if (!active) return;
        setTrips(loaded);
        if (loaded.length === 0) {
          setTripsError("No hay viajes pendientes para seleccionar.");
          setSelectedTripId(null);
          return;
        }
        setSelectedTripId(loaded[loaded.length - 1]!.id);
        setManualTimes(false);
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof DOMException && e.name === "AbortError") {
          setTripsError(
            "La carga de viajes tardó demasiado. Cierre el diálogo e inténtelo de nuevo.",
          );
        } else {
          setTripsError(
            e instanceof Error ? e.message : "No se pudieron cargar los viajes.",
          );
        }
        setTrips([]);
        setSelectedTripId(null);
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setTripsLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [useTimeRange, driverId, pendingTripCount, closePlatform]);

  const selectedIndex = useMemo(() => {
    if (!selectedTripId) return -1;
    return trips.findIndex((t) => t.id === selectedTripId);
  }, [trips, selectedTripId]);

  const pickerRange = useMemo(() => {
    if (selectedIndex < 0) return null;
    return rangeThroughTripIndex(trips, selectedIndex);
  }, [trips, selectedIndex]);

  useEffect(() => {
    if (manualTimes || !pickerRange) return;
    setTimeFrom(toDatetimeLocalValue(pickerRange.timeFrom));
    setTimeTo(toDatetimeLocalValue(pickerRange.timeTo));
  }, [pickerRange, manualTimes]);

  const handleSelectTrip = useCallback((tripId: string) => {
    setSelectedTripId(tripId);
    setManualTimes(false);
  }, []);

  const handleManualTimeChange = useCallback((which: "from" | "to", value: string) => {
    setManualTimes(true);
    if (which === "from") setTimeFrom(value);
    else setTimeTo(value);
  }, []);

  const handleContinue = useCallback(() => {
    onContinue({
      useTimeRange,
      timeFrom: useTimeRange ? new Date(timeFrom).toISOString() : undefined,
      timeTo: useTimeRange ? new Date(timeTo).toISOString() : undefined,
      platform: closePlatform,
    });
  }, [closePlatform, onContinue, timeFrom, timeTo, useTimeRange]);

  const rangeValid = useMemo(() => {
    if (!useTimeRange) return true;
    const from = new Date(timeFrom);
    const to = new Date(timeTo);
    return !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to;
  }, [timeFrom, timeTo, useTimeRange]);

  const canContinue =
    !loading &&
    rangeValid &&
    (!useTimeRange || (!tripsLoading && trips.length > 0 && selectedIndex >= 0));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shift-franja-title"
    >
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl border border-zinc-200 bg-white p-6 shadow-xl">
        <h2 id="shift-franja-title" className="text-base font-semibold text-zinc-900">
          Cerrar turno
          {initialPlatform ? ` — ${initialPlatform === "UBER" ? "Uber" : "FreeNow"}` : ""}
        </h2>
        <p className="mt-1 text-sm text-zinc-600">{row.conductor}</p>
        {initialPlatform ? (
          <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            Solo se liquidan viajes pendientes de{" "}
            <span className="font-semibold">
              {initialPlatform === "UBER" ? "Uber" : "FreeNow"}
            </span>
            .
          </p>
        ) : null}
        <p className="mt-0.5 text-xs text-zinc-500">
          Periodo pendiente: {row.rango}
          {row.tripIds?.length ? ` · ${row.tripIds.length} viajes` : null}
        </p>

        {(row.avisos ?? 0) > 0 ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            Hay {row.avisos} viaje{row.avisos === 1 ? "" : "s"} con pago sin confirmar en fechas
            posteriores. Selecciona como último viaje el del último día que puedas cerrar (p. ej. 23/05
            si el 24 tiene efectivo pendiente).
          </p>
        ) : null}

        <label className="mt-4 flex cursor-pointer items-start gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={useTimeRange}
            onChange={(e) => setUseTimeRange(e.target.checked)}
            disabled={loading}
          />
          <span>
            <span className="font-medium text-zinc-900">Cerrar solo una franja horaria</span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Solo se liquidan viajes que se solapan con el intervalo indicado.
            </span>
          </span>
        </label>

        {useTimeRange ? (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-xs font-medium text-zinc-600">Último viaje a incluir en el turno</p>
              {tripsLoading ? (
                <p className="mt-2 text-xs text-zinc-500">Cargando viajes…</p>
              ) : tripsError ? (
                <p className="mt-2 text-xs text-red-600">{tripsError}</p>
              ) : trips.length > TRIP_PICKER_SELECT_THRESHOLD ? (
                <select
                  className="erp-inline-input mt-2 w-full text-sm"
                  value={selectedTripId ?? ""}
                  disabled={loading}
                  onChange={(e) => handleSelectTrip(e.target.value)}
                  aria-label="Último viaje a incluir"
                >
                  {trips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {formatShiftTripDateTime(trip.startedAt)} ·{" "}
                      {shiftTripPaymentLabel(trip.paymentMethod)} ·{" "}
                      {shiftTripAmountLabel(trip)}
                    </option>
                  ))}
                </select>
              ) : (
                <ul
                  className="mt-2 max-h-52 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-1"
                  role="radiogroup"
                  aria-label="Último viaje a incluir"
                >
                  {trips.map((trip) => {
                    const selected = trip.id === selectedTripId;
                    return (
                      <li key={trip.id}>
                        <label
                          className={[
                            "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm transition",
                            selected
                              ? "border border-orange-300 bg-orange-50 ring-1 ring-orange-200"
                              : "border border-transparent hover:bg-zinc-50",
                          ].join(" ")}
                        >
                          <input
                            type="radio"
                            name="last-trip"
                            className="shrink-0 accent-orange-600"
                            checked={selected}
                            disabled={loading}
                            onChange={() => handleSelectTrip(trip.id)}
                          />
                          <span className="min-w-0 flex-1 tabular-nums text-zinc-800">
                            {formatShiftTripDateTime(trip.startedAt)}
                          </span>
                          <span className="shrink-0 text-xs text-zinc-600">
                            {shiftTripPaymentLabel(trip.paymentMethod)}
                          </span>
                          <span className="shrink-0 font-semibold tabular-nums text-zinc-900">
                            {shiftTripAmountLabel(trip)}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {!tripsLoading && !tripsError && trips.length > TRIP_PICKER_SELECT_THRESHOLD ? (
                <p className="mt-1 text-[10px] text-zinc-500">
                  {trips.length} viajes — use el desplegable para elegir el último a incluir.
                </p>
              ) : null}
            </div>

            {pickerRange ? (
              <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                <span className="font-semibold">Periodo:</span>{" "}
                {formatShiftTripDateTime(pickerRange.timeFrom.toISOString())}
                {" → "}
                {formatShiftTripDateTime(pickerRange.timeTo.toISOString())}
                <span className="font-semibold"> · {pickerRange.includedCount} viajes</span>
              </p>
            ) : null}

            <details className="group">
              <summary className="cursor-pointer text-xs font-medium text-zinc-600 hover:text-zinc-900">
                Ajuste manual de fechas
              </summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-zinc-600">
                  Desde
                  <input
                    type="datetime-local"
                    className="erp-inline-input mt-1 w-full"
                    value={timeFrom}
                    onChange={(e) => handleManualTimeChange("from", e.target.value)}
                    disabled={loading || tripsLoading}
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-600">
                  Hasta
                  <input
                    type="datetime-local"
                    className="erp-inline-input mt-1 w-full"
                    value={timeTo}
                    onChange={(e) => handleManualTimeChange("to", e.target.value)}
                    disabled={loading || tripsLoading}
                  />
                </label>
              </div>
            </details>

            {!rangeValid ? (
              <p className="text-xs text-red-600">
                La hora de inicio debe ser anterior o igual al fin.
              </p>
            ) : null}
          </div>
        ) : null}

        {showPlatform ? (
          <label className="mt-4 block text-xs font-medium text-zinc-600">
            Plataforma (opcional)
            <select
              className="erp-inline-input mt-1 w-full"
              value={platform}
              onChange={(e) =>
                setPlatform(
                  e.target.value === "" ? "" : (e.target.value as RidePlatform),
                )
              }
              disabled={loading}
            >
              <option value="">Todas las plataformas</option>
              {(row.desglose ?? []).map((d) => {
                const p = d.platform;
                const ride =
                  Object.values(RidePlatform).find(
                    (r) => shiftPlatformDisplayName(r) === p,
                  ) ?? null;
                if (!ride) return null;
                return (
                  <option key={ride} value={ride}>
                    {p}
                  </option>
                );
              })}
            </select>
          </label>
        ) : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button type="button" className="erp-btn-secondary" disabled={loading} onClick={onCancel}>
            Cancelar
          </button>
          <button
            type="button"
            className="erp-btn-primary"
            disabled={!canContinue}
            onClick={handleContinue}
          >
            {loading ? "Calculando…" : "Ver liquidación"}
          </button>
        </div>
      </div>
    </div>
  );
}
