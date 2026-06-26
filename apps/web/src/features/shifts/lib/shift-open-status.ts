export function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export type PendingTripForOpenShift = { driverId: string; startedAt: Date };
export type LiquidationCloseToday = { driverId: string; closedAt: Date };

/**
 * Turno abierto = viaje pendiente iniciado después del último cierre de liquidación de hoy
 * (o sin cierre hoy). Misma regla que el KPI «Turnos activos ahora» del dashboard.
 */
export function computeTurnoAbiertoByDriver(
  pendingTrips: PendingTripForOpenShift[],
  liquidationsToday: LiquidationCloseToday[],
): Map<string, boolean> {
  const lastCloseTodayByDriver = new Map<string, Date>();
  for (const liq of liquidationsToday) {
    const prev = lastCloseTodayByDriver.get(liq.driverId);
    if (!prev || liq.closedAt > prev) {
      lastCloseTodayByDriver.set(liq.driverId, liq.closedAt);
    }
  }

  const result = new Map<string, boolean>();
  for (const trip of pendingTrips) {
    const lastClose = lastCloseTodayByDriver.get(trip.driverId);
    const open = !lastClose || trip.startedAt > lastClose;
    if (open) {
      result.set(trip.driverId, true);
    } else if (!result.has(trip.driverId)) {
      result.set(trip.driverId, false);
    }
  }
  return result;
}
