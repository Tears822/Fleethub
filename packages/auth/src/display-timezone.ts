/** Operations / display timezone for Spanish tenants (CET/CEST). */
export const TENANT_OPERATIONS_TIMEZONE = "Europe/Madrid";

type TzParts = {
  y: number;
  m: number;
  d: number;
  h: number;
  min: number;
  sec: number;
};

function partsInTimezone(d: Date, timeZone: string): TzParts {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  return {
    y: get("year"),
    m: get("month"),
    d: get("day"),
    h: get("hour"),
    min: get("minute"),
    sec: get("second"),
  };
}

/** UTC instant for a wall-clock time in the tenant timezone. */
export function wallTimeInZoneToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone = TENANT_OPERATIONS_TIMEZONE,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  for (let i = 0; i < 4; i++) {
    const p = partsInTimezone(guess, timeZone);
    const targetMs = Date.UTC(year, month - 1, day, hour, minute, second);
    const actualMs = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.sec);
    const diff = targetMs - actualMs;
    guess = new Date(guess.getTime() + diff);
    if (diff === 0) break;
  }
  return guess;
}

export type TenantBucketGranularity = "hour" | "day";

/** Start of the hour or calendar day containing `d` in Europe/Madrid. */
export function tenantBucketStart(d: Date, granularity: TenantBucketGranularity): Date {
  const p = partsInTimezone(d, TENANT_OPERATIONS_TIMEZONE);
  if (granularity === "hour") {
    return wallTimeInZoneToUtc(p.y, p.m, p.d, p.h, 0, 0);
  }
  return wallTimeInZoneToUtc(p.y, p.m, p.d, 0, 0, 0);
}

/** Previous bucket boundary before `bucket` (Madrid wall clock). */
export function previousTenantBucket(
  bucket: Date,
  granularity: TenantBucketGranularity,
): Date {
  const anchor =
    granularity === "hour"
      ? wallTimeInZoneToUtc(
          partsInTimezone(bucket, TENANT_OPERATIONS_TIMEZONE).y,
          partsInTimezone(bucket, TENANT_OPERATIONS_TIMEZONE).m,
          partsInTimezone(bucket, TENANT_OPERATIONS_TIMEZONE).d,
          partsInTimezone(bucket, TENANT_OPERATIONS_TIMEZONE).h,
          0,
          0,
        )
      : tenantBucketStart(bucket, "day");
  const stepMs = granularity === "hour" ? 3_600_000 : 86_400_000;
  return tenantBucketStart(new Date(anchor.getTime() - stepMs), granularity);
}

/** `YYYY-MM-DD` calendar day in Europe/Madrid for a UTC instant. */
export function tenantCalendarDayKey(date: Date): string {
  const p = partsInTimezone(date, TENANT_OPERATIONS_TIMEZONE);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

/** Midnight (Madrid) as UTC for an ISO calendar date `YYYY-MM-DD`. */
export function tenantDayStartFromIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  return wallTimeInZoneToUtc(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0);
}

/** End of calendar day (23:59:59.999 Madrid). */
export function tenantDayEndFromIso(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Invalid ISO date: ${iso}`);
  const next = wallTimeInZoneToUtc(Number(m[1]), Number(m[2]), Number(m[3]), 0, 0, 0);
  return new Date(next.getTime() + 86_400_000 - 1);
}

/** Start of a calendar day (local date parts) in Madrid. */
export function tenantDayStartFromCalendarDate(d: Date): Date {
  return wallTimeInZoneToUtc(d.getFullYear(), d.getMonth() + 1, d.getDate(), 0, 0, 0);
}

/** End of a calendar day (local date parts) in Madrid. */
export function tenantDayEndFromCalendarDate(d: Date): Date {
  const start = tenantDayStartFromCalendarDate(d);
  return new Date(start.getTime() + 86_400_000 - 1);
}

/** `Date` for `@db.Date` columns (Madrid calendar day). */
export function tenantDayDateFromInstant(d: Date): Date {
  return new Date(`${tenantCalendarDayKey(d)}T00:00:00.000Z`);
}

/** `Date` for `@db.Date` from a Madrid calendar key `YYYY-MM-DD`. */
export function tenantDayDateFromKey(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}

/** Calendar `Date` (server-local midnight) for a Madrid calendar day containing `d`. */
export function tenantCalendarDateFromInstant(d: Date): Date {
  return tenantDayDateFromKey(tenantCalendarDayKey(d));
}

export function formatHourLabelInTenantTz(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("es-ES", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TENANT_OPERATIONS_TIMEZONE,
  });
}

export function formatDayLabelInTenantTz(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-ES", {
    weekday: "short",
    day: "numeric",
    timeZone: TENANT_OPERATIONS_TIMEZONE,
  });
}

export function formatDateEsInTenantTz(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: TENANT_OPERATIONS_TIMEZONE,
  }).format(d);
}

export function formatDateTimeEsInTenantTz(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    timeZone: TENANT_OPERATIONS_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

/** Short date + time for tables (dd/mm/yy, HH:mm) in Europe/Madrid. */
export function formatDateTimeShortInTenantTz(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    timeZone: TENANT_OPERATIONS_TIMEZONE,
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Short label for chart titles, e.g. "CEST" or "CET". */
export function tenantTimezoneShortLabel(at = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TENANT_OPERATIONS_TIMEZONE,
    timeZoneName: "short",
  }).formatToParts(at);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value;
  return tz ?? "hora España";
}
