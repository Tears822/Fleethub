import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GetDriverEarningsResponse200 } from "@api/freenow";
import {
  applyFreenowDriverEarningsToTrips,
  extractFreenowEarningsTotals,
  estimateFreenowCommissionFallbackTrips,
  groupFreenowTripsByCalendarDay,
} from "./freenow-earnings-mapper.js";

describe("extractFreenowEarningsTotals", () => {
  it("prefers totalBeforeCommission minus totalAfterCommission", () => {
    const totals = extractFreenowEarningsTotals({
      grossValues: {
        commission: 42.35,
        totalBeforeCommission: 282.25,
        totalAfterCommission: 239.83,
        tours: { numberOfTours: 25 },
      },
    } as GetDriverEarningsResponse200);
    assert.equal(totals.commissionCents, 4242n);
    assert.equal(totals.totalBeforeCommissionCents, 28225n);
  });

  it("reads commission and incentives from grossValues", () => {
    const totals = extractFreenowEarningsTotals({
      grossValues: {
        commission: 12.5,
        incentives: 3.0,
        totalBeforeCommission: 100,
        totalAfterCommission: 87.5,
        tours: { numberOfTours: 4 },
      },
    } as GetDriverEarningsResponse200);
    assert.equal(totals.commissionCents, 1250n);
    assert.equal(totals.incentivesCents, 300n);
    assert.equal(totals.totalBeforeCommissionCents, 10000n);
    assert.equal(totals.numberOfTours, 4);
  });
});

describe("applyFreenowDriverEarningsToTrips", () => {
  it("scales day commission when synced trips cover only part of earnings gross", () => {
    const trips = applyFreenowDriverEarningsToTrips(
      [
        {
          externalTripId: "a",
          startedAt: "2026-07-01T10:00:00.000Z",
          grossAmountCents: 1150n,
          tipCents: 0n,
          paymentMethod: "app",
          paymentValidated: true,
        },
        {
          externalTripId: "b",
          startedAt: "2026-07-01T11:00:00.000Z",
          grossAmountCents: 1395n,
          tipCents: 0n,
          paymentMethod: "app",
          paymentValidated: true,
        },
      ],
      {
        commissionCents: 1390n,
        incentivesCents: 0n,
        totalBeforeCommissionCents: 9270n,
        totalAfterCommissionCents: 7880n,
        numberOfTours: 8,
      },
    );

    const feeSum = (trips[0]!.platformFeeCents ?? 0n) + (trips[1]!.platformFeeCents ?? 0n);
    assert.equal(feeSum, 382n);
  });

  it("overwrites an existing booking-level fee with earnings allocation", () => {
    const trips = applyFreenowDriverEarningsToTrips(
      [
        {
          externalTripId: "a",
          startedAt: "2026-07-01T10:00:00.000Z",
          grossAmountCents: 1150n,
          platformFeeCents: 115n,
          tipCents: 0n,
          paymentMethod: "app",
          paymentValidated: true,
        },
      ],
      {
        commissionCents: 173n,
        incentivesCents: 0n,
        totalBeforeCommissionCents: 1150n,
        numberOfTours: 1,
      },
    );

    assert.equal(trips[0]!.platformFeeCents, 173n);
    assert.equal(trips[0]!.netAmountCents, 977n);
  });

  it("uses fare + tip as commission weight and net base", () => {
    const trips = applyFreenowDriverEarningsToTrips(
      [
        {
          externalTripId: "a",
          startedAt: "2026-07-05T10:00:00.000Z",
          grossAmountCents: 1300n,
          tipCents: 100n,
          paymentMethod: "app",
          paymentValidated: true,
        },
      ],
      {
        commissionCents: 196n,
        incentivesCents: 0n,
        totalBeforeCommissionCents: 1400n,
        numberOfTours: 1,
      },
    );

    assert.equal(trips[0]!.platformFeeCents, 196n);
    assert.equal(trips[0]!.netAmountCents, 1204n);
  });

  it("allocates commission and primas proportional to gross", () => {
    const trips = applyFreenowDriverEarningsToTrips(
      [
        {
          externalTripId: "a",
          startedAt: "2026-05-01T10:00:00.000Z",
          grossAmountCents: 6000n,
          tipCents: 0n,
          paymentMethod: "app",
          paymentValidated: true,
        },
        {
          externalTripId: "b",
          startedAt: "2026-05-01T11:00:00.000Z",
          grossAmountCents: 4000n,
          tipCents: 0n,
          paymentMethod: "app",
          paymentValidated: true,
        },
      ],
      {
        commissionCents: 1000n,
        incentivesCents: 500n,
        totalBeforeCommissionCents: 10000n,
        numberOfTours: 2,
      },
    );

    assert.equal(trips[0]!.platformFeeCents, 600n);
    assert.equal(trips[1]!.platformFeeCents, 400n);
    assert.equal(trips[0]!.platformBonusCents, 300n);
    assert.equal(trips[1]!.platformBonusCents, 200n);
    assert.equal(trips[0]!.netAmountCents, 5400n);
    assert.equal(trips[0]!.appPaymentCents, 5400n);
  });

  it("clears primas when incentives total is zero", () => {
    const trips = applyFreenowDriverEarningsToTrips(
      [
        {
          externalTripId: "a",
          startedAt: "2026-07-01T10:00:00.000Z",
          grossAmountCents: 5235n,
          platformBonusCents: 60n,
          tipCents: 0n,
          paymentMethod: "app",
          paymentValidated: true,
        },
      ],
      {
        commissionCents: 0n,
        incentivesCents: 0n,
        totalBeforeCommissionCents: 5235n,
        numberOfTours: 1,
      },
    );
    assert.equal(trips[0]!.platformBonusCents, 0n);
  });
});

describe("estimateFreenowCommissionFallbackTrips", () => {
  it("applies ~15% commission per trip", () => {
    const trips = estimateFreenowCommissionFallbackTrips([
      {
        externalTripId: "a",
        startedAt: "2026-07-01T10:00:00.000Z",
        grossAmountCents: 1150n,
        tipCents: 0n,
        paymentMethod: "app",
        paymentValidated: true,
      },
    ]);
    assert.equal(trips[0]!.platformFeeCents, 173n);
    assert.equal(trips[0]!.netAmountCents, 977n);
  });
});

describe("groupFreenowTripsByCalendarDay", () => {
  it("splits trips across Madrid calendar days", () => {
    const byDay = groupFreenowTripsByCalendarDay([
      {
        externalTripId: "a",
        startedAt: "2026-07-01T05:45:00.000Z",
        grossAmountCents: 4875n,
        tipCents: 0n,
        paymentMethod: "app",
        paymentValidated: true,
      },
      {
        externalTripId: "b",
        startedAt: "2026-07-02T05:45:00.000Z",
        grossAmountCents: 5000n,
        tipCents: 0n,
        paymentMethod: "app",
        paymentValidated: true,
      },
    ]);
    assert.equal(byDay.size, 2);
    assert.equal(byDay.get("2026-07-01")?.length, 1);
    assert.equal(byDay.get("2026-07-02")?.length, 1);
  });
});
