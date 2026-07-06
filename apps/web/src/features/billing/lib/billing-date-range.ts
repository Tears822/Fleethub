import { formatDateEs, isoToDateEs, parseDateEs } from "@/shared/lib/date-es";

/** Demo seed range (abr–may 2026) — informes y mensajes vacíos. */
export const BILLING_DEFAULT_FROM_ISO = "2026-04-01";
export const BILLING_DEFAULT_TO_ISO = "2026-05-31";
export const BILLING_DEFAULT_FROM_ES = isoToDateEs(BILLING_DEFAULT_FROM_ISO)!;
export const BILLING_DEFAULT_TO_ES = isoToDateEs(BILLING_DEFAULT_TO_ISO)!;
export const BILLING_DEMO_RANGE_QUERY = "from=2026-04-01&to=2026-05-31";

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfCurrentMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export type BillingDateRange = {
  dateFrom: Date;
  dateTo: Date;
  dateFromEs: string;
  dateToEs: string;
  fromIso: string;
  toIso: string;
};

function parseIsoDate(iso: string): Date | null {
  const es = isoToDateEs(iso);
  if (!es) return null;
  return parseDateEs(es);
}

function toIsoFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export type BillingDateRangeDefault = "month-to-date" | "last-7-days";

function last7DaysRange(): { dateFrom: Date; dateTo: Date } {
  const dateTo = todayStart();
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - 6);
  return { dateFrom, dateTo };
}

/** Últimos 7 días naturales (hoy inclusive) — preset por defecto en Turnos cerrados. */
export function last7DaysRangeEs(reference = new Date()): { fromEs: string; toEs: string } {
  const dateTo = new Date(reference);
  dateTo.setHours(0, 0, 0, 0);
  const dateFrom = new Date(dateTo);
  dateFrom.setDate(dateFrom.getDate() - 6);
  return { fromEs: formatDateEs(dateFrom), toEs: formatDateEs(dateTo) };
}

export function resolveBillingDateRange(
  input: {
    from?: string;
    to?: string;
  },
  options?: { defaultWhenMissing?: BillingDateRangeDefault },
): BillingDateRange {
  const hasFrom = Boolean(input.from?.trim());
  const hasTo = Boolean(input.to?.trim());
  const defaultWhenMissing = options?.defaultWhenMissing ?? "month-to-date";

  let dateFrom: Date;
  let dateTo: Date;

  if (!hasFrom && !hasTo && defaultWhenMissing === "last-7-days") {
    ({ dateFrom, dateTo } = last7DaysRange());
  } else {
    dateFrom = hasFrom ? parseIsoDate(input.from!)! : todayStart();
    dateTo = hasTo ? parseIsoDate(input.to!)! : endOfCurrentMonth();
    if (!dateFrom) dateFrom = todayStart();
    if (!dateTo) dateTo = endOfCurrentMonth();
  }

  if (dateFrom.getTime() > dateTo.getTime()) {
    const swap = dateFrom;
    dateFrom = dateTo;
    dateTo = swap;
  }

  return {
    dateFrom,
    dateTo,
    dateFromEs: formatDateEs(dateFrom),
    dateToEs: formatDateEs(dateTo),
    fromIso: toIsoFromDate(dateFrom),
    toIso: toIsoFromDate(dateTo),
  };
}

/** Build query string for `/facturacion?from=…&to=…` from Spanish dates. */
export function billingRangeQueryFromEs(
  dateFromEs: string,
  dateToEs: string,
): { ok: true; query: string } | { ok: false; message: string } {
  const from = parseDateEs(dateFromEs);
  const to = parseDateEs(dateToEs);
  if (!from || !to) {
    return { ok: false, message: "Introduce fechas válidas (dd/mm/aaaa)." };
  }
  if (from.getTime() > to.getTime()) {
    return { ok: false, message: "La fecha «desde» no puede ser posterior a «hasta»." };
  }
  return {
    ok: true,
    query: `from=${toIsoFromDate(from)}&to=${toIsoFromDate(to)}`,
  };
}

/** Mes natural para selector rápido (0 = enero). */
export function monthRangeEs(year: number, monthIndex: number): {
  fromEs: string;
  toEs: string;
  query: string;
} {
  const from = new Date(year, monthIndex, 1);
  const to = new Date(year, monthIndex + 1, 0);
  const fromEs = formatDateEs(from);
  const toEs = formatDateEs(to);
  return {
    fromEs,
    toEs,
    query: `from=${toIsoFromDate(from)}&to=${toIsoFromDate(to)}`,
  };
}

export type BillingMonthOption = {
  key: string;
  label: string;
  query: string;
  fromEs: string;
  toEs: string;
};

function monthLabelForIndex(monthIndex: number, locale: string): string {
  const d = new Date(2026, monthIndex, 1);
  return new Intl.DateTimeFormat(locale === "ca" ? "ca-ES" : "es-ES", { month: "long" }).format(d);
}

/** Últimos 12 meses naturales para el desplegable «mes rápido». */
export function billingMonthQuickOptions(
  reference = new Date(),
  locale = "es",
): BillingMonthOption[] {
  const options: BillingMonthOption[] = [];
  for (let i = 0; i < 12; i++) {
    const d = new Date(reference.getFullYear(), reference.getMonth() - i, 1);
    const { fromEs, toEs, query } = monthRangeEs(d.getFullYear(), d.getMonth());
    const monthName = monthLabelForIndex(d.getMonth(), locale);
    const label = `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} ${d.getFullYear()}`;
    options.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label, query, fromEs, toEs });
  }
  return options;
}
