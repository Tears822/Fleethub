import assert from "node:assert/strict";
import { test } from "node:test";
import { computeIngestLatencyMs, formatIngestLatencyMs } from "./ingestion-events.js";

test("computeIngestLatencyMs uses pipeline time for poll backfill (not trip age)", () => {
  const receivedAt = new Date("2026-05-22T10:00:00.000Z");
  const processedAt = new Date("2026-05-22T10:00:02.500Z");
  const platformEventAt = new Date("2026-05-18T08:00:00.000Z");

  assert.equal(
    computeIngestLatencyMs({
      receivedAt,
      processedAt,
      platformEventAt,
      ingestSource: "poll_manual",
    }),
    2500,
  );
});

test("computeIngestLatencyMs uses webhook freshness when trip ended recently", () => {
  const platformEventAt = new Date("2026-05-22T09:59:30.000Z");
  const receivedAt = new Date("2026-05-22T10:00:00.000Z");
  const processedAt = new Date("2026-05-22T10:00:01.000Z");

  assert.equal(
    computeIngestLatencyMs({
      receivedAt,
      processedAt,
      platformEventAt,
      ingestSource: "webhook",
    }),
    30_000,
  );
});

test("computeIngestLatencyMs falls back to pipeline for stale webhook trips", () => {
  const platformEventAt = new Date("2026-05-10T08:00:00.000Z");
  const receivedAt = new Date("2026-05-22T10:00:00.000Z");
  const processedAt = new Date("2026-05-22T10:00:03.000Z");

  assert.equal(
    computeIngestLatencyMs({
      receivedAt,
      processedAt,
      platformEventAt,
      ingestSource: "webhook",
    }),
    3000,
  );
});

test("formatIngestLatencyMs renders human-readable units", () => {
  assert.equal(formatIngestLatencyMs(450), "450 ms");
  assert.equal(formatIngestLatencyMs(2500), "2.5 s");
  assert.equal(formatIngestLatencyMs(90_000), "1.5 min");
  assert.equal(formatIngestLatencyMs(null), "—");
});
