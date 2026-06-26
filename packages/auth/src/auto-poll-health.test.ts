import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoPollHealthWhere, autoPollSuccessWhere } from "./auto-poll-health.js";

describe("autoPollSuccessWhere", () => {
  it("only matches finished successful automatic polls with payments complete", () => {
    const where = autoPollSuccessWhere();

    assert.deepEqual(where.status, { in: ["SUCCESS", "success"] });
    assert.deepEqual(where.finishedAt, { not: null });
    assert.equal(where.OR?.length, 2);
    assert.deepEqual(where.NOT, {
      cursorHint: { path: ["paymentsComplete"], equals: false },
    });
  });
});

describe("autoPollHealthWhere", () => {
  it("matches PARTIAL automatic polls for watchdog health", () => {
    const where = autoPollHealthWhere();
    assert.deepEqual(where.status, {
      in: ["SUCCESS", "success", "PARTIAL", "partial"],
    });
  });
});
