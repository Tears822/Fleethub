import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildPaymentUpdateFromMode,
  derivePaymentEditMode,
  grossSplitToNetAmounts,
  paymentModeNeedsManualReview,
  resolveTripPaymentAmounts,
  resolveTripPaymentDisplayAmounts,
  tripPaymentDisplayBalanced,
  tripNeedsManualPaymentReview,
  tripNeedsPaymentUiAttention,
} from "./trip-payment-amounts.js";

describe("trip-payment-amounts", () => {
  it("resolveTripPaymentDisplayAmounts caps buckets to gross when net earnings exceed fare (Uber tips)", () => {
    const split = resolveTripPaymentDisplayAmounts({
      grossAmountCents: BigInt(1000),
      netAmountCents: BigInt(1059),
      paymentMethod: "app",
      appPaymentCents: BigInt(1059),
    });
    assert.equal(split.app, BigInt(1000));
    assert.equal(split.cash, BigInt(0));
    assert.equal(split.card, BigInt(0));
    assert.equal(
      tripPaymentDisplayBalanced({
        grossAmountCents: BigInt(1000),
        netAmountCents: BigInt(1059),
        paymentMethod: "app",
        appPaymentCents: BigInt(1059),
      }),
      true,
    );
  });

  it("resolveTripPaymentDisplayAmounts scales app to gross when fare exceeds net", () => {
    const split = resolveTripPaymentDisplayAmounts({
      grossAmountCents: BigInt(800),
      netAmountCents: BigInt(704),
      paymentMethod: "app",
      appPaymentCents: BigInt(704),
    });
    assert.equal(split.app, BigInt(800));
    assert.equal(split.cash, BigInt(0));
    assert.equal(split.card, BigInt(0));
  });

  it("resolveTripPaymentDisplayAmounts keeps net buckets when gross equals net", () => {
    const split = resolveTripPaymentDisplayAmounts({
      grossAmountCents: BigInt(1465),
      netAmountCents: BigInt(1465),
      paymentMethod: "app",
    });
    assert.equal(split.app, BigInt(1465));
  });

  it("puts full net in app bucket when method is app and no explicit split", () => {
    const split = resolveTripPaymentAmounts({
      netAmountCents: BigInt(1465),
      paymentMethod: "app",
    });
    assert.equal(split.app, BigInt(1465));
    assert.equal(split.cash, BigInt(0));
    assert.equal(split.card, BigInt(0));
  });

  it("puts full net in cash bucket when method is cash", () => {
    const split = resolveTripPaymentAmounts({
      netAmountCents: BigInt(2800),
      paymentMethod: "cash",
    });
    assert.equal(split.cash, BigInt(2800));
    assert.equal(split.card, BigInt(0));
    assert.equal(split.app, BigInt(0));
  });

  it("ignores stale cash column when paymentMethod is card and amounts duplicate", () => {
    const split = resolveTripPaymentAmounts({
      netAmountCents: BigInt(2524),
      paymentMethod: "card",
      cashPaymentCents: BigInt(2524),
      cardPaymentCents: BigInt(2524),
    });
    assert.equal(split.card, BigInt(2524));
    assert.equal(split.cash, BigInt(0));
    assert.equal(split.app, BigInt(0));
  });

  it("treats Uber cash column stored as gross while settlement uses net", () => {
    const split = resolveTripPaymentAmounts({
      grossAmountCents: BigInt(1220),
      netAmountCents: BigInt(1074),
      paymentMethod: "cash",
      cashPaymentCents: BigInt(1220),
    });
    assert.equal(split.cash, BigInt(1074));
    assert.equal(
      tripPaymentDisplayBalanced({
        grossAmountCents: BigInt(1220),
        netAmountCents: BigInt(1074),
        paymentMethod: "cash",
        cashPaymentCents: BigInt(1220),
      }),
      true,
    );
    const display = resolveTripPaymentDisplayAmounts({
      grossAmountCents: BigInt(1220),
      netAmountCents: BigInt(1074),
      paymentMethod: "cash",
      cashPaymentCents: BigInt(1220),
    });
    assert.equal(display.cash, BigInt(1220));
  });

  it("tripPaymentDisplayBalanced rejects mixed split that does not sum to importe", () => {
    assert.equal(
      tripPaymentDisplayBalanced({
        grossAmountCents: BigInt(2805),
        netAmountCents: BigInt(2524),
        paymentMethod: "mixed",
        cashPaymentCents: BigInt(1500),
        cardPaymentCents: BigInt(1500),
      }),
      false,
    );
    assert.equal(
      tripPaymentDisplayBalanced({
        grossAmountCents: BigInt(2805),
        netAmountCents: BigInt(2524),
        paymentMethod: "card",
        cardPaymentCents: BigInt(2524),
        cashPaymentCents: null,
      }),
      true,
    );
  });

  it("uses explicit split for mixed payment", () => {
    const split = resolveTripPaymentAmounts({
      netAmountCents: BigInt(3000),
      paymentMethod: "mixed",
      cashPaymentCents: BigInt(1500),
      cardPaymentCents: BigInt(1500),
    });
    assert.equal(split.cash, BigInt(1500));
    assert.equal(split.card, BigInt(1500));
    assert.equal(split.app, BigInt(0));
  });

  it("ignores all-zero explicit split columns and uses paymentMethod", () => {
    const split = resolveTripPaymentAmounts({
      netAmountCents: BigInt(1927),
      paymentMethod: "app",
      cashPaymentCents: BigInt(0),
      cardPaymentCents: BigInt(0),
      appPaymentCents: BigInt(0),
    });
    assert.equal(split.app, BigInt(1927));
  });

  it("buildPaymentUpdateFromMode validates mixed sum on gross importe", () => {
    assert.throws(() =>
      buildPaymentUpdateFromMode(
        "mixed",
        { netAmountCents: BigInt(1527), grossAmountCents: BigInt(1735) },
        { cashCents: 1000, cardCents: 500 },
      ),
    );
  });

  it("buildPaymentUpdateFromMode stores proportional net for gross split", () => {
    const u = buildPaymentUpdateFromMode(
      "mixed",
      { netAmountCents: BigInt(1527), grossAmountCents: BigInt(1735) },
      { cashCents: 1735, cardCents: 0 },
    );
    assert.equal(u.paymentMethod, "mixed");
    assert.equal(u.cashPaymentCents, BigInt(1527));
    assert.equal(u.cardPaymentCents, BigInt(0));
  });

  it("buildPaymentUpdateFromMode keeps net in cash column for cash mode", () => {
    const u = buildPaymentUpdateFromMode("cash", {
      netAmountCents: BigInt(1460),
      grossAmountCents: BigInt(1600),
    });
    assert.equal(u.paymentMethod, "cash");
    assert.equal(u.cashPaymentCents, BigInt(1460));
    assert.equal(u.cardPaymentCents, null);
    assert.equal(u.appPaymentCents, null);
  });

  it("buildPaymentUpdateFromMode keeps net in card column for card mode", () => {
    const u = buildPaymentUpdateFromMode("card", {
      netAmountCents: BigInt(2495),
      grossAmountCents: BigInt(2495),
    });
    assert.equal(u.cardPaymentCents, BigInt(2495));
  });

  it("buildPaymentUpdateFromMode keeps net in app column for app mode", () => {
    const u = buildPaymentUpdateFromMode("app", {
      netAmountCents: BigInt(1800),
      grossAmountCents: BigInt(1800),
    });
    assert.equal(u.appPaymentCents, BigInt(1800));
  });

  it("derivePaymentEditMode classifies app vs collectible methods", () => {
    assert.equal(
      derivePaymentEditMode({ netAmountCents: BigInt(1000), paymentMethod: "app" }),
      "app",
    );
    assert.equal(
      derivePaymentEditMode({ netAmountCents: BigInt(1000), paymentMethod: "cash" }),
      "cash",
    );
    assert.equal(
      derivePaymentEditMode({
        netAmountCents: BigInt(1000),
        paymentMethod: "mixed",
        cashPaymentCents: BigInt(600),
        cardPaymentCents: BigInt(400),
      }),
      "mixed",
    );
    assert.equal(paymentModeNeedsManualReview("app"), false);
    assert.equal(paymentModeNeedsManualReview("cash"), true);
  });

  it("tripNeedsPaymentUiAttention flags unbalanced app trips", () => {
    assert.equal(
      tripNeedsPaymentUiAttention({
        netAmountCents: BigInt(1250),
        grossAmountCents: BigInt(1500),
        paymentMethod: "app",
        appPaymentCents: BigInt(1350),
        paymentValidated: true,
      }),
      true,
    );
    assert.equal(
      tripNeedsPaymentUiAttention({
        netAmountCents: BigInt(1000),
        paymentMethod: "cash",
        paymentValidated: false,
      }),
      true,
    );
  });

  it("tripNeedsManualPaymentReview ignores unvalidated app trips", () => {
    assert.equal(
      tripNeedsManualPaymentReview({
        netAmountCents: BigInt(1000),
        paymentMethod: "app",
        paymentValidated: false,
      }),
      false,
    );
    assert.equal(
      tripNeedsManualPaymentReview({
        netAmountCents: BigInt(1000),
        paymentMethod: "cash",
        paymentValidated: false,
      }),
      true,
    );
  });

  it("grossSplitToNetAmounts splits proportionally", () => {
    const { cash, card } = grossSplitToNetAmounts(
      BigInt(1735),
      BigInt(1527),
      BigInt(1000),
      BigInt(735),
    );
    assert.equal(cash + card, BigInt(1527));
    assert.ok(cash > BigInt(800));
  });

  it("resolveTripPaymentDisplayAmounts assigns gross when settlement split is zero", () => {
    const split = resolveTripPaymentDisplayAmounts({
      grossAmountCents: BigInt(137),
      netAmountCents: BigInt(0),
      paymentMethod: "app",
    });
    assert.equal(split.app, BigInt(137));
    assert.equal(split.cash + split.card, BigInt(0));
  });

  it("resolveTripPaymentDisplayAmounts always sums to gross when buckets exist", () => {
    const gross = BigInt(339930);
    const cases = [
      {
        grossAmountCents: gross,
        netAmountCents: BigInt(301447),
        paymentMethod: "app",
        appPaymentCents: BigInt(311475),
        cashPaymentCents: BigInt(28190),
      },
      {
        grossAmountCents: BigInt(1000),
        netAmountCents: BigInt(1059),
        paymentMethod: "app",
        appPaymentCents: BigInt(200),
      },
      {
        grossAmountCents: BigInt(800),
        netAmountCents: BigInt(704),
        paymentMethod: "mixed",
        cashPaymentCents: BigInt(300),
        cardPaymentCents: BigInt(404),
      },
    ] as const;

    for (const trip of cases) {
      const display = resolveTripPaymentDisplayAmounts(trip);
      const sum = display.app + display.cash + display.card;
      assert.equal(sum, trip.grossAmountCents, `expected display sum ${sum} to equal gross ${trip.grossAmountCents}`);
    }
  });
});
