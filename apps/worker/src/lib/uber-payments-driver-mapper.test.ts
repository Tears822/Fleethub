import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { csvRowsToObjects, parseCsv } from "../lib/uber-csv.js";
import {
  filterPaymentsDriverRows,
  parsePaymentsDriverAmounts,
  paymentsDriverRowToUpsert,
  countTripsWithAmounts,
  tripsInWindowMissingAmounts,
} from "../lib/uber-payments-driver-mapper.js";
import { mergeUberDriverTripUpserts } from "../lib/uber-driver-mappers.js";
import { filterTripActivityRows } from "../lib/uber-trip-activity-mapper.js";
import { uberPaymentsToTripUpserts } from "../lib/uber-payments-mapper.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tripPaymentsCsv = fs.readFileSync(
  path.join(__dirname, "../../fixtures/uber-payments-driver-trip-sample.csv"),
  "utf8",
);

describe("parsePaymentsDriverAmounts", () => {
  it("parses Spanish fare, fee, tip and cash columns", () => {
    const rows = csvRowsToObjects(parseCsv(tripPaymentsCsv));
    const amounts = parsePaymentsDriverAmounts(rows[0]!);
    assert.equal(amounts.grossAmountCents, 1200n);
    assert.equal(amounts.platformFeeCents, 250n);
    assert.equal(amounts.netAmountCents, 950n);
    assert.equal(amounts.cashPaymentCents, 950n);
  });
});

describe("paymentsDriverRowToUpsert", () => {
  it("maps trip-level payments driver row with cash payment method", () => {
    const rows = csvRowsToObjects(parseCsv(tripPaymentsCsv));
    const upsert = paymentsDriverRowToUpsert(rows[0]!);
    assert.equal(upsert?.externalTripId, "a1111111-1111-4111-8111-111111111111");
    assert.equal(upsert?.grossAmountCents, 1200n);
    assert.equal(upsert?.netAmountCents, 950n);
    assert.equal(upsert?.paymentMethod, "cash");
  });

  it("sets appPaymentCents for digital/app payment rows", () => {
    const upsert = paymentsDriverRowToUpsert({
      "UUID del viaje": "trip-order-app-1",
      "UUID del conductor": "driver-1",
      "Trip DropOff Time": "2026-06-08T18:30:00Z",
      "Tipo de pago": "App",
      Fare: "16.65",
      "Service Fee": "-2.00",
      "Net Fare": "14.65",
    });
    assert.ok(upsert);
    assert.equal(upsert?.paymentMethod, "app");
    assert.equal(upsert?.netAmountCents, 1465n);
    assert.equal(upsert?.appPaymentCents, 1465n);
    assert.equal(upsert?.cashPaymentCents, null);
  });

  it("maps payments order row using en comparación con los informes timestamp", () => {
    const upsert = paymentsDriverRowToUpsert({
      "UUID del viaje": "trip-order-1",
      "UUID del conductor": "driver-1",
      "en comparación con los informes": "2026-06-02 00:43:09.175 +0200 CEST",
      "Importe que se te ha pagado : Tus ganancias : Precio": "13.55",
      "Importe que se te ha pagado:Tus ganancias:Precio:Precio": "13.55",
      "Importe que se te ha pagado:Tus ganancias:Precio del servicio": "-1.63",
      "Importe que se te ha pagado": "11.92",
    });
    assert.ok(upsert);
    assert.equal(upsert?.grossAmountCents, 1355n);
    assert.equal(upsert?.netAmountCents, 1192n);
    assert.equal(upsert?.fareType, "Precio cerrado (T3)");
  });

  it("uses parent Precio column when Precio:Precio is a sub-component", () => {
    const upsert = paymentsDriverRowToUpsert({
      "UUID del viaje": "trip-airport-1",
      "UUID del conductor": "driver-1",
      "Trip DropOff Time": "2026-06-16T14:35:37Z",
      "Importe que se te ha pagado : Tus ganancias : Precio": "40.80",
      "Importe que se te ha pagado:Tus ganancias:Precio:Precio": "36.20",
      "Importe que se te ha pagado:Tus ganancias:Precio:Recargo de aeropuerto": "4.60",
      "Importe que se te ha pagado:Tus ganancias:Precio del servicio": "-4.90",
      "Importe que se te ha pagado": "35.90",
    });
    assert.equal(upsert?.grossAmountCents, 4080n);
    assert.equal(upsert?.netAmountCents, 3590n);
  });

  it("sets fareType from Precio vs Taxímetro columns", () => {
    const t3 = paymentsDriverRowToUpsert({
      "UUID del viaje": "trip-t3-1",
      "UUID del conductor": "driver-1",
      "Trip DropOff Time": "2026-06-08T18:30:00Z",
      "Importe que se te ha pagado:Tus ganancias:Precio:Precio": "16.65",
      "Importe que se te ha pagado:Tus ganancias:Precio del servicio": "-2.00",
    });
    assert.equal(t3?.fareType, "Precio cerrado (T3)");

    const meter = paymentsDriverRowToUpsert({
      "UUID del viaje": "trip-meter-1",
      "UUID del conductor": "driver-1",
      "Trip DropOff Time": "2026-06-08T19:30:00Z",
      "Importe que se te ha pagado:Tus ganancias:Precio:Taxímetro": "29.64",
      "Importe que se te ha pagado:Tus ganancias:Precio del servicio": "-3.00",
    });
    assert.equal(meter?.fareType, "Taxímetro");
  });
});

