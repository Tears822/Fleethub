export type TopDriversPeriod = "today" | "week" | "month";

export function parseTopDriversPeriod(raw?: string): TopDriversPeriod {
  if (raw === "week" || raw === "month") return raw;
  return "today";
}

export function topDriversPeriodSubtitleKey(period: TopDriversPeriod): string {
  if (period === "week") return "dashboard.topDrivers.subtitleWeek";
  if (period === "month") return "dashboard.topDrivers.subtitleMonth";
  return "dashboard.topDrivers.subtitleToday";
}

export function topDriversEmptyMessageKey(period: TopDriversPeriod): string {
  if (period === "week") return "dashboard.topDrivers.emptyWeek";
  if (period === "month") return "dashboard.topDrivers.emptyMonth";
  return "dashboard.topDrivers.emptyToday";
}

/** @deprecated Use topDriversPeriodSubtitleKey + t() */
export function topDriversPeriodSubtitle(period: TopDriversPeriod): string {
  if (period === "week") return "últimos 7 días · importe bruto facturado";
  if (period === "month") return "mes en curso · importe bruto facturado";
  return "hoy · importe bruto facturado";
}

/** @deprecated Use topDriversEmptyMessageKey + t() */
export function topDriversEmptyMessage(period: TopDriversPeriod): string {
  if (period === "week") return "Sin viajes cerrados en los últimos 7 días.";
  if (period === "month") return "Sin viajes cerrados en el mes en curso.";
  return "Sin viajes cerrados hoy para mostrar ranking.";
}

/** Inicio del periodo (00:00 local) para filtrar viajes del ranking. */
export function topDriversPeriodStart(period: TopDriversPeriod, reference = new Date()): Date {
  const start = new Date(reference);
  start.setHours(0, 0, 0, 0);
  if (period === "week") {
    start.setDate(start.getDate() - 6);
    return start;
  }
  if (period === "month") {
    return new Date(start.getFullYear(), start.getMonth(), 1);
  }
  return start;
}
