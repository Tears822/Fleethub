import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  freenowTripBillingBaseCents,
  freenowTripCommissionBaseCents,
  freenowTripCommissionEstimateWeight,
  freenowTripNetAfterFeeCents,
} from "./freenow-commission.js";

describe("freenowTripBillingBaseCents", () => {
  it("includes tip in billing base", () => {
    assert.equal(
      freenowTripBillingBaseCents({ grossAmountCents: 1300n, tipCents: 100n }),
      1400n,
    );
  });
});

describe("freenowTripNetAfterFeeCents", () => {
  it("matches PDF net (base - fee, tip not subtracted twice)", () => {
    assert.equal(
      freenowTripNetAfterFeeCents({
        grossAmountCents: 1300n,
        tipCents: 100n,
        platformFeeCents: 196n,
      }),
      1204n,
    );
  });
});

describe("freenowTripCommissionBaseCents", () => {
  it("uses fare only (tips excluded from commission base)", () => {
    assert.equal(
      freenowTripCommissionBaseCents({ grossAmountCents: 1300n, tipCents: 100n }),
      1300n,
    );
  });
});

describe("freenowTripCommissionEstimateWeight", () => {
  it("rounds 15% half-up on fare", () => {
    assert.equal(
      freenowTripCommissionEstimateWeight({ grossAmountCents: 1150n, tipCents: 0n }),
      173n,
    );
    assert.equal(
      freenowTripCommissionEstimateWeight({ grossAmountCents: 1300n, tipCents: 100n }),
      195n,
    );
  });
});
