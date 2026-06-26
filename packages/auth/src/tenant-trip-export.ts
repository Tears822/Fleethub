import { formatDateTimeEsInTenantTz } from "@fleethub/auth/display-timezone";
import type { Prisma } from "@prisma/client";
import { tenantTripWhere, type CompanyScope } from "./tenant-scope";

export const TRIP_EXPORT_SYNC_MAX = 10_000;
export const TRIP_EXPORT_BATCH_SIZE = 2_000;

export const TRIP_EXPORT_HEADERS = [
  "fecha_inicio",
  "conductor",
  "empresa",
  "plataforma",
  "tipo_tarifa",
  "importe_neto_eur",
  "estado",
] as const;

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function rowsToTripExportCsv(rows: string[][]): string {
  const lines = [
    TRIP_EXPORT_HEADERS.map(escapeCsvCell).join(","),
    ...rows.map((row) => row.map((c) => escapeCsvCell(c ?? "")).join(",")),
  ];
  return `${lines.join("\r\n")}\r\n`;
}

type TripExportRow = {
  startedAt: Date;
  driver: { fullName: string; company: { legalName: string } };
  platform: string;
  fareType: string | null;
  netAmountCents: bigint | null;
  liquidationStatus: string | null;
};

function tripToCsvRow(t: TripExportRow): string[] {
  return [
    formatDateTimeEsInTenantTz(t.startedAt),
    t.driver.fullName,
    t.driver.company.legalName,
    t.platform,
    t.fareType ?? "",
    t.netAmountCents != null ? (Number(t.netAmountCents) / 100).toFixed(2) : "",
    t.liquidationStatus ?? "",
  ];
}

const tripExportSelect = {
  startedAt: true,
  platform: true,
  fareType: true,
  netAmountCents: true,
  liquidationStatus: true,
  driver: { select: { fullName: true, company: { select: { legalName: true } } } },
} as const;

export async function countTenantTripsForExport(
  tx: Prisma.TransactionClient,
  tenantId: string,
  scope: CompanyScope,
): Promise<number> {
  return tx.trip.count({ where: tenantTripWhere(tenantId, scope) });
}

export async function buildTenantTripsExportCsv(
  tx: Prisma.TransactionClient,
  tenantId: string,
  scope: CompanyScope,
): Promise<string> {
  const where = tenantTripWhere(tenantId, scope);
  const rows: string[][] = [];
  let skip = 0;

  for (;;) {
    const batch = await tx.trip.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      skip,
      take: TRIP_EXPORT_BATCH_SIZE,
      select: tripExportSelect,
    });
    if (batch.length === 0) break;

    for (const t of batch) {
      rows.push(tripToCsvRow(t));
    }
    skip += batch.length;
    if (batch.length < TRIP_EXPORT_BATCH_SIZE) break;
  }

  return rowsToTripExportCsv(rows);
}

/** Cursor-based batch export for worker streaming to disk. */
export async function writeTenantTripsExportCsvToFile(
  tx: Prisma.TransactionClient,
  tenantId: string,
  scope: CompanyScope,
  filePath: string,
): Promise<number> {
  const fs = await import("node:fs/promises");
  const where = tenantTripWhere(tenantId, scope);

  await fs.writeFile(
    filePath,
    `${TRIP_EXPORT_HEADERS.map(escapeCsvCell).join(",")}\r\n`,
    "utf8",
  );

  let rowCount = 0;
  let skip = 0;

  for (;;) {
    const batch = await tx.trip.findMany({
      where,
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      skip,
      take: TRIP_EXPORT_BATCH_SIZE,
      select: tripExportSelect,
    });
    if (batch.length === 0) break;

    const chunk =
      batch.map((t) => tripToCsvRow(t).map(escapeCsvCell).join(",")).join("\r\n") + "\r\n";
    await fs.appendFile(filePath, chunk, "utf8");
    rowCount += batch.length;
    skip += batch.length;
    if (batch.length < TRIP_EXPORT_BATCH_SIZE) break;
  }

  return rowCount;
}
