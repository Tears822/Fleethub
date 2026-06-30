import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeLiquidationSummary,
  preferMergedFareType,
  resolveTripFeeCents,
  tripTaximetroCents,
} from "./shift-liquidation.js";

const baseTrip = {
  id: "t1",
  startedAt: new Date("2026-05-01T10:00:00Z"),
  endedAt: new Date("2026-05-01T11:00:00Z"),
  fareType: "meter",
  grossAmountCents: BigInt(10_000),
  netAmountCents: BigInt(8_000),
  platformFeeCents: BigInt(2_000),
  tipCents: BigInt(500),
  platformBonusCents: BigInt(1_000),
  tollCents: BigInt(200),
  paymentMethod: "cash",
  paymentValidated: true,
};

describe("resolveTripFeeCents", () => {
  it("infers fee from gross and net when platformFeeCents is missing", () => {
    assert.equal(
      resolveTripFeeCents({
        grossAmountCents: 1290n,
        netAmountCents: 1161n,
        platformFeeCents: null,
        tipCents: 0n,
      }),
      129n,
    );
  });

  it("uses gross − net when tips are not subtracted from net", () => {
    assert.equal(
      resolveTripFeeCents({
        grossAmountCents: 1000n,
        netAmountCents: 900n,
        platformFeeCents: null,
        tipCents: 50n,
      }),
      50n,
    );
  });
});

describe("computeLiquidationSummary", () => {
  it("splits primas per driverBonusSharePct and adds to settlement", () => {
    const summary = computeLiquidationSummary([baseTrip], {
      driverSharePct: 50,
      driverBonusSharePct: 60,
    });

    assert.equal(summary.bonusCents, 1000);
    assert.equal(summary.driverBonusCents, 600);
    assert.equal(summary.companyBonusCents, 400);
    // Neto liquidación = bruto sin IVA 10 % (10_000 − 909 = 9091); reparto 50 %.
    assert.equal(summary.vatCents, 909);
    assert.equal(summary.netCents, 9091);
    assert.equal(summary.driverNetCents, 4546);
    assert.equal(summary.companyNetCents, 4545);
    assert.equal(summary.totalToSettleCents, 4546 - 8000 + 500 + 200 + 600);
  });

  it("tracks T3 gross separately", () => {
    const summary = computeLiquidationSummary(
      [{ ...baseTrip, fareType: "T3", grossAmountCents: BigInt(5_000) }],
      { driverSharePct: 50, driverBonusSharePct: 50 },
    );
    assert.equal(summary.t3Cents, 5000);
  });

  it("matches Alfredo example: bruto 110,35 → neto 100,32 (bruto − IVA), not sum of trip nets", () => {
    const rows = [
      { gross: 1310, net: 1179, fee: 131 },
      { gross: 1695, net: 1525, fee: 170 },
      { gross: 1280, net: 1152, fee: 128 },
      { gross: 1380, net: 1042, fee: 138 },
      { gross: 4130, net: 3717, fee: 413 },
      { gross: 1240, net: 1116, fee: 124 },
    ];
    const trips = rows.map((row, i) => ({
      ...baseTrip,
      id: `alf-${i}`,
      grossAmountCents: BigInt(row.gross),
      netAmountCents: BigInt(row.net),
      platformFeeCents: BigInt(row.fee),
      tipCents: BigInt(0),
      platformBonusCents: BigInt(0),
      tollCents: BigInt(0),
      paymentMethod: "app",
      paymentValidated: true,
    }));
    trips[0]!.platformBonusCents = BigInt(86);

    const summary = computeLiquidationSummary(trips, {
      driverSharePct: 40,
      driverBonusSharePct: 50,
    });

    assert.equal(summary.grossCents, 11035);
    assert.equal(summary.vatCents, 1003);
    assert.equal(summary.netCents, 10032);
    assert.equal(summary.driverNetCents, 4013);
    assert.notEqual(summary.netCents, 9731);
  });

  it("matches Shahid example: bruto 37,70 → neto 34,27 and 40 % conductor", () => {
    const trips = [
      { gross: 800, net: 704, fee: 96 },
      { gross: 1230, net: 1082, fee: 148 },
      { gross: 940, net: 827, fee: 113 },
      { gross: 800, net: 704, fee: 96 },
    ].map((row, i) => ({
      ...baseTrip,
      id: `t${i}`,
      grossAmountCents: BigInt(row.gross),
      netAmountCents: BigInt(row.net),
      platformFeeCents: BigInt(row.fee),
      tipCents: BigInt(0),
      platformBonusCents: BigInt(0),
      tollCents: BigInt(0),
      paymentMethod: "app",
      paymentValidated: true,
    }));

    const summary = computeLiquidationSummary(trips, {
      driverSharePct: 40,
      driverBonusSharePct: 50,
    });

    assert.equal(summary.grossCents, 3770);
    assert.equal(summary.vatCents, 343);
    assert.equal(summary.netCents, 3427);
    assert.equal(summary.driverNetCents, 1371);
    assert.equal(summary.companyNetCents, 2056);
    assert.equal(summary.platformFeeCents, 453);
  });

  it("counts unbalancedPaymentCount for confirmed trips with mismatched buckets", () => {
    const summary = computeLiquidationSummary(
      [
        {
          ...baseTrip,
          id: "ok",
          grossAmountCents: BigInt(2805),
          netAmountCents: BigInt(2524),
          paymentMethod: "card",
          cardPaymentCents: BigInt(2524),
          cashPaymentCents: null,
          paymentValidated: true,
        },
        {
          ...baseTrip,
          id: "bad",
          grossAmountCents: BigInt(2805),
          netAmountCents: BigInt(2524),
          paymentMethod: "mixed",
          cashPaymentCents: BigInt(1500),
          cardPaymentCents: BigInt(1500),
          paymentValidated: true,
        },
      ],
      { driverSharePct: 50, driverBonusSharePct: 50 },
    );
    assert.equal(summary.unbalancedPaymentCount, 1);
  });

  it("counts only cash/card/mixed trips in unvalidatedCount", () => {
    const summary = computeLiquidationSummary(
      [
        { ...baseTrip, id: "app", paymentMethod: "app", paymentValidated: false },
        { ...baseTrip, id: "cash", paymentMethod: "cash", paymentValidated: false },
      ],
      { driverSharePct: 50, driverBonusSharePct: 50 },
    );
    assert.equal(summary.unvalidatedCount, 1);
  });

  it("splits platform fee per driverPlatformFeeSharePct and adds daily fixed", () => {
    const summary = computeLiquidationSummary([baseTrip], {
      driverSharePct: 50,
      driverBonusSharePct: 50,
      driverPlatformFeeSharePct: 25,
      dailyFixedCents: 1500,
    });
    assert.equal(summary.platformFeeCents, 2000);
    assert.equal(summary.driverPlatformFeeCents, 500);
    assert.equal(summary.companyPlatformFeeCents, 1500);
    assert.equal(summary.dailyFixedCents, 1500);
    assert.equal(
      summary.totalToSettleCents,
      summary.driverNetCents -
        8000 +
        500 +
        200 +
        summary.driverBonusCents +
        500 +
        1500,
    );
  });
});

