import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeTurnoAbiertoByDriver } from "./shift-open-status.js";

describe("computeTurnoAbiertoByDriver", () => {
  const driver = "d1";

  it("marks open when no liquidation today", () => {
    const map = computeTurnoAbiertoByDriver(
      [{ driverId: driver, startedAt: new Date("2026-05-22T10:00:00") }],
      [],
    );
    assert.equal(map.get(driver), true);
  });

  it("marks open when pending trip started after last close today", () => {
    const map = computeTurnoAbiertoByDriver(
      [{ driverId: driver, startedAt: new Date("2026-05-22T18:00:00") }],
      [{ driverId: driver, closedAt: new Date("2026-05-22T14:00:00") }],
    );
    assert.equal(map.get(driver), true);
  });

  it("marks closed when all pending trips started before last close today", () => {
    const map = computeTurnoAbiertoByDriver(
      [
        { driverId: driver, startedAt: new Date("2026-05-22T08:00:00") },
        { driverId: driver, startedAt: new Date("2026-05-22T09:00:00") },
      ],
      [{ driverId: driver, closedAt: new Date("2026-05-22T14:00:00") }],
    );
    assert.equal(map.get(driver), false);
  });

  it("open wins if any pending trip is after last close", () => {
    const map = computeTurnoAbiertoByDriver(
      [
        { driverId: driver, startedAt: new Date("2026-05-22T08:00:00") },
        { driverId: driver, startedAt: new Date("2026-05-22T16:00:00") },
      ],
      [{ driverId: driver, closedAt: new Date("2026-05-22T14:00:00") }],
    );
    assert.equal(map.get(driver), true);
  });
});
