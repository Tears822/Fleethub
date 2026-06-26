import {
  BILLING_DEFAULT_FROM_ES,
  BILLING_DEFAULT_FROM_ISO,
  BILLING_DEFAULT_TO_ES,
  BILLING_DEFAULT_TO_ISO,
  resolveBillingDateRange,
  type BillingDateRange,
} from "@/features/billing/lib/billing-date-range";
import { formatDateEs, parseDateEs } from "@/shared/lib/date-es";

export type InformeDateRange = BillingDateRange;

function currentCalendarMonthRange(): InformeDateRange {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
  const toIso = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`;
  return {
    dateFrom: from,
    dateTo: to,
    dateFromEs: formatDateEs(from),
    dateToEs: formatDateEs(to),
    fromIso,
    toIso,
  };
}

function monthRangeFromYearMonth(year: number, month: number): InformeDateRange | null {
  if (month < 1 || month > 12 || year < 2020 || year > 2100) return null;
  const from = new Date(year, month - 1, 1);
  const to = new Date(year, month, 0);
  const fromIso = `${year}-${String(month).padStart(2, "0")}-01`;
  const toIso = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`;
  return {
    dateFrom: from,
    dateTo: to,
    dateFromEs: formatDateEs(from),
    dateToEs: formatDateEs(to),
    fromIso,
    toIso,
  };
}

/** Resolve informe range from `from`/`to` ISO, legacy `year`/`month`, or defaults. */
export function resolveInformeDateRange(input: {
  from?: string;
  to?: string;
  year?: string;
  month?: string;
}): InformeDateRange {
  if (input.from || input.to) {
    return resolveBillingDateRange({ from: input.from, to: input.to });
  }

  const year = Number(input.year);
  const month = Number(input.month);
  if (input.year && input.month) {
    const legacy = monthRangeFromYearMonth(year, month);
    if (legacy) return legacy;
  }

  if (!input.year && !input.month) {
    return currentCalendarMonthRange();
  }

  return resolveBillingDateRange({
    from: BILLING_DEFAULT_FROM_ISO,
    to: BILLING_DEFAULT_TO_ISO,
  });
}

export { BILLING_DEFAULT_FROM_ES, BILLING_DEFAULT_TO_ES };

export type InformeRangeErrorKey = "invalidDates" | "fromAfterTo";

export function informeRangeQueryFromEs(
  dateFromEs: string,
  dateToEs: string,
): { ok: true; query: string } | { ok: false; errorKey: InformeRangeErrorKey } {
  const from = parseDateEs(dateFromEs);
  const to = parseDateEs(dateToEs);
  if (!from || !to) {
    return { ok: false, errorKey: "invalidDates" };
  }
  if (from.getTime() > to.getTime()) {
    return { ok: false, errorKey: "fromAfterTo" };
  }
  const y = (d: Date) => d.getFullYear();
  const m = (d: Date) => String(d.getMonth() + 1).padStart(2, "0");
  const day = (d: Date) => String(d.getDate()).padStart(2, "0");
  return {
    ok: true,
    query: `from=${y(from)}-${m(from)}-${day(from)}&to=${y(to)}-${m(to)}-${day(to)}`,
  };
}

export function shiftInformeMonth(
  range: InformeDateRange,
  delta: -1 | 1,
): InformeDateRange {
  const anchor = new Date(range.dateFrom);
  anchor.setMonth(anchor.getMonth() + delta, 1);
  const from = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const to = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const fromIso = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
  const toIso = `${to.getFullYear()}-${String(to.getMonth() + 1).padStart(2, "0")}-${String(to.getDate()).padStart(2, "0")}`;
  return {
    dateFrom: from,
    dateTo: to,
    dateFromEs: formatDateEs(from),
    dateToEs: formatDateEs(to),
    fromIso,
    toIso,
  };
}
