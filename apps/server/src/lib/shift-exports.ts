import ExcelJS from "exceljs";
import { formatDateEsInTenantTz, tenantCalendarDayKey, tenantDayStartFromIso, tenantDayEndFromIso } from "@fleethub/auth/display-timezone";
import { listClosedLiquidationEvents } from "@fleethub/auth";
import { driverWhere } from "@fleethub/auth/tenant-scope";
import { resolveCompanyScopeWithCookie } from "@fleethub/auth/company-scope-cookie";
import type { AppSession } from "@fleethub/auth";
import { RidePlatform, withTenant } from "@fleethub/db";
import { exportCompanyScopeLabel } from "./export-company-scope-label.js";
import { setShiftHeaderWidths, shiftExportHeaders, translateScopeLabel } from "./export-labels.js";
import { getExportTranslator } from "./export-translator.js";
import {
  aggregateTripsByDriver,
  aggToEuroRow,
  platformLabel,
  platformSummaryLabel,
  type TripForAggregation,
} from "./shift-trip-aggregation.js";

function formatShiftPeriodDateEs(from: Date, to: Date): string {
  const fromDay = tenantCalendarDayKey(from);
  const toDay = tenantCalendarDayKey(to);
  if (fromDay === toDay) return formatDateEsInTenantTz(from);
  return `${formatDateEsInTenantTz(from)} – ${formatDateEsInTenantTz(to)}`;
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function matchesDriverSearch(driverName: string, query: string): boolean {
  const q = normalizeForSearch(query.trim());
  if (!q) return true;
  return normalizeForSearch(driverName).includes(q);
}

function eventOverlapsRange(
  periodFrom: Date,
  periodTo: Date,
  fromDate: Date | null,
  toDate: Date | null,
): boolean {
  if (!fromDate || !toDate) return true;
  const rangeStart = new Date(fromDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(toDate);
  rangeEnd.setHours(23, 59, 59, 999);
  return periodFrom <= rangeEnd && periodTo >= rangeStart;
}

const tripSelect = {
  id: true,
  platform: true,
  startedAt: true,
  endedAt: true,
  fareType: true,
  grossAmountCents: true,
  platformFeeCents: true,
  netAmountCents: true,
  tipCents: true,
  platformBonusCents: true,
  tollCents: true,
  paymentMethod: true,
  paymentValidated: true,
  driver: {
    select: {
      id: true,
      fullName: true,
      isActive: true,
      company: { select: { legalName: true } },
    },
  },
} as const;

export function parseShiftExportPlatform(raw?: string): RidePlatform | undefined {
  const value = raw?.trim().toUpperCase();
  if (!value) return undefined;
  if (value in RidePlatform) return value as RidePlatform;
  return undefined;
}

function addShiftRowsToSheet(
  sheet: ExcelJS.Worksheet,
  groups: ReturnType<typeof aggregateTripsByDriver>,
  platformFilter?: RidePlatform,
  fecha?: string,
): void {
  for (const group of groups) {
    if (platformFilter) {
      const agg = group.byPlatform.get(platformFilter);
      if (!agg || agg.count === 0) continue;
      const row = aggToEuroRow(agg);
      sheet.addRow([
        ...(fecha ? [fecha] : []),
        group.companyLegalName,
        platformLabel(platformFilter),
        group.driver.fullName,
        row.viajes,
        row.importeTotal,
        row.tarifa3,
        row.pagoApp,
        row.efectivo,
        row.tarjetas,
        row.propinas,
        row.primas,
        row.peajes,
        row.avisos,
      ]);
      continue;
    }

    const hasBoth = group.platforms.size > 1;

    if (hasBoth) {
      for (const [platform, agg] of group.byPlatform.entries()) {
        if (agg.count === 0) continue;
        const row = aggToEuroRow(agg);
        sheet.addRow([
          ...(fecha ? [fecha] : []),
          group.companyLegalName,
          platformLabel(platform),
          group.driver.fullName,
          row.viajes,
          row.importeTotal,
          row.tarifa3,
          row.pagoApp,
          row.efectivo,
          row.tarjetas,
          row.propinas,
          row.primas,
          row.peajes,
          row.avisos,
        ]);
      }
      continue;
    }

    const summary = aggToEuroRow(group.money);
    const plataformas = platformSummaryLabel(group.platforms);

    sheet.addRow([
      ...(fecha ? [fecha] : []),
      group.companyLegalName,
      plataformas,
      group.driver.fullName,
      summary.viajes,
      summary.importeTotal,
      summary.tarifa3,
      summary.pagoApp,
      summary.efectivo,
      summary.tarjetas,
      summary.propinas,
      summary.primas,
      summary.peajes,
      summary.avisos,
    ]);
  }
}

function formatExportDateEs(iso?: string): string | undefined {
  if (!iso) return undefined;
  const datePart = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    return formatDateEsInTenantTz(tenantDayStartFromIso(datePart));
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return formatDateEsInTenantTz(d);
}

function beginShiftExportSheet(
  sheet: ExcelJS.Worksheet,
  metadata: Array<[string, string]>,
  headers: string[],
  withDate: boolean,
): void {
  for (const [label, value] of metadata) {
    sheet.addRow([label, value]);
  }
  if (metadata.length > 0) sheet.addRow([]);
  const headerRow = sheet.addRow([...headers]);
  headerRow.font = { bold: true };
  setShiftHeaderWidths(sheet, headers, withDate);
}

export async function buildCerrarTurnosXlsx(
  session: AppSession,
  platform?: RidePlatform,
  cookieHeader?: string,
): Promise<Buffer> {
  if (session.kind !== "tenant" || !session.tid) {
    throw new Error("UNAUTHORIZED");
  }

  const t = await getExportTranslator(session);

  const scope = await resolveCompanyScopeWithCookie({
    ...session,
    kind: "tenant",
    tid: session.tid,
  }, { cookieHeader });

  const trips = await withTenant(session.tid, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: session.tid,
        liquidationStatus: "pending",
        driver: driverWhere(scope),
        ...(platform ? { platform } : {}),
      },
      select: tripSelect,
      orderBy: [{ driver: { fullName: "asc" } }, { startedAt: "asc" }],
    }),
  );

  const groups = aggregateTripsByDriver(trips as TripForAggregation[]);
  const wb = new ExcelJS.Workbook();
  const sheetName = platform
    ? t("exports.sheets.pendingPlatform", { platform: platformLabel(platform) })
    : t("exports.sheets.pendingClosure");
  const sheet = wb.addWorksheet(sheetName.slice(0, 31));
  const tenantSession = session as AppSession & { kind: "tenant"; tid: string };
  const empresa = translateScopeLabel(
    t,
    await exportCompanyScopeLabel(tenantSession, cookieHeader),
  );
  const meta: Array<[string, string]> = [[t("exports.meta.company"), empresa]];
  if (platform) meta.push([t("exports.meta.platform"), platformLabel(platform)]);
  meta.push([t("exports.meta.view"), t("exports.views.pendingClosure")]);
  const headers = shiftExportHeaders(t, true);
  beginShiftExportSheet(sheet, meta, headers, true);
  for (const group of groups) {
    const fecha = formatShiftPeriodDateEs(group.minDate, group.maxDate);
    addShiftRowsToSheet(sheet, [group], platform, fecha);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildTurnosCerradosXlsx(
  session: AppSession,
  from?: string,
  to?: string,
  platform?: RidePlatform,
  cookieHeader?: string,
  search?: string,
): Promise<Buffer> {
  if (session.kind !== "tenant" || !session.tid) {
    throw new Error("UNAUTHORIZED");
  }

  const t = await getExportTranslator(session);

  const scope = await resolveCompanyScopeWithCookie({
    ...session,
    kind: "tenant",
    tid: session.tid,
  }, { cookieHeader });

  const fromDate = from ? tenantDayStartFromIso(from.slice(0, 10)) : null;
  const toDate = to ? tenantDayEndFromIso(to.slice(0, 10)) : null;

  const eventsResult = await listClosedLiquidationEvents(session, {
    dateFrom: fromDate ?? undefined,
    dateTo: toDate ?? undefined,
  });
  if (!eventsResult.ok) {
    throw new Error(eventsResult.error.message);
  }

  const searchTrimmed = search?.trim() ?? "";
  const events = eventsResult.value.filter((event) => {
    if (searchTrimmed && !matchesDriverSearch(event.driverName, searchTrimmed)) {
      return false;
    }
    if (
      fromDate &&
      toDate &&
      !eventOverlapsRange(event.periodFrom, event.periodTo, fromDate, toDate)
    ) {
      return false;
    }
    return true;
  });

  const tripIdSet = new Set(events.flatMap((e) => e.tripIds));

  const trips = await withTenant(session.tid, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: session.tid,
        id: { in: [...tripIdSet] },
        liquidationStatus: "closed",
        driver: driverWhere(scope),
        ...(platform ? { platform } : {}),
      },
      select: tripSelect,
      orderBy: [{ startedAt: "asc" }],
    }),
  );

  const tripsById = new Map(trips.map((trip) => [trip.id, trip as TripForAggregation]));

  const wb = new ExcelJS.Workbook();
  const sheetName = platform
    ? t("exports.sheets.closedPlatform", { platform: platformLabel(platform) })
    : t("exports.sheets.closedShifts");
  const sheet = wb.addWorksheet(sheetName.slice(0, 31));
  const tenantSession = session as AppSession & { kind: "tenant"; tid: string };
  const empresa = translateScopeLabel(
    t,
    await exportCompanyScopeLabel(tenantSession, cookieHeader),
  );
  const meta: Array<[string, string]> = [[t("exports.meta.company"), empresa]];
  const desde = formatExportDateEs(from);
  const hasta = formatExportDateEs(to);
  if (desde) meta.push([t("exports.meta.from"), desde]);
  if (hasta) meta.push([t("exports.meta.to"), hasta]);
  if (platform) meta.push([t("exports.meta.platform"), platformLabel(platform)]);
  if (searchTrimmed) meta.push([t("exports.meta.search"), searchTrimmed]);
  meta.push([t("exports.meta.view"), t("exports.views.closedShifts")]);
  const headers = shiftExportHeaders(t, true);
  beginShiftExportSheet(sheet, meta, headers, true);

  for (const event of events) {
    const eventTrips = event.tripIds
      .map((id) => tripsById.get(id))
      .filter((trip): trip is TripForAggregation => trip != null);
    if (eventTrips.length === 0) continue;
    const groups = aggregateTripsByDriver(eventTrips);
    const fecha = formatDateEsInTenantTz(event.closedAt);
    addShiftRowsToSheet(sheet, groups, platform, fecha);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
