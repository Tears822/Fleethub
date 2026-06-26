"use client";

import { Fragment } from "react";
import {
  shiftLiveDetailFromRow,
  type CerrarTurnosRow,
  type PlatformShiftMetrics,
  type ShiftPlatformName,
  platformTripDetailKey,
  SHIFT_CLOSE_BUTTON_CLASS,
} from "@/features/shifts/ui/cerrar-turnos-types";
import { ShiftDetailToggleButton } from "@/features/shifts/ui/shift-detail-toggle-button";
import { ShiftPlatformTripDetailPanel } from "@/features/shifts/ui/shift-row-detail-panel";
import { OperativaWriteButton } from "@/shared/ui/operativa-write-button";
import { displayNameToRidePlatform, displayNameToSlug } from "@/features/shifts/lib/shift-platform";
import { ShiftPlatformDots } from "@/shared/ui/shift-platform-dots";
import { PlatformLogo } from "@/shared/ui/platform-logo";
import { appsPlatformLogoId } from "@/features/apps/lib/apps-platform";
import { ShiftMetricsCells } from "@/features/shifts/ui/shift-metrics-cells";

const BREAKDOWN_HEADERS = [
  "Plataforma",
  "",
  "Viajes",
  "Importe total",
  "Tarifa 3",
  "Pago app",
  "Efectivo",
  "Tarjetas",
  "Propinas",
  "Primas",
  "Peajes",
  "Avisos",
  "Acciones",
] as const;

type ShiftPlatformBreakdownProps = {
  row: CerrarTurnosRow;
  driverKey: string;
  breakdown: PlatformShiftMetrics[];
  expandedTripDetailKey: string | null;
  onTogglePlatformTrip: (platform: ShiftPlatformName) => void;
  onClosePlatform: (platform: ShiftPlatformName) => void;
  closingDriverId: string | null;
  onPaymentsValidated?: () => void;
  onDetailMetricsLoaded?: (metrics: PlatformShiftMetrics) => void;
};

export function ShiftPlatformBreakdown({
  row,
  driverKey,
  breakdown,
  expandedTripDetailKey,
  onTogglePlatformTrip,
  onClosePlatform,
  closingDriverId,
  onPaymentsValidated,
  onDetailMetricsLoaded,
}: ShiftPlatformBreakdownProps) {
  return (
    <tr className="vui-table-row">
      <td colSpan={13} className="!border-t-0 bg-zinc-50/90 p-0">
        <div
          className="mx-2 mb-2 border-l-[3px] border-orange-500 bg-gradient-to-b from-orange-50/60 to-zinc-50/90 py-3 pl-3 pr-2 md:mx-3 md:pl-4"
          role="region"
          aria-label={`Desglose por plataforma — ${row.conductor}`}
        >
          <p className="mb-2.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" aria-hidden />
            Desglose por plataforma
            <span className="font-normal normal-case tracking-normal text-zinc-400">
              · {row.rango}
              {breakdown.length > 1 ? " · pulse Ver detalle en cada plataforma" : null}
            </span>
          </p>

          <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white shadow-sm ring-1 ring-zinc-100/80">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/90 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                  {BREAKDOWN_HEADERS.map((label, i) => (
                    <th
                      key={`${label}-${i}`}
                      className={[
                        "whitespace-nowrap px-2 py-2 font-semibold",
                        i === 1 ? "w-0 p-0" : "",
                        i >= 2 && i <= 11 ? "text-right" : "",
                        i === 12 ? "text-right" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {breakdown.map((platformMetrics) => {
                  const tripKey = platformTripDetailKey(driverKey, platformMetrics.platform);
                  const tripExpanded = expandedTripDetailKey === tripKey;
                  return (
                    <Fragment key={tripKey}>
                      <tr
                        className={
                          tripExpanded
                            ? "bg-orange-50/40"
                            : "transition-colors hover:bg-zinc-50/90"
                        }
                      >
                        <td className="px-3 py-2.5 align-middle">
                          <ShiftPlatformDots slugs={[displayNameToSlug(platformMetrics.platform)]} />
                        </td>
                        <td className="px-2 py-2.5">
                          <span className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-800">
                            <PlatformLogo
                              id={appsPlatformLogoId(displayNameToSlug(platformMetrics.platform))}
                              size="sm"
                            />
                            {platformMetrics.platform}
                          </span>
                        </td>
                        <ShiftMetricsCells
                          metrics={platformMetrics}
                          showAvisos
                          cellClassName="px-2 py-2.5"
                        />
                        <td className="px-2 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <ShiftDetailToggleButton
                              expanded={tripExpanded}
                              onToggle={() => onTogglePlatformTrip(platformMetrics.platform)}
                              labelCollapsed="Ver detalle"
                              labelExpanded="Ocultar"
                            />
                            <OperativaWriteButton
                              kind="shifts"
                              className={SHIFT_CLOSE_BUTTON_CLASS}
                              disabled={
                                closingDriverId !== null &&
                                row.driverId !== undefined &&
                                closingDriverId === row.driverId
                              }
                              onClick={() => onClosePlatform(platformMetrics.platform)}
                            >
                              {closingDriverId === row.driverId
                                ? "Calculando…"
                                : "Cerrar turno"}
                            </OperativaWriteButton>
                          </div>
                        </td>
                      </tr>
                      {tripExpanded ? (
                        <tr>
                          <td colSpan={13} className="border-t border-zinc-100 bg-zinc-50/50 p-0">
                            <ShiftPlatformTripDetailPanel
                              row={row}
                              platform={platformMetrics.platform}
                              live={shiftLiveDetailFromRow(
                                row,
                                "pending",
                                displayNameToRidePlatform(platformMetrics.platform) ?? undefined,
                              )}
                              onPaymentsValidated={onPaymentsValidated}
                              onDetailMetricsLoaded={onDetailMetricsLoaded}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </div>
      </td>
    </tr>
  );
}
