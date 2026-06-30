"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getPlatformBlock,
  getShiftRowDetail,
  type PlatformBlock,
  type RowDetail,
} from "@/features/shifts/lib/cerrar-turnos-mock-detail";
import { fetchShiftTripsDetail } from "@/features/shifts/lib/fetch-shift-trips-detail";
import { mapTripsToRowDetail } from "@/features/shifts/lib/shift-trip-detail-mapper";
import type {
  CerrarTurnosRow,
  ShiftLiveDetailInput,
  ShiftPlatformName,
  ShiftTableRow,
} from "@/features/shifts/ui/cerrar-turnos-types";

export type { ShiftLiveDetailInput };

async function fetchTripDetail(
  live: ShiftLiveDetailInput,
  rowRango: string,
  filterPlatform?: ShiftPlatformName,
  signal?: AbortSignal,
): Promise<RowDetail> {
  const data = await fetchShiftTripsDetail(live, filterPlatform, signal);
  const fechaLabel = rowRango.includes("–")
    ? rowRango.split("–").pop()?.trim() ?? rowRango
    : rowRango;
  return mapTripsToRowDetail(data.trips, fechaLabel, filterPlatform, data.activity);
}

function canLoadLiveDetail(live: ShiftLiveDetailInput | undefined): boolean {
  if (!live) return false;
  if (live.driverId && live.liquidationStatus === "pending") return true;
  return live.tripIds.length > 0;
}

export function useLiveShiftRowDetail(
  row: ShiftTableRow & { desglose?: CerrarTurnosRow["desglose"] },
  live: ShiftLiveDetailInput | undefined,
  refreshToken = 0,
) {
  const mockDetail = useMemo(() => getShiftRowDetail(row), [row]);
  const [loading, setLoading] = useState(false);
  const [dbDetail, setDbDetail] = useState<RowDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const liveKey = live
    ? `${live.driverId ?? ""}:${live.liquidationStatus}:${live.tripIds.length}:${live.tripIds[0] ?? ""}:${live.tripIds[live.tripIds.length - 1] ?? ""}`
    : "";
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const liveInput = liveRef.current;
    if (!canLoadLiveDetail(liveInput)) {
      setDbDetail(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchTripDetail(liveInput!, row.rango, undefined, controller.signal)
      .then((detail) => {
        if (!cancelled) setDbDetail(detail);
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setDbDetail(null);
        setError(e instanceof Error ? e.message : "Error al cargar el detalle.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [row.rango, liveKey, refreshToken]);

  const useMockFallback = !canLoadLiveDetail(live);
  const emptyDetail: RowDetail = useMemo(
    () => ({
      fechaLabel: row.rango.includes("–")
        ? row.rango.split("–").pop()?.trim() ?? row.rango
        : row.rango,
      platforms: [],
    }),
    [row.rango],
  );

  return {
    loading,
    error,
    fromDb: dbDetail !== null,
    detail: useMockFallback ? (dbDetail ?? mockDetail) : (dbDetail ?? emptyDetail),
  };
}

export function useLivePlatformShiftDetail(
  row: ShiftTableRow & { desglose?: CerrarTurnosRow["desglose"] },
  platform: ShiftPlatformName,
  live: ShiftLiveDetailInput | undefined,
  refreshToken = 0,
) {
  const mockBlock = useMemo(
    () => getPlatformBlock(row, platform, row.desglose),
    [platform, row],
  );
  const [loading, setLoading] = useState(false);
  const [dbBlock, setDbBlock] = useState<PlatformBlock | null>(null);
  const [error, setError] = useState<string | null>(null);
  const liveKey = live
    ? `${live.driverId ?? ""}:${live.liquidationStatus}:${live.tripIds.length}:${platform}`
    : "";
  const liveRef = useRef(live);
  liveRef.current = live;

  useEffect(() => {
    const liveInput = liveRef.current;
    if (!canLoadLiveDetail(liveInput)) {
      setDbBlock(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchTripDetail(liveInput!, row.rango, platform, controller.signal)
      .then((detail) => {
        if (!cancelled) setDbBlock(detail.platforms[0] ?? null);
      })
      .catch((e: unknown) => {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        setDbBlock(null);
        setError(e instanceof Error ? e.message : "Error al cargar el detalle.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [platform, row.rango, liveKey, refreshToken]);

  const useMockFallback = !canLoadLiveDetail(live);

  return {
    loading,
    error,
    fromDb: dbBlock !== null,
    block: useMockFallback ? (dbBlock ?? mockBlock) : dbBlock,
  };
}
