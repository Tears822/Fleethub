import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapTripsToRowDetail } from "./shift-trip-detail-mapper.ts";
import type { ApiShiftTrip } from "./shift-trip-detail-mapper.ts";
import { RidePlatform } from "@prisma/client";

function trip(partial: Partial<ApiShiftTrip> & Pick<ApiShiftTrip, "id">): ApiShiftTrip {
  return {
    platform: RidePlatform.FREENOW,
    startedAt: "2026-06-16T10:00:00.000Z",
    endedAt: "2026-06-16T10:15:00.000Z",
    fareType: null,
    paymentMethod: "app",
    grossAmountCents: "1000",
    netAmountCents: "1000",
    platformFeeCents: null,
    tipCents: "0",
    platformBonusCents: "0",
    tollCents: "0",
    paymentValidated: true,
    ...partial,
  };
}

describe("shift-trip-detail-mapper totals", () => {
  it("total row includes inferred payment split for unconfirmed trips (cuadra con importe)", () => {
    const trips = [
      trip({ id: "a", paymentMethod: "app", grossAmountCents: "2000", netAmountCents: "2000" }),
      trip({
        id: "b",
        paymentMethod: "cash",
        grossAmountCents: "1000",
        netAmountCents: "900",
        cashPaymentCents: "1000",
        paymentValidated: false,
      }),
    ];
    const detail = mapTripsToRowDetail(trips, "16/06/2026", "FreeNow");
    const block = detail.platforms[0]!;
    const total = block.total;
    assert.equal(total.importeNum, 30);
    assert.equal(total.appNum, 20);
    assert.equal(total.efectivoNum, 10);
    assert.equal((total.appNum ?? 0) + (total.efectivoNum ?? 0), 30);
  });

  it("tip-only Propina (día pago) rows do not add to taxímetro total", () => {
    const trips = [
      trip({
        id: "fare",
        fareType: "Precio cerrado (T3)",
        grossAmountCents: "1000",
        netAmountCents: "900",
        tipCents: "0",
      }),
      trip({
        id: "tip1",
        fareType: "Propina (día pago)",
        grossAmountCents: null,
        netAmountCents: "176",
        tipCents: "176",
      }),
      trip({
        id: "tip2",
        fareType: "Propina (día pago)",
        grossAmountCents: null,
        netAmountCents: "200",
        tipCents: "200",
      }),
    ];
    const detail = mapTripsToRowDetail(trips, "26/06/2026", "Uber");
    const block = detail.platforms[0]!;
    assert.equal(block.total.taximetroNum, 0);
    assert.equal(block.total.propinasNum, 3.76);
    assert.equal(block.trips[1]!.taximetroNum, 0);
    assert.equal(block.trips[2]!.taximetroNum, 0);
  });
});
