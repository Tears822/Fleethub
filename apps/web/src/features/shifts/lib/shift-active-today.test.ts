import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countDriversActiveToday } from "./shift-active-today";

describe("countDriversActiveToday", () => {
  it("unions shift period drivers and trip drivers", () => {
    const n = countDriversActiveToday({
      shiftPeriodsToday: [{ driverId: "a", periodFrom: new Date() }],
      tripDriverIdsToday: ["b", "a"],
    });
    assert.equal(n, 2);
  });
});