describe("tripTaximetroCents", () => {
  it("excludes Propina (día pago) lines from taxímetro", () => {
    assert.equal(
      tripTaximetroCents({
        fareType: "Propina (día pago)",
        grossAmountCents: null,
        netAmountCents: 176n,
        tipCents: 176n,
      }),
      0n,
    );
  });

  it("keeps taxímetro fare gross", () => {
    const result = tripTaximetroCents({
      fareType: "Taxímetro",
      grossAmountCents: 1500n,
      netAmountCents: 1350n,
      tipCents: 200n,
    });
    assert.equal(result, 1500n);
  });

  it("excludes T3 from taxímetro", () => {
    assert.equal(
      tripTaximetroCents({
        fareType: "Precio cerrado (T3)",
        grossAmountCents: 2000n,
        netAmountCents: 1800n,
        tipCents: 0n,
      }),
      0n,
    );
  });
});

describe("preferMergedFareType", () => {
  it("keeps T3 when activity ingest sends generic Taxi", () => {
    assert.equal(
      preferMergedFareType("Taxi", "Precio cerrado (T3)"),
      "Precio cerrado (T3)",
    );
  });

  it("upgrades generic Taxi to T3 from payments report", () => {
    assert.equal(
      preferMergedFareType("Precio cerrado (T3)", "Taxi"),
      "Precio cerrado (T3)",
    );
  });

  it("prefers taxímetro over generic Taxi", () => {
    assert.equal(preferMergedFareType("Taxi", "Taxímetro"), "Taxímetro");
  });
});
