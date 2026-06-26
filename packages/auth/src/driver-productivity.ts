import type { ProductivityThresholds } from "./tenant-settings";

export type ProductivityLevel = "ok" | "warn" | "low" | "none";

export function productivityLevelFromMetrics(
  eurPerHour: number,
  tripsPerHour: number,
  acceptancePct: number,
  thresholds: ProductivityThresholds,
): ProductivityLevel {
  if (eurPerHour <= 0 && tripsPerHour <= 0) return "none";

  const eurOk = eurPerHour >= thresholds.eurPerHourMin;
  const tripsOk = tripsPerHour >= thresholds.tripsPerHourMin;
  const accOk = acceptancePct >= thresholds.acceptanceRateMin;

  if (eurOk && tripsOk && accOk) return "ok";

  const eurWarn = eurPerHour >= thresholds.eurPerHourMin - 2;
  const tripsWarn = tripsPerHour >= thresholds.tripsPerHourMin - 0.3;
  const accWarn = acceptancePct >= thresholds.acceptanceRateMin - 15;

  if (eurWarn || tripsWarn || accWarn) return "warn";

  return "low";
}

/** Estimated acceptance when platform metrics are unavailable (seed/demo). */
export function estimateAcceptanceRate(tripCount: number): number {
  return Math.min(95, Math.max(55, 65 + tripCount * 2));
}

/** Accepted ÷ (completed + missed + rejected) when platform supplies offer counts. */
export function acceptanceFromOffers(
  completedTrips: number,
  missedOffers: number,
  rejectedTrips: number,
): number | null {
  const offers = completedTrips + missedOffers + rejectedTrips;
  if (offers <= 0) return null;
  return Math.min(99, Math.round((completedTrips / offers) * 100));
}

export function tripDurationMs(startedAt: Date, endedAt: Date | null): number {
  if (endedAt) return Math.max(0, endedAt.getTime() - startedAt.getTime());
  return 25 * 60 * 1000;
}
