import {
  TENANT_OPERATIONS_TIMEZONE,
  formatDateEsInTenantTz,
  formatDateTimeEsInTenantTz,
  formatDateTimeShortInTenantTz,
  formatDayLabelInTenantTz,
  formatHourLabelInTenantTz,
  tenantCalendarDayKey,
  tenantDayEndFromCalendarDate,
  tenantDayEndFromIso,
  tenantDayStartFromCalendarDate,
  tenantDayStartFromIso,
  tenantTimezoneShortLabel,
  wallTimeInZoneToUtc,
} from "@fleethub/auth/display-timezone";

/** Display timezone for tenant operations (Spain). */
export const TENANT_DISPLAY_TIMEZONE = TENANT_OPERATIONS_TIMEZONE;

const DEFAULT_DATETIME_OPTS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
};

export {
  formatDateEsInTenantTz,
  formatDateTimeShortInTenantTz,
  formatDayLabelInTenantTz,
  formatHourLabelInTenantTz,
  tenantCalendarDayKey,
  tenantDayEndFromCalendarDate,
  tenantDayEndFromIso,
  tenantDayStartFromCalendarDate,
  tenantDayStartFromIso,
  tenantTimezoneShortLabel,
  wallTimeInZoneToUtc,
};

export function formatDateTimeInTenantTz(
  value: string | Date,
  options?: Intl.DateTimeFormatOptions,
): string {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-ES", {
    timeZone: TENANT_DISPLAY_TIMEZONE,
    ...DEFAULT_DATETIME_OPTS,
    ...options,
  });
}

export function formatDateTimeRangeInTenantTz(from: string | Date, to: string | Date): string {
  const a = formatDateTimeInTenantTz(from);
  const b = formatDateTimeInTenantTz(to);
  return a === b ? a : `${a} – ${b}`;
}

export function formatTripInstantInTenantTz(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const parts = new Intl.DateTimeFormat("es-ES", {
    timeZone: TENANT_DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";
  return `${part("day").padStart(2, "0")}/${part("month").padStart(2, "0")} ${part("hour").padStart(2, "0")}:${part("minute").padStart(2, "0")}`;
}

/** Alias for exports and server-side formatting. */
export function formatDateTimeEs(value: string | Date): string {
  return formatDateTimeEsInTenantTz(value);
}
