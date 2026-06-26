import ExcelJS from "exceljs";
import { tenantCalendarDayKey, tenantCalendarDateFromInstant } from "@fleethub/auth/display-timezone";
import {
  driverWhere,
  getSectorDriverAveragesForPlatform,
  getTenantAnalyticsSettings,
  resolveCompanyScopeForSession,
} from "@fleethub/auth";
import type { AppSession } from "@fleethub/auth";
import { withTenant } from "@fleethub/db";
import { RidePlatform } from "@prisma/client";
import { getExportTranslator } from "./export-translator.js";

function parsePlatform(raw: string | undefined): RidePlatform | undefined {
  if (raw === "UBER" || raw === "uber") return RidePlatform.UBER;
  if (raw === "FREENOW" || raw === "freenow") return RidePlatform.FREENOW;
  if (raw === "BOLT" || raw === "bolt") return RidePlatform.BOLT;
  if (raw === "CABIFY" || raw === "cabify") return RidePlatform.CABIFY;
  return undefined;
}

type DriverAgg = {
  fullName: string;
  grossCents: bigint;
  feeCents: bigint;
  tipCents: bigint;
  bonusCents: bigint;
  count: number;
  shiftDays: Set<string>;
  totalDurationMs: number;
};

type DriverMetrics = {
  conductor: string;
  facturacion: number;
  comisiones: number;
  viajes: number;
  turnos: number;
  mediaTurno: number;
  eurHora: number;
  propinas: number;
  primas: number;
};

function dayKey(d: Date): string {
  return tenantCalendarDayKey(d);
}

function driverMetricsFromAgg(agg: DriverAgg): DriverMetrics {
  const facturacion = Math.round(Number(agg.grossCents) / 100);
  const comisiones = -Math.round(Number(agg.feeCents) / 100);
  const turnos = Math.max(1, agg.shiftDays.size);
  const hours = Math.max(0.5, agg.totalDurationMs / 3_600_000);
  const eurHora = Math.round((facturacion / hours) * 100) / 100;
  return {
    conductor: agg.fullName,
    facturacion,
    comisiones,
    viajes: agg.count,
    turnos,
    mediaTurno: Math.round(facturacion / turnos),
    eurHora,
    propinas: Math.round(Number(agg.tipCents) / 100),
    primas: Math.round(Number(agg.bonusCents) / 100),
  };
}

