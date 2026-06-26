/**
 * Inspect Uber Payments Driver CSV (driver-level period summary).
 *
 * Usage:
 *   npm run inspect:uber-payments-csv -w @fleethub/worker -- path/to/file.csv
 *   npm run inspect:uber-payments-csv -w @fleethub/worker -- path/to/file.csv <driver-uuid>
 */
import fs from "node:fs";
import path from "node:path";
import { csvRowsToObjects, parseCsv } from "../lib/uber-csv.js";
import { filterPaymentsDriverRows } from "../lib/uber-payments-driver-mapper.js";

type Row = Record<string, string>;

const COL = {
  driverId: "UUID del conductor",
  firstName: "Nombre del conductor",
  lastName: "Apellido del conductor",
  paid: "Importe que se te ha pagado",
  earnings: "Importe que se te ha pagado : Tus ganancias",
  cash: "Importe que se te ha pagado : Saldo del viaje : Pagos : Efectivo cobrado",
  fare: "Importe que se te ha pagado : Tus ganancias : Precio",
  serviceFee: "Importe que se te ha pagado:Tus ganancias:Precio del servicio",
  tip: "Importe que se te ha pagado:Tus ganancias:Propina",
  bank: "Importe que se te ha pagado:Saldo del viaje:Pagos:Transferido a una cuenta bancaria",
} as const;

function parseEuro(raw: string | undefined): number | null {
  const s = raw?.trim();
  if (!s) return null;
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function summarizeRow(row: Row) {
  const fare = parseEuro(row[COL.fare]);
  const fee = parseEuro(row[COL.serviceFee]);
  const tip = parseEuro(row[COL.tip]) ?? 0;
  const paid = parseEuro(row[COL.paid]);
  const cash = parseEuro(row[COL.cash]);
  const impliedNet = fare != null && fee != null ? Math.round((fare + fee + tip) * 100) / 100 : null;

  return {
    name: `${row[COL.firstName] ?? ""} ${row[COL.lastName] ?? ""}`.trim(),
    driverId: row[COL.driverId] ?? "",
    paid,
    fare,
    feeAbs: fee != null ? Math.abs(fee) : null,
    tip,
    cash,
    impliedNet,
    delta: paid != null && impliedNet != null ? Math.round((paid - impliedNet) * 100) / 100 : null,
  };
}

async function main() {
  const fileArg = process.argv[2]?.trim();
  const driverFilter = process.argv[3]?.trim().toLowerCase();
  if (!fileArg) {
    console.error("Usage: inspect-uber-payments-csv <file.csv> [driver-uuid]");
    process.exit(1);
  }

  const filePath = path.resolve(fileArg);
  const text = fs.readFileSync(filePath, "utf8");
  const rows = csvRowsToObjects(parseCsv(text));
  if (rows.length === 0) {
    console.error("No data rows in CSV");
    process.exit(1);
  }

  const hasTripUuid = rows.some((r) =>
    Object.keys(r).some((k) => /uuid del viaje|trip uuid/i.test(k)),
  );

  console.log("=== Uber Payments Driver CSV ===");
  console.log("File:", filePath);
  console.log("Driver rows:", rows.length);
  console.log("Format:", hasTripUuid ? "trip-level (ingestible)" : "driver summary per period (NOT trip-level)");
  console.log("");

  let totalPaid = 0;
  let totalFee = 0;
  let totalTips = 0;

  for (const row of rows) {
    const s = summarizeRow(row);
    if (driverFilter && !s.driverId.toLowerCase().includes(driverFilter)) continue;
    if (s.paid != null) totalPaid += s.paid;
    if (s.feeAbs != null) totalFee += s.feeAbs;
    totalTips += s.tip ?? 0;

    console.log(
      [
        s.driverId.slice(0, 8),
        s.name,
        `paid ${s.paid ?? "—"} €`,
        `fare ${s.fare ?? "—"} €`,
        `fee ${s.feeAbs ?? "—"} €`,
        `tip ${s.tip ?? 0} €`,
        s.cash != null ? `cash ${s.cash} €` : null,
        s.delta != null && Math.abs(s.delta) > 0.02 ? `Δ ${s.delta} €` : null,
      ]
        .filter(Boolean)
        .join(" | "),
    );
  }

  console.log("");
  console.log("Totals (filtered): paid", totalPaid.toFixed(2), "€ | fees", totalFee.toFixed(2), "€ | tips", totalTips.toFixed(2), "€");

  if (!hasTripUuid) {
    console.log("");
    console.log("FleetHub trip sync needs Trip Activity (UUID del viaje) or trip-level Payments report.");
    console.log("This CSV is useful for driver-period reconciliation (Facturación / liquidación), not Cerrar turnos per trip.");
  }

  if (driverFilter) {
    const sample = rows.find((r) => (r[COL.driverId] ?? "").toLowerCase().includes(driverFilter));
    if (sample) {
      const from = new Date("2020-01-01");
      const to = new Date("2099-01-01");
      const trips = filterPaymentsDriverRows(rows, {
        driverId: sample[COL.driverId] ?? driverFilter,
        from,
        to,
      });
      console.log("");
      console.log("filterPaymentsDriverRows trips for driver:", trips.length);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
