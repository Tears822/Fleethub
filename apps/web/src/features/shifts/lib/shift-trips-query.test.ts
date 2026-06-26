import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildShiftTripsQueryParams,
  SHIFT_TRIPS_QUERY_TRIP_IDS_MAX,
} from "./shift-trips-query.ts";

test("buildShiftTripsQueryParams uses driverId for pending without huge tripIds list", () => {
  const manyIds = Array.from({ length: 120 }, (_, i) => `trip-${i}`);
  const params = buildShiftTripsQueryParams({
    liquidationStatus: "pending",
    driverId: "driver-1",
    tripIds: manyIds,
    platform: "UBER",
  });
  assert.ok(params);
  assert.equal(params.get("driverId"), "driver-1");
  assert.equal(params.get("platform"), "UBER");
  assert.equal(params.get("tripIds"), null);
});

test("buildShiftTripsQueryParams keeps small tripIds for pending partial batches", () => {
  const ids = Array.from({ length: 5 }, (_, i) => `trip-${i}`);
  const params = buildShiftTripsQueryParams({
    liquidationStatus: "pending",
    driverId: "driver-1",
    tripIds: ids,
  });
  assert.ok(params);
  assert.equal(params.get("tripIds"), ids.join(","));
});

test("buildShiftTripsQueryParams omits tripIds when platform filter scopes the batch", () => {
  const ids = Array.from({ length: 12 }, (_, i) => `trip-${i}`);
  const params = buildShiftTripsQueryParams({
    liquidationStatus: "pending",
    driverId: "driver-1",
    tripIds: ids,
    platform: "FREENOW",
  });
  assert.ok(params);
  assert.equal(params.get("driverId"), "driver-1");
  assert.equal(params.get("platform"), "FREENOW");
  assert.equal(params.get("tripIds"), null);
});

test("buildShiftTripsQueryParams rejects closed batches above URL limit", () => {
  const manyIds = Array.from({ length: SHIFT_TRIPS_QUERY_TRIP_IDS_MAX + 1 }, (_, i) => `t-${i}`);
  const params = buildShiftTripsQueryParams({
    liquidationStatus: "closed",
    driverId: "driver-1",
    tripIds: manyIds,
  });
  assert.equal(params, null);
});
