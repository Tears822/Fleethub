/** Claims stored in the session JWT (HttpOnly cookie). */
export type AppSession = {
  sub: string;
  email: string;
  role: string;
  kind: "tenant" | "platform";
  /** Tenant user only */
  tid?: string;
  slug?: string;
  /** Display name (platform user or derived) */
  name?: string;
  /** Super Admin read-only view of a tenant (FRD §12.2). */
  impersonating?: boolean;
  platformActorSub?: string;
  platformActorEmail?: string;
};

export type AuthFailureReason =
  | "invalid_body"
  | "invalid_credentials"
  | "email_not_verified"
  | "pending_activation";

export type LoginSuccess = {
  token: string;
  role: string;
  kind: "tenant" | "platform";
  redirectTo: string;
  /** Present for tenant login */
  tenantSlug?: string;
  /** Platform Super Admin in production: must configure TOTP before using the panel */
  requiresMfaSetup?: boolean;
};

export type LoginRequires2fa = {
  requires2fa: true;
  pendingToken: string;
  kind: "tenant" | "platform";
  redirectTo: string;
  tenantSlug?: string;
};

export type LoginResponse = LoginSuccess | LoginRequires2fa;

export function isLoginRequires2fa(r: LoginResponse): r is LoginRequires2fa {
  return "requires2fa" in r && r.requires2fa === true;
}
