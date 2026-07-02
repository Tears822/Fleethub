import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUberDateTime } from "./uber-csv-columns.js";

function madrid(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

describe("parseUberDateTime", () => {
  it("treats ISO datetime without offset as Europe/Madrid wall clock", () => {
    const iso = parseUberDateTime("2026-07-02 05:35:00");
    assert.ok(iso);
    assert.equal(iso, "2026-07-02T03:35:00.000Z");
    assert.equal(madrid(iso!), "05:35");
  });

  it("parses explicit +0200 CEST offset", () => {
    const iso = parseUberDateTime("2026-07-02 05:35:00 +0200 CEST");
    assert.ok(iso);
    assert.equal(iso, "2026-07-02T03:35:00.000Z");
    assert.equal(madrid(iso!), "05:35");
  });

  it("parses Spanish dd/mm/yyyy without offset as Madrid", () => {
    const iso = parseUberDateTime("02/07/2026 05:35:00");
    assert.ok(iso);
    assert.equal(iso, "2026-07-02T03:35:00.000Z");
    assert.equal(madrid(iso!), "05:35");
  });

  it("parses Z-suffixed UTC timestamps unchanged", () => {
    const iso = parseUberDateTime("2026-06-16T14:35:37Z");
    assert.equal(iso, "2026-06-16T14:35:37.000Z");
  });
});
