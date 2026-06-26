import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GetDriverEarningsResponse200 } from "@api/freenow";
import {
  applyFreenowDriverEarningsToTrips,
  extractFreenowEarningsTotals,
} from "./freenow-earnings-mapper.js";

describe("extractFreenowEarningsTotals", () => {
  it("reads commission and incentives from grossValues", () => {
    const totals = extractFreenowEarningsTotals({
      grossValues: {
        commission: 12.5,
        incentives: 3.0,
        totalBeforeCommission: 100,
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
});
