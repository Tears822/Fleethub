import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getHourInTimeZone, getTimeGreeting, GREETING_TIME_ZONE } from "./time-greeting.js";

describe("getTimeGreeting", () => {
  it("uses Europe/Madrid boundaries", () => {
    const zone = GREETING_TIME_ZONE;
    assert.equal(getTimeGreeting(new Date("2026-05-22T08:00:00+02:00"), zone), "Buenos días");
    assert.equal(getTimeGreeting(new Date("2026-05-22T11:59:00+02:00"), zone), "Buenos días");
    assert.equal(getTimeGreeting(new Date("2026-05-22T12:00:00+02:00"), zone), "Buenas tardes");
    assert.equal(getTimeGreeting(new Date("2026-05-22T19:59:00+02:00"), zone), "Buenas tardes");
    assert.equal(getTimeGreeting(new Date("2026-05-22T20:00:00+02:00"), zone), "Buenas noches");
    assert.equal(getTimeGreeting(new Date("2026-05-22T23:00:00+02:00"), zone), "Buenas noches");
  });

  it("parses hour in timezone", () => {
    const noon = new Date("2026-01-15T12:00:00+01:00");
    assert.equal(getHourInTimeZone(noon, GREETING_TIME_ZONE), 12);
  });
});
