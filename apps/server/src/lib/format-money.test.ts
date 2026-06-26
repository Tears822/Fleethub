import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDateTimeShortEs,
  formatTripInstantEs,
  FLEETHUB_DEFAULT_TIMEZONE,
} from "./format-money.js";

describe("format-money timezone", () => {
  const iso = "2026-05-20T18:17:28.051Z";

  it("formats Madrid summer time (CEST, UTC+2) not server local offset", () => {
    assert.equal(formatDateTimeShortEs(iso, FLEETHUB_DEFAULT_TIMEZONE), "20/05/2026 20:17");
    assert.equal(formatTripInstantEs(iso, FLEETHUB_DEFAULT_TIMEZONE), "20/05 20:17");
  });
});
