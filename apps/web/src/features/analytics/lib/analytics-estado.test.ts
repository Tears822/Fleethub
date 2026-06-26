import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyticsEstadoFromSector } from "./analytics-kpi.js";

describe("analyticsEstadoFromSector", () => {
  const sector = { facturacion: 1000, viajes: 70, eurHora: 12 };

  it("ok when 2 or 3 metrics meet sector average", () => {
    assert.equal(
      analyticsEstadoFromSector(
        { facturacion: 1100, viajes: 80, eurHora: 13 },
        sector,
      ),
      "ok",
    );
    assert.equal(
      analyticsEstadoFromSector(
        { facturacion: 1100, viajes: 50, eurHora: 13 },
        sector,
      ),
      "ok",
    );
  });

  it("medio when exactly one metric meets sector average", () => {
    assert.equal(
      analyticsEstadoFromSector(
        { facturacion: 900, viajes: 80, eurHora: 10 },
        sector,
      ),
      "medio",
    );
  });

  it("alerta when no metric meets sector average", () => {
    assert.equal(
      analyticsEstadoFromSector(
        { facturacion: 500, viajes: 20, eurHora: 8 },
        sector,
      ),
      "alerta",
    );
  });
});