describe("filterPaymentsDriverRows", () => {
  it("filters by driver and date window", () => {
    const rows = csvRowsToObjects(parseCsv(tripPaymentsCsv));
    const trips = filterPaymentsDriverRows(rows, {
      driverId: "d2222222-2222-4222-8222-222222222222",
      from: new Date("2026-06-08T00:00:00Z"),
      to: new Date("2026-06-08T23:59:59Z"),
    });
    assert.equal(trips.length, 2);
  });

  it("keeps late tip payment-order row separate from fare trip (liquidación día pago)", () => {
    const tripId = "bd6ea1df-a893-44a2-a674-e79c8d270e05";
    const driverId = "c4b25553-43f1-40e7-8e41-5d3c69df62bc";
    const fareRow = {
      "UUID del viaje": tripId,
      "UUID del conductor": driverId,
      "Trip DropOff Time": "2026-06-16T14:35:37Z",
      "Importe que se te ha pagado : Tus ganancias : Precio": "40.80",
      "Importe que se te ha pagado:Tus ganancias:Precio:Precio": "36.20",
      "Importe que se te ha pagado:Tus ganancias:Precio del servicio": "-5.00",
      "Importe que se te ha pagado": "35.80",
    };
    const tipRow = {
      "UUID del viaje": tripId,
      "UUID del conductor": driverId,
      "en comparación con los informes": "2026-06-18 14:35:37.000 +0200 CEST",
      "Importe que se te ha pagado:Tus ganancias:Propina": "2.00",
      "Importe que se te ha pagado": "2.00",
    };
    const trips = filterPaymentsDriverRows([fareRow, tipRow], {
      driverId,
      from: new Date("2026-06-16T00:00:00Z"),
      to: new Date("2026-06-18T23:59:59Z"),
    });
    assert.equal(trips.length, 2);
    const fare = trips.find((t) => !t.externalTripId.includes("::tip::"));
    const tip = trips.find((t) => t.externalTripId.includes("::tip::"));
    assert.equal(fare?.grossAmountCents, 4080n);
    assert.equal(fare?.tipCents, 0n);
    assert.equal(tip?.grossAmountCents, null);
    assert.equal(tip?.tipCents, 200n);
    assert.ok(tip?.externalTripId.includes("::tip::2026-06-18"));
  });
});

