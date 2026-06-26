import type { NormalizedTripUpsert } from "@fleethub/contracts";
import { isT3Fare } from "@fleethub/auth/shift-liquidation";
import {
  type UberCsvRow,
  parseEuroAmount,
  pickColumn,
} from "./uber-csv-columns.js";

export type UberTripActivityRow = UberCsvRow;

function mapActivityProductFareType(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (isT3Fare(v)) return v;
  const lower = v.toLowerCase();
  // Trip Activity uses generic "Taxi" — Payments Order distinguishes T3 vs taxímetro.
  if (lower === "taxi" || lower === "uber") return null;
  return v;
}

function parseDateTime(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** Map Trip Activity CSV row → trip upsert (completed trips only). */
export function uberTripActivityToUpsert(row: UberTripActivityRow): NormalizedTripUpsert | null {
  const tripId = pickColumn(row, [
    "Trip UUID",
    "trip_uuid",
    "Trip ID",
    "UUID del viaje",
    "UUID de viaje",
    "ID del viaje",
  ]);
  if (!tripId) return null;

  const status = pickColumn(row, [
    "Trip Status",
    "Status",
    "Estado del viaje",
    "Estado",
  ]).toLowerCase();
  if (
    status &&
    status !== "completed" &&
    !status.includes("complete") &&
    status !== "completado" &&
    !status.includes("completad")
  ) {
    return null;
  }

  const startedAt =
    parseDateTime(
      pickColumn(row, [
        "Trip Request Time",
        "Trip Pickup Time",
        "Pickup Time",
        "Hora de la solicitud del viaje",
        "Hora de solicitud del viaje",
        "Fecha y hora de solicitud del viaje",
        "Hora de recogida del viaje",
        "Hora de recogida",
      ]),
    ) ??
    parseDateTime(
      pickColumn(row, [
        "Trip DropOff Time",
        "Dropoff Time",
        "Hora de llegada del viaje",
        "Hora de finalización del viaje",
        "Hora de finalizacion del viaje",
      ]),
    );
  if (!startedAt) return null;

  const endedAt =
    parseDateTime(
      pickColumn(row, [
        "Trip DropOff Time",
        "Dropoff Time",
        "Trip End Time",
        "Hora de llegada del viaje",
        "Hora de finalización del viaje",
        "Hora de finalizacion del viaje",
        "Hora de entrega",
      ]),
    ) ?? startedAt;

  const fareRaw = pickColumn(row, [
    "Fare",
    "Trip Fare",
    "Fare Amount",
    "Total Fare",
    "Earnings",
    "Net Fare",
    "Driver Earnings",
    "Tarifa",
    "Tarifa del viaje",
    "Importe",
    "Importe del viaje",
    "Ganancias",
    "Ganancias del conductor",
    "Importe que se te ha pagado : Tus ganancias : Precio",
  ]);
  const gross = parseEuroAmount(fareRaw);

  const paymentType = pickColumn(row, [
    "Payment Type",
    "Payment Method",
    "Tipo de pago",
    "Forma de pago",
  ]).toLowerCase();
  const paymentMethod =
    paymentType.includes("cash") || paymentType.includes("efectivo")
      ? "cash"
      : paymentType.includes("digital")
        ? "app"
        : "app";

  return {
    externalTripId: tripId,
    startedAt,
    endedAt,
    grossAmountCents: gross,
    platformFeeCents: null,
    tipCents: BigInt(0),
    tollCents: BigInt(0),
    netAmountCents: gross,
    paymentMethod,
    paymentValidated: true,
    fareType: mapActivityProductFareType(
      pickColumn(row, ["Product Type", "Service Type", "Tipo de producto", "Tipo de servicio"]),
    ),
  };
}

export function filterTripActivityRows(
  rows: UberTripActivityRow[],
  args: { driverId: string; from: Date; to: Date },
): NormalizedTripUpsert[] {
  const driverId = args.driverId.trim().toLowerCase();
  const fromMs = args.from.getTime();
  const toMs = args.to.getTime();
  const byTrip = new Map<string, NormalizedTripUpsert>();

  for (const row of rows) {
    const rowDriver = pickColumn(row, [
      "Driver UUID",
      "driver_uuid",
      "UUID del conductor",
      "UUID de conductor",
    ]).toLowerCase();
    if (rowDriver && rowDriver !== driverId) continue;

    const upsert = uberTripActivityToUpsert(row);
    if (!upsert) continue;

    const t = new Date(upsert.startedAt).getTime();
    if (t < fromMs || t > toMs) continue;

    byTrip.set(upsert.externalTripId, upsert);
  }

  return [...byTrip.values()];
}
