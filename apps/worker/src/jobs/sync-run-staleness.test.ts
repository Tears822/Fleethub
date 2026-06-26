import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  heartbeatAtFromCursorHint,
  isSyncRunStale,
  syncRunLastActivity,
} from "./sync-run-staleness.js";

const STALE_MS = 12 * 60_000;

describe("sync-run-staleness", () => {
  describe("heartbeatAtFromCursorHint", () => {
    it("reads a valid ISO heartbeatAt", () => {
      const iso = "2026-06-26T16:00:00.000Z";
      assert.equal(heartbeatAtFromCursorHint({ heartbeatAt: iso })?.toISOString(), iso);
    });

    it("returns null for missing/invalid hint", () => {
      assert.equal(heartbeatAtFromCursorHint(null), null);
      assert.equal(heartbeatAtFromCursorHint({}), null);
      assert.equal(heartbeatAtFromCursorHint({ heartbeatAt: "not-a-date" }), null);
      assert.equal(heartbeatAtFromCursorHint("x"), null);
    });
  });

  describe("syncRunLastActivity", () => {
    it("prefers a heartbeat newer than start", () => {
      const start = new Date("2026-06-26T15:00:00.000Z");
      const hb = "2026-06-26T15:30:00.000Z";
      assert.equal(
        syncRunLastActivity(start, { heartbeatAt: hb }).toISOString(),
        hb,
      );
    });

    it("falls back to start when no heartbeat", () => {
      const start = new Date("2026-06-26T15:00:00.000Z");
      assert.equal(syncRunLastActivity(start, {}).getTime(), start.getTime());
    });
  });

  describe("isSyncRunStale", () => {
    const now = Date.parse("2026-06-26T16:00:00.000Z");

    it("is NOT stale for a slow-but-alive sync with a fresh heartbeat", () => {
      // Started 25 min ago (well past 12m) but heartbeat 30s ago → alive.
      const startedAt = new Date(now - 25 * 60_000);
      const cursorHint = { heartbeatAt: new Date(now - 30_000).toISOString() };
      assert.equal(isSyncRunStale(startedAt, cursorHint, STALE_MS, now), false);
    });

    it("is stale when the heartbeat itself is older than the window", () => {
      const startedAt = new Date(now - 25 * 60_000);
      const cursorHint = { heartbeatAt: new Date(now - 13 * 60_000).toISOString() };
      assert.equal(isSyncRunStale(startedAt, cursorHint, STALE_MS, now), true);
    });

    it("falls back to startedAt when no heartbeat (legacy rows)", () => {
      const startedAt = new Date(now - 13 * 60_000);
      assert.equal(isSyncRunStale(startedAt, {}, STALE_MS, now), true);
      const fresh = new Date(now - 5 * 60_000);
      assert.equal(isSyncRunStale(fresh, {}, STALE_MS, now), false);
    });
  });
});
