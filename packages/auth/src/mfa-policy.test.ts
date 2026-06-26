import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canIssueSessionWithoutTotp,
  platformMustHaveMfaEnabled,
  platformNeedsMfaSetup,
  shouldChallengeTotp,
} from "./mfa-policy.js";

describe("mfa-policy", () => {
  const noTotp = { totpEnabled: false, totpSecret: null };
  const enabledTotp = { totpEnabled: true, totpSecret: "SECRET" };
  const enabledWithoutSecret = { totpEnabled: true, totpSecret: null };

  it("does not challenge when TOTP is disabled", () => {
    assert.equal(shouldChallengeTotp("platform", noTotp), false);
    assert.equal(shouldChallengeTotp("tenant", noTotp), false);
  });

  it("challenges only when TOTP is enabled and a secret exists", () => {
    assert.equal(shouldChallengeTotp("platform", enabledTotp), true);
    assert.equal(shouldChallengeTotp("tenant", enabledTotp), true);
    assert.equal(shouldChallengeTotp("platform", enabledWithoutSecret), false);
  });

  it("allows session without TOTP when not configured", () => {
    assert.equal(canIssueSessionWithoutTotp("platform", noTotp), true);
    assert.equal(canIssueSessionWithoutTotp("tenant", noTotp), true);
    assert.equal(canIssueSessionWithoutTotp("platform", enabledTotp), false);
  });

  it("platformNeedsMfaSetup is independent of shouldChallengeTotp", () => {
    assert.equal(platformNeedsMfaSetup(noTotp), platformMustHaveMfaEnabled());
    assert.equal(platformNeedsMfaSetup(enabledTotp), false);
  });
});
