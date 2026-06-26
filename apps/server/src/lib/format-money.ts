export const FLEETHUB_DEFAULT_TIMEZONE = "Europe/Madrid";

export function formatEuroFromCents(cents: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatInstantInTimezone(
  iso: string,
  timeZone: string,
  style: "full" | "tripInstant",
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: style === "full" ? "numeric" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  const pad2 = (v: string) => v.padStart(2, "0");
  const day = pad2(part("day"));
  const month = pad2(part("month"));
  const hour = pad2(part("hour"));
  const minute = pad2(part("minute"));
  if (style === "tripInstant") {
    return `${day}/${month} ${hour}:${minute}`;
  }
  return `${day}/${month}/${part("year")} ${hour}:${minute}`;
}

export function formatDateTimeEs(
  iso: string,
  timeZone: string = FLEETHUB_DEFAULT_TIMEZONE,
): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** Compact date/time for PDF tables (fixed width, no locale commas). */
export function formatDateTimeShortEs(
  iso: string,
  timeZone: string = FLEETHUB_DEFAULT_TIMEZONE,
): string {
  return formatInstantInTimezone(iso, timeZone, "full");
}

/** Single-line trip instant for narrow PDF columns (dd/MM HH:mm). */
export function formatTripInstantEs(
  iso: string,
  timeZone: string = FLEETHUB_DEFAULT_TIMEZONE,
): string {
  return formatInstantInTimezone(iso, timeZone, "tripInstant");
}
