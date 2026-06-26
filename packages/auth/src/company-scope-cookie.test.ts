import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMPANY_SCOPE_ALL,
  formatCompanyScopeCookie,
  parseCompanyScopeCookieSelection,
} from "./company-scope-cookie";

describe("company-scope-cookie", () => {
  const tenantA = "tenant-a-id";
  const tenantB = "tenant-b-id";
  const companyId = "company-uuid-123";

  it("parses tenant-bound cookie for matching tenant", () => {
    const raw = formatCompanyScopeCookie(tenantA, companyId);
    assert.equal(parseCompanyScopeCookieSelection(raw, tenantA), companyId);
  });

  it("rejects cookie from another tenant", () => {
    const raw = formatCompanyScopeCookie(tenantA, companyId);
    assert.equal(parseCompanyScopeCookieSelection(raw, tenantB), COMPANY_SCOPE_ALL);
  });

  it("accepts legacy company id for migration", () => {
    assert.equal(parseCompanyScopeCookieSelection(companyId, tenantA), companyId);
  });
});