function styleSectorRow(row: ExcelJS.Row): void {
  row.font = { italic: true, color: { argb: "FF71717A" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF4F4F5" },
  };
}

export async function buildAnalyticsXlsx(
  session: AppSession,
  dateFrom: Date,
  dateTo: Date,
  platformFilter?: string,
): Promise<Buffer> {
  if (session.kind !== "tenant" || !session.tid) {
    throw new Error("UNAUTHORIZED");
  }

  const t = await getExportTranslator(session);
  const sectorLabel = t("analitica.sectorAvg");
  const companyTotalLabel = t("analitica.companyTotal");

  const rangeEnd = dateTo;

  const scope = await resolveCompanyScopeForSession({
    ...session,
    kind: "tenant",
    tid: session.tid,
  });

  const ridePlatform = parsePlatform(platformFilter);
  const analyticsSettings = await getTenantAnalyticsSettings(session.tid);

  const trips = await withTenant(session.tid, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId: session.tid,
        liquidationStatus: "closed",
        startedAt: { gte: dateFrom, lte: rangeEnd },
        ...(ridePlatform ? { platform: ridePlatform } : {}),
        driver: driverWhere(scope),
      },
      select: {
        driverId: true,
        startedAt: true,
        endedAt: true,
        grossAmountCents: true,
        platformFeeCents: true,
        tipCents: true,
        platformBonusCents: true,
        driver: { select: { fullName: true } },
      },
    }),
  );

  const byDriver = new Map<string, DriverAgg>();

  for (const trip of trips) {
    let row = byDriver.get(trip.driverId);
    if (!row) {
      row = {
        fullName: trip.driver.fullName,
        grossCents: BigInt(0),
        feeCents: BigInt(0),
        tipCents: BigInt(0),
        bonusCents: BigInt(0),
        count: 0,
        shiftDays: new Set(),
        totalDurationMs: 0,
      };
      byDriver.set(trip.driverId, row);
    }
    row.count += 1;
    row.grossCents += trip.grossAmountCents ?? BigInt(0);
    row.feeCents += trip.platformFeeCents ?? BigInt(0);
    row.tipCents += trip.tipCents ?? BigInt(0);
    row.bonusCents += trip.platformBonusCents ?? BigInt(0);
    row.shiftDays.add(dayKey(trip.startedAt));
    const end = trip.endedAt ?? trip.startedAt;
    row.totalDurationMs += Math.max(0, end.getTime() - trip.startedAt.getTime());
  }

  const driverRows = [...byDriver.values()]
    .map(driverMetricsFromAgg)
    .sort((a, b) => b.facturacion - a.facturacion);

  const sectorAvg = await getSectorDriverAveragesForPlatform(
    session.tid,
    tenantCalendarDateFromInstant(dateFrom),
    tenantCalendarDateFromInstant(dateTo),
    {
    viewerOptedIn: analyticsSettings.sectorBenchmarkOptIn,
    platform: platformFilter,
  });

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(t("exports.sheets.analytics"));
  sheet.columns = [
    { header: t("analitica.columns.conductor"), key: "conductor", width: 28 },
    { header: t("exports.analytics.facturacionHeader"), key: "facturacion", width: 14 },
    { header: t("exports.analytics.comisionesHeader"), key: "comisiones", width: 14 },
    { header: t("analitica.columns.viajes"), key: "viajes", width: 10 },
    { header: t("analitica.columns.turnos"), key: "turnos", width: 10 },
    { header: t("exports.analytics.mediaTurnoHeader"), key: "mediaTurno", width: 14 },
    { header: t("exports.analytics.eurHoraHeader"), key: "eurHora", width: 10 },
    { header: t("exports.analytics.propinasHeader"), key: "propinas", width: 12 },
    { header: t("exports.analytics.primasHeader"), key: "primas", width: 12 },
  ];

  sheet.getRow(1).font = { bold: true };

  for (const row of driverRows) {
    sheet.addRow(row);
    if (sectorAvg) {
      const sectorRow = sheet.addRow({
        conductor: sectorLabel,
        facturacion: sectorAvg.facturacion,
        comisiones: sectorAvg.comisiones,
        viajes: sectorAvg.viajes,
        turnos: sectorAvg.turnos,
        mediaTurno: sectorAvg.mediaTurno,
        eurHora: sectorAvg.eurHora,
        propinas: sectorAvg.propinas,
        primas: sectorAvg.primas,
      });
      styleSectorRow(sectorRow);
    }
  }

  if (driverRows.length > 0 && sectorAvg) {
    const totals = driverRows.reduce(
      (acc, r) => ({
        facturacion: acc.facturacion + r.facturacion,
        comisiones: acc.comisiones + r.comisiones,
        viajes: acc.viajes + r.viajes,
        turnos: acc.turnos + r.turnos,
        propinas: acc.propinas + r.propinas,
        primas: acc.primas + r.primas,
      }),
      {
        facturacion: 0,
        comisiones: 0,
        viajes: 0,
        turnos: 0,
        propinas: 0,
        primas: 0,
      },
    );
    const totalHours = driverRows.reduce((s, r) => {
      if (r.eurHora <= 0) return s;
      return s + r.facturacion / r.eurHora;
    }, 0);
    const totalRow = sheet.addRow({
      conductor: companyTotalLabel,
      facturacion: totals.facturacion,
      comisiones: totals.comisiones,
      viajes: totals.viajes,
      turnos: totals.turnos,
      mediaTurno: totals.turnos > 0 ? Math.round(totals.facturacion / totals.turnos) : 0,
      eurHora: totalHours >= 0.5 ? Math.round((totals.facturacion / totalHours) * 100) / 100 : 0,
      propinas: totals.propinas,
      primas: totals.primas,
    });
    totalRow.font = { bold: true };
    const sectorTotalRow = sheet.addRow({
      conductor: sectorLabel,
      facturacion: sectorAvg.facturacion,
      comisiones: sectorAvg.comisiones,
      viajes: sectorAvg.viajes,
      turnos: sectorAvg.turnos,
      mediaTurno: sectorAvg.mediaTurno,
      eurHora: sectorAvg.eurHora,
      propinas: sectorAvg.propinas,
      primas: sectorAvg.primas,
    });
    styleSectorRow(sectorTotalRow);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
