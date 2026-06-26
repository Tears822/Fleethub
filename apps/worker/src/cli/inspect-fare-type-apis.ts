/**
 * Probe live APIs for taxímetro vs T3 (precio cerrado) per trip.
 *
 * Usage:
 *   npx tsx src/cli/inspect-fare-type-apis.ts [days]
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import {
  freenowEarningsNumberOfTours,
  getFreenowAccessToken,
  getFreenowCompanyEarnings,
  getFreenowDriverEarnings,
  listFreenowCompanyDrivers,
  freenowPublicDriverId,
  freenowDriverDisplayName,
} from "../lib/freenow-client.js";
import { freenowEnvReady } from "../lib/freenow-env.js";
import { mapFreenowFareType } from "../lib/freenow-fare-type.js";
import { isT3Fare } from "@fleethub/auth/shift-liquidation";
import { resolveUberOrgId } from "../lib/uber-fleet-client.js";
import {
  fetchUberPaymentsOrderRows,
  fetchUberTripActivityRows,
} from "../lib/uber-reports.js";
import { pickColumn } from "../lib/uber-csv-columns.js";
import { paymentsDriverReportIsTripLevel } from "../lib/uber-csv-columns.js";
import { mapUberFareTypeFromLabel } from "../lib/uber-fare-type.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const days = Math.max(1, Number(process.argv[2] ?? "7") || 7);
const FREENOW_COMPANY = process.env.FREENOW_PUBLIC_COMPANY_ID?.trim() || "GEYTMOBQGE";

const PRECIO_COLS = [
  "Importe que se te ha pagado:Tus ganancias:Precio:Precio",
  "Importe que se te ha pagado : Tus ganancias : Precio",
];
const TAXIMETRO_COLS = [
  "Importe que se te ha pagado:Tus ganancias:Precio:Taxímetro",
  "Importe que se te ha pagado:Tus ganancias:Precio:Taximetro",
];
const PRODUCT_COLS = [
  "Product Type",
  "Service Type",
  "Tipo de producto",
  "Tipo de servicio",
];

function parseEuro(raw: string): number {
  const s = raw?.trim();
  if (!s) return 0;
  const n = Number.parseFloat(s.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function deriveUberFareFromPaymentRow(row: Record<string, string>): {
  precio: number;
  taximetro: number;
  product: string;
  inferred: string;
} {
  const precio = PRECIO_COLS.reduce((v, c) => v || parseEuro(row[c] ?? ""), 0);
  const taximetro = TAXIMETRO_COLS.reduce((v, c) => v || parseEuro(row[c] ?? ""), 0);
  const product = PRODUCT_COLS.map((c) => row[c]?.trim()).find(Boolean) ?? "";
  let inferred = "unknown";
  if (taximetro > 0 && precio <= 0) inferred = "Taxímetro";
  else if (precio > 0 && taximetro <= 0) inferred = "Precio cerrado (T3)";
  else if (precio > 0 && taximetro > 0) inferred = "mixed (precio+taxímetro)";
  else if (product) inferred = mapUberFareTypeFromLabel(product);
  return { precio, taximetro, product, inferred };
}

async function probeFreenow(from: Date, to: Date) {
  console.log("\n========== FreeNow ==========");
  const token = await getFreenowAccessToken(true);
  if (!token.ok) {
    console.log("SKIP: token failed —", token.message);
    return;
  }

  const bookings = await listFreenowCompanyBookings({
    publicCompanyId: FREENOW_COMPANY,
    from,
    to,
  });
  if (!bookings.ok) {
    console.log("getCompanyBookings FAILED:", bookings.message);
    return;
  }

  const acc = bookings.bookings.filter((b) => b.state === "ACCOMPLISHED");
  const hail = new Map<string, number>();
  const mappedFare = new Map<string, number>();
  let t3Count = 0;
  let withComparisonBase = 0;
  const allKeys = new Set<string>();

  for (const b of acc) {
    for (const k of Object.keys(b as object)) allKeys.add(k);
    const h = b.hailingType ?? "(null)";
    hail.set(h, (hail.get(h) ?? 0) + 1);
    if (b.tourValue?.comparisonBaseFare != null) withComparisonBase += 1;
    const raw = b as { subFleetTypeId?: string | null; fixedFare?: boolean | null };
    const ft =
      mapFreenowFareType(
        b.hailingType,
        b.subFleetTypeLabel,
        raw.subFleetTypeId,
        raw.fixedFare,
      ) ?? "(null)";
    mappedFare.set(ft, (mappedFare.get(ft) ?? 0) + 1);
    if (isT3Fare(ft)) t3Count += 1;
  }

  console.log("Bookings ACCOMPLISHED:", acc.length);
  console.log("Booking fields:", [...allKeys].sort().join(", "));
  console.log("hailingType distribution:", Object.fromEntries(hail));
  console.log("subFleetTypeLabel present:", acc.filter((b) => b.subFleetTypeLabel?.trim()).length);
  console.log("comparisonBaseFare present:", withComparisonBase);
  console.log("Mapped fareType (our mapper):", Object.fromEntries(mappedFare));
  console.log("Would classify as T3:", t3Count, "/", acc.length);

  const companyEarn = await getFreenowCompanyEarnings({
    publicCompanyId: FREENOW_COMPANY,
    from,
    to,
  });
  if (companyEarn.ok) {
    const tours = companyEarn.data.grossValues?.tours;
    console.log("\nCompany earnings — tours breakdown (aggregate €, not per trip):");
    console.log(
      JSON.stringify(
        {
          numberOfTours: tours?.numberOfTours ?? freenowEarningsNumberOfTours(companyEarn.data),
          metered: tours?.metered,
          nonMetered: tours?.nonMetered,
          total: tours?.total,
          paidByApp: tours?.paidByApp,
          nonAppPayments: tours?.nonAppPayments,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("getCompanyEarnings FAILED:", companyEarn.message);
  }

  const drivers = await listFreenowCompanyDrivers(FREENOW_COMPANY, {
    page: 0,
    size: 5,
    status: "ACTIVE",
  });
  if (!drivers.ok) {
    console.log("list drivers FAILED:", drivers.message);
    return;
  }

  console.log("\nDriver earnings sample (first 3 active drivers with tours in window):");
  let shown = 0;
  for (const d of drivers.page.drivers) {
    if (shown >= 3) break;
    const pub = freenowPublicDriverId(d);
    if (!pub) continue;
    const earn = await getFreenowDriverEarnings({
      publicCompanyId: FREENOW_COMPANY,
      publicDriverId: pub,
      from,
      to,
    });
    if (!earn.ok) continue;
    const tours = earn.data.grossValues?.tours;
    const n = tours?.numberOfTours ?? freenowEarningsNumberOfTours(earn.data);
    if (n <= 0) continue;
    shown += 1;
    console.log(`\n• ${freenowDriverDisplayName(d)} (${pub})`);
    console.log(
      "  tours:",
      JSON.stringify({
        numberOfTours: n,
        metered: tours?.metered,
        nonMetered: tours?.nonMetered,
        total: tours?.total,
      }),
    );
    const driverBookings = acc.filter((b) => b.driver?.id?.trim() === pub);
    console.log("  bookings in same window:", driverBookings.length, "(no per-booking meter flag)");
  }
}

async function probeUber(from: Date, to: Date) {
  console.log("\n========== Uber ==========");
  const org = await resolveUberOrgId();
  if (!org.ok) {
    console.log("SKIP:", org.message);
    return;
  }

  const [activity, payments] = await Promise.all([
    fetchUberTripActivityRows(org.data, from, to),
    fetchUberPaymentsOrderRows(org.data, from, to),
  ]);

  console.log(
    "Trip Activity:",
    activity.ok ? `${activity.data.length} rows` : activity.message,
  );
  console.log(
    "Payments Order:",
    payments.ok
      ? `${payments.data.length} rows, trip-level=${paymentsDriverReportIsTripLevel(payments.data)}`
      : payments.message,
  );

  if (activity.ok && activity.data.length > 0) {
    const products = new Map<string, number>();
    for (const row of activity.data) {
      const p =
        pickColumn(row, PRODUCT_COLS) ||
        pickColumn(row, ["Trip Category", "Categoría del viaje"]) ||
        "(empty)";
      products.set(p, (products.get(p) ?? 0) + 1);
    }
    console.log("\nTrip Activity — product/service type values (top 15):");
    const sorted = [...products.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    for (const [k, n] of sorted) {
      const mapped = mapUberFareTypeFromLabel(k === "(empty)" ? null : k);
      console.log(`  ${n}x "${k}" → ${mapped}${isT3Fare(mapped) ? " [T3]" : ""}`);
    }
  }

  if (payments.ok && payments.data.length > 0) {
    const cols = Object.keys(payments.data[0] ?? {});
    const hasPrecio = cols.some((c) => /precio:precio/i.test(c));
    const hasTaximetro = cols.some((c) => /tax[ií]metro/i.test(c));
    console.log("\nPayments Order CSV columns for fare split:");
    console.log("  Has Precio:Precio column:", hasPrecio);
    console.log("  Has Taxímetro column:", hasTaximetro);
    console.log(
      "  Matching column names:",
      cols.filter((c) => /precio|tax[ií]metro|product|servicio/i.test(c)).join(" | ") || "(none)",
    );

    let withPrecio = 0;
    let withTaximetro = 0;
    let withBoth = 0;
    let t3Inferred = 0;
    let meterInferred = 0;
    const inferred = new Map<string, number>();

    for (const row of payments.data) {
      const d = deriveUberFareFromPaymentRow(row);
      if (d.precio > 0) withPrecio += 1;
      if (d.taximetro > 0) withTaximetro += 1;
      if (d.precio > 0 && d.taximetro > 0) withBoth += 1;
      inferred.set(d.inferred, (inferred.get(d.inferred) ?? 0) + 1);
      if (d.inferred.includes("T3") || isT3Fare(d.inferred)) t3Inferred += 1;
      if (d.inferred === "Taxímetro") meterInferred += 1;
    }

    console.log("\nPayments Order — per-row fare split (all rows):");
    console.log("  Rows with Precio > 0:", withPrecio);
    console.log("  Rows with Taxímetro > 0:", withTaximetro);
    console.log("  Rows with both:", withBoth);
    console.log("  Inferred types:", Object.fromEntries(inferred));

    const tripRows = payments.data.filter((r) =>
      /uuid del viaje|trip uuid/i.test(Object.keys(r).join("\n") + pickColumn(r, ["UUID del viaje", "Trip UUID"])),
    );
    const sampleTrips = tripRows.slice(0, 5);
    if (sampleTrips.length > 0) {
      console.log("\nSample trip payment rows:");
      for (const row of sampleTrips) {
        const tripId = pickColumn(row, ["UUID del viaje", "Trip UUID", "trip_uuid"]);
        const d = deriveUberFareFromPaymentRow(row);
        console.log(
          `  ${tripId?.slice(0, 8)}… product="${d.product || "—"}" precio=${d.precio} taxímetro=${d.taximetro} → ${d.inferred}`,
        );
      }
    }
  }
}

async function main() {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  console.log("=== Fare type API probe ===");
  console.log("Window:", from.toISOString().slice(0, 10), "→", to.toISOString().slice(0, 10), `(${days}d)`);

  if (freenowEnvReady().ok) {
    await probeFreenow(from, to);
  } else {
    console.log("\nFreeNow: SKIP (missing credentials)");
  }

  await probeUber(from, to);

  console.log("\n========== Conclusion ==========");
  console.log(
    "• Uber: check Payments Order Precio vs Taxímetro columns + Trip Activity product type.",
  );
  console.log(
    "• FreeNow: bookings API lacks per-trip meter flag; earnings API has metered/nonMetered totals only.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
