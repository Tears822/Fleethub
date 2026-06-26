import { isPlatformMfaMandatory, isTenantAdminMfaMandatory } from "./security-env";

export type MfaUser = {
  totpEnabled: boolean;
  totpSecret?: string | null;
};

export function platformMustHaveMfaEnabled(): boolean {
  return isPlatformMfaMandatory();
}

/** True when the user has completed TOTP setup and must verify a code at login. */
export function shouldChallengeTotp(_kind: "tenant" | "platform", user: MfaUser): boolean {
  return user.totpEnabled === true && Boolean(user.totpSecret);
}

export function canIssueSessionWithoutTotp(kind: "tenant" | "platform", user: MfaUser): boolean {
  return !shouldChallengeTotp(kind, user);
}

/** Super Admin in production must enable 2FA after first password login. */
export function platformNeedsMfaSetup(user: MfaUser): boolean {
  return platformMustHaveMfaEnabled() && !user.totpEnabled;
}

/** Tenant Admin in production must enable 2FA before using the tenant panel. */
export function tenantAdminNeedsMfaSetup(role: string, user: MfaUser): boolean {
  return tenantAdminMustKeepTotp(role) && !user.totpEnabled;
}

export function tenantAdminMustKeepTotp(role: string): boolean {
  return isTenantAdminMfaMandatory() && role === "ADMIN_TENANT";
}
