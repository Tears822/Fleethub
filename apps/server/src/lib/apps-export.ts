import ExcelJS from "exceljs";
import {
  acceptanceFromOffers,
  classifyAppsProductivity,
  computeFleetDayAveragesFromMetrics,
  estimateAcceptanceRate,
  type AppsProductivityMetrics,
} from "@fleethub/auth";
import type { ProductivityThresholds } from "@fleethub/auth";
import type { AppSession } from "@fleethub/auth";
import { driverWhere, resolveCompanyScopeForSession } from "@fleethub/auth/tenant-scope";
import { resolveEurPerHourFromConnectedMinutes } from "@fleethub/auth/eur-per-hour";
import { tripDurationMs } from "@fleethub/auth/driver-productivity";
import { RidePlatform, withTenant } from "@fleethub/db";
import { productivityExportLabel } from "./export-labels.js";
import { getExportTranslator } from "./export-translator.js";

const RIDE_PLATFORMS = new Set<string>(Object.values(RidePlatform));

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function parsePlatformFilter(raw: string | undefined): RidePlatform | undefined {
  if (!raw) return undefined;
  const upper = raw.toUpperCase();
  return RIDE_PLATFORMS.has(upper) ? (upper as RidePlatform) : undefined;
}

export async function buildAppsUsageXlsx(
  session: AppSession,
  thresholds: ProductivityThresholds,
  platformFilter?: string,
): Promise<Buffer> {
  if (session.kind !== "tenant" || !session.tid) {
    throw new Error("UNAUTHORIZED");
  }

  const t = await getExportTranslator(session);

  const platform = parsePlatformFilter(platformFilter);

  const scope = await resolveCompanyScopeForSession({
    ...session,
    kind: "tenant",
    tid: session.tid,
  });

  const from = startOfTodayUtc();
  const [trips, dayMetrics] = await Promise.all([
    withTenant(session.tid, (tx) =>
      tx.trip.findMany({
        where: {
          tenantId: session.tid,
          startedAt: { gte: from },
          ...(platform ? { platform } : {}),
          driver: driverWhere(scope),
        },
        select: {
          driverId: true,
          platform: true,
          startedAt: true,
          endedAt: true,
          grossAmountCents: true,
          netAmountCents: true,
          driver: { select: { fullName: true, company: { select: { legalName: true } } } },
        },
      }),
    ),
    withTenant(session.tid, (tx) =>
      tx.driverPlatformDayMetric.findMany({
        where: {
          tenantId: session.tid,
          day: { gte: from },
          ...(platform ? { platform } : {}),
          driver: driverWhere(scope),
        },
        select: {
          driverId: true,
          platform: true,
          hoursOnlineMinutes: true,
          missedOffers: true,
          rejectedTrips: true,
        },
      }),
    ),
  ]);

  const metricsByDriverPlatform = new Map(
    dayMetrics.map((m) => [`${m.driverId}:${m.platform}`, m] as const),
  );

  type Row = {
    conductor: string;
    empresa: string;
    plataforma: string;
    viajes: number;
    bruto: number;
    horas: number;
    eurH: number;
    aceptacion: number;
    aceptacionEst: boolean;
    productividad: string;
  };

  const buckets = new Map<
    string,
    {
      row: Omit<Row, "viajes" | "bruto" | "horas" | "eurH" | "aceptacion" | "aceptacionEst" | "productividad">;
      ms: number;
      gross: bigint;
      count: number;
      driverId: string;
      platform: RidePlatform;
    }
  >();

  for (const trip of trips) {
    const key = `${trip.driverId}:${trip.platform}`;
    let b = buckets.get(key);
    if (!b) {
      b = {
        driverId: trip.driverId,
        platform: trip.platform,
        row: {
          conductor: trip.driver.fullName,
          empresa: trip.driver.company.legalName,
          plataforma: trip.platform,
        },
        ms: 0,
        gross: BigInt(0),
        count: 0,
      };
      buckets.set(key, b);
    }
    b.count += 1;
    const gross = trip.grossAmountCents ?? trip.netAmountCents ?? BigInt(0);
    b.gross += gross > BigInt(0) ? gross : (trip.netAmountCents ?? BigInt(0));
    b.ms += tripDurationMs(trip.startedAt, trip.endedAt);
  }

  const productivityMetrics: AppsProductivityMetrics[] = [];
  const baseRows: Row[] = [];

  for (const b of buckets.values()) {
    const stored = metricsByDriverPlatform.get(`${b.driverId}:${b.platform}`);
    const tripHoursMs = b.ms;
    const storedHoursMs =
      stored != null && stored.hoursOnlineMinutes > 0
        ? stored.hoursOnlineMinutes * 60_000
        : 0;
    const hoursMs = Math.max(tripHoursMs, storedHoursMs);
    const connectedMinutes = Math.round(hoursMs / 60_000);
    const hours = hoursMs / 3_600_000;
    const horasDecimal = Math.round(hours * 10) / 10;
    const bruto = Number(b.gross) / 100;
    const eurPerHour = resolveEurPerHourFromConnectedMinutes(b.gross, connectedMinutes);
    const platformOffersKnown =
      stored != null && (stored.missedOffers > 0 || stored.rejectedTrips > 0);
    const acc = platformOffersKnown
      ? (acceptanceFromOffers(b.count, stored!.missedOffers, stored!.rejectedTrips) ??
        estimateAcceptanceRate(b.count))
      : estimateAcceptanceRate(b.count);

    productivityMetrics.push({
      facturacionEur: bruto,
      horasDecimal,
      eurPerHour,
      aceptacionPct: acc,
      viajes: b.count,
    });

    baseRows.push({
      ...b.row,
      viajes: b.count,
      bruto,
      horas: horasDecimal,
      eurH: eurPerHour,
      aceptacion: acc,
      aceptacionEst: !platformOffersKnown,
      productividad: "",
    });
  }

  const fleetDayAverages = computeFleetDayAveragesFromMetrics(productivityMetrics);

  const rows: Row[] = baseRows.map((row, i) => {
    const m = productivityMetrics[i]!;
    const label = classifyAppsProductivity(
      m.eurPerHour,
      m.aceptacionPct,
      thresholds,
      fleetDayAverages,
    );
    return { ...row, productividad: productivityExportLabel(t, label) };
  });

  rows.sort((a, b) => a.conductor.localeCompare(b.conductor, "es"));

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet(t("exports.sheets.appsToday"));
  sheet.columns = [
    { header: t("apps.columns.conductor"), key: "conductor", width: 28 },
    { header: t("apps.columns.company"), key: "empresa", width: 22 },
    { header: t("apps.columns.platform"), key: "plataforma", width: 12 },
    { header: t("apps.columns.trips"), key: "viajes", width: 10 },
    { header: t("exports.columns.gross"), key: "bruto", width: 12 },
    { header: t("apps.columns.hours"), key: "horas", width: 10 },
    { header: t("apps.columns.eurPerHour"), key: "eurH", width: 10 },
    { header: t("exports.columns.acceptance"), key: "aceptacion", width: 14 },
    { header: t("apps.columns.productivity"), key: "productividad", width: 14 },
  ];
  for (const r of rows) {
    sheet.addRow({
      ...r,
      aceptacion: r.aceptacionEst
        ? t("exports.columns.acceptanceEstimated", { pct: r.aceptacion })
        : r.aceptacion,
    });
  }
  sheet.getRow(1).font = { bold: true };

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
