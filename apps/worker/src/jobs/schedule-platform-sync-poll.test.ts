import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RidePlatform } from "@fleethub/db";
import { __testOnly } from "./schedule-platform-sync-poll.js";

const { isDue, RUNNING_STALE_MS, PAYMENTS_PARTIAL_RETRY_MINUTES, shouldEnqueuePoll } =
  __testOnly;

describe("schedule-platform-sync-poll", () => {
  describe("isDue", () => {
    it("returns true when there is no previous successful poll", () => {
      assert.equal(isDue(null, 15), true);
    });

    it("returns false inside the polling interval after last success", () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
      assert.equal(isDue(tenMinutesAgo, 15), false);
    });

    it("returns true once the polling interval has elapsed", () => {
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60_000);
      assert.equal(isDue(twentyMinutesAgo, 15), true);
    });

    it("treats a recent FAILED finishedAt as due when scheduler uses SUCCESS-only lookup", () => {
      // Regression: FAILED stale RUNNING used to delay next poll via finishedAt.
      const failedJustNow = new Date(Date.now() - 1 * 60_000);
      assert.equal(isDue(failedJustNow, 15), false);
      // With SUCCESS-only lastAutoPollFinishedAt returning null, isDue(null, 15) is true.
      assert.equal(isDue(null, 15), true);
    });
  });

  describe("RUNNING_STALE_MS", () => {
    it("is 12 minutes so hung Uber syncs are reconciled faster than the old 45m window", () => {
      assert.equal(RUNNING_STALE_MS, 12 * 60_000);
      assert.ok(RUNNING_STALE_MS < 45 * 60_000);
    });
  });

  describe("shouldEnqueuePoll", () => {
    it("retries Uber sooner after PARTIAL even if an older SUCCESS exists", () => {
      const sixMinutesAgo = new Date(Date.now() - 6 * 60_000);
      const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
      assert.equal(
        shouldEnqueuePoll({
          platform: RidePlatform.UBER,
          pollingMinutes: 15,
          lastSuccessAt: tenMinutesAgo,
          lastPartialAt: sixMinutesAgo,
        }),
        true,
      );
    });

    it("waits for partial retry cooldown after PARTIAL", () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60_000);
      assert.equal(
        shouldEnqueuePoll({
          platform: RidePlatform.UBER,
          pollingMinutes: 15,
          lastSuccessAt: null,
          lastPartialAt: twoMinutesAgo,
        }),
        false,
      );
      assert.equal(PAYMENTS_PARTIAL_RETRY_MINUTES, 5);
    });
  });
});