describe("tripsInWindowMissingAmounts", () => {
  it("returns true when a trip in the window has no amounts even if other days have amounts", () => {
    const trips = [
      {
        externalTripId: "trip-old",
        startedAt: "2026-06-15T10:00:00Z",
        endedAt: "2026-06-15T10:30:00Z",
        grossAmountCents: 1500n,
        netAmountCents: 1200n,
        platformFeeCents: 300n,
        tipCents: 0n,
        tollCents: 0n,
        paymentMethod: "app",
        paymentValidated: true,
        fareType: "Taxi",
      },
      {
        externalTripId: "trip-new",
        startedAt: "2026-06-16T08:04:00Z",
        endedAt: "2026-06-16T08:24:00Z",
        grossAmountCents: null,
        netAmountCents: null,
        platformFeeCents: null,
        tipCents: 0n,
        tollCents: 0n,
        paymentMethod: "app",
        paymentValidated: true,
        fareType: "Taxi",
      },
    ];
    const from = new Date("2026-06-16T00:00:00Z");
    const to = new Date("2026-06-16T23:59:59Z");
    assert.equal(tripsInWindowMissingAmounts(trips, from, to), true);
    assert.equal(countTripsWithAmounts(trips) > 0, true);
  });
});

describe("mergeUberDriverTripUpserts", () => {
  it("enriches activity trips with payments report amounts", () => {
    const activityRows = [
      {
        "UUID del viaje": "a1111111-1111-4111-8111-111111111111",
        "UUID del conductor": "d2222222-2222-4222-8222-222222222222",
        "Hora de la solicitud del viaje": "2026-06-08T18:00:00Z",
        "Hora de llegada del viaje": "2026-06-08T18:30:00Z",
        "Estado del viaje": "completado",
        "Tipo de pago": "Efectivo",
      },
    ];
    const paymentRows = csvRowsToObjects(parseCsv(tripPaymentsCsv)).map((row) =>
      row["UUID del viaje"] === "a1111111-1111-4111-8111-111111111111"
        ? {
            ...row,
            "Importe que se te ha pagado:Tus ganancias:Precio:Precio": "12.00",
          }
        : row,
    );
    const activityTrips = filterTripActivityRows(activityRows, {
      driverId: "d2222222-2222-4222-8222-222222222222",
      from: new Date("2026-06-08T00:00:00Z"),
      to: new Date("2026-06-08T23:59:59Z"),
    });
    const paymentTrips = filterPaymentsDriverRows(paymentRows, {
      driverId: "d2222222-2222-4222-8222-222222222222",
      from: new Date("2026-06-08T00:00:00Z"),
      to: new Date("2026-06-08T23:59:59Z"),
    });
    const paymentTrip = paymentTrips.find(
      (t) => t.externalTripId === "a1111111-1111-4111-8111-111111111111",
    );
    assert.equal(paymentTrip?.fareType, "Precio cerrado (T3)");
    const merged = mergeUberDriverTripUpserts(activityTrips, paymentTrips);
    assert.equal(merged[0]?.grossAmountCents, 1200n);
    assert.equal(merged[0]?.netAmountCents, 950n);
    assert.equal(merged[0]?.fareType, "Precio cerrado (T3)");
  });

  it("keeps existing amounts when a later source has null economics", () => {
    const withAmounts = {
      externalTripId: "trip-1",
      startedAt: "2026-06-16T08:00:00Z",
      endedAt: "2026-06-16T08:30:00Z",
      grossAmountCents: 2000n,
      netAmountCents: 1700n,
      platformFeeCents: 300n,
      tipCents: 0n,
      tollCents: 0n,
      paymentMethod: "app",
      paymentValidated: true,
      fareType: "Taxi",
    };
    const activityOnly = {
      ...withAmounts,
      grossAmountCents: null,
      netAmountCents: null,
      platformFeeCents: null,
    };
    const merged = mergeUberDriverTripUpserts([withAmounts], [activityOnly]);
    assert.equal(merged[0]?.grossAmountCents, 2000n);
    assert.equal(merged[0]?.netAmountCents, 1700n);
  });
});

describe("uberPaymentsToTripUpserts", () => {
  it("aggregates fare and service fee rows for the same trip", () => {
    const upserts = uberPaymentsToTripUpserts([
      { trip_id: "trip-1", amount: 15.5, category: "fare", event_time: 100 },
      { trip_id: "trip-1", amount: -2.5, category: "service_fee", event_time: 101 },
      { trip_id: "trip-1", amount: 1.0, category: "tip", event_time: 102 },
    ]);
    assert.equal(upserts.length, 1);
    assert.equal(upserts[0]?.grossAmountCents, 1550n);
    assert.equal(upserts[0]?.platformFeeCents, 250n);
    assert.equal(upserts[0]?.tipCents, 100n);
  });
});
