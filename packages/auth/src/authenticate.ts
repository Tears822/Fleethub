import { compare } from "bcryptjs";
import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { prisma, withoutTenant, writeAuditLog } from "@fleethub/db";
import type { TenantAccessRow } from "./tenant-commercial-access";
import { loginRequestSchema } from "./login.schema";
import { isLoginLocked, LOGIN_LOCKOUT_SCOPE, recordLoginAttempt } from "./login-guard";
import {
  platformNeedsMfaSetup,
  shouldChallengeTotp,
  tenantAdminNeedsMfaSetup,
} from "./mfa-policy";
import { signPending2faToken } from "./pending-2fa-jwt";
import { signSessionToken } from "./session-jwt";
import { tenantUserHasPendingInvite } from "./email-verification";
import { tenantLoginBlockedMessage } from "./tenant-commercial-access";
import type { AppSession, AuthFailureReason, LoginResponse, LoginSuccess } from "./types";

export type AuthFailure = { reason: AuthFailureReason | "locked"; message: string };

type LoginFailureReason = AuthFailureReason | "locked";

async function recordTenantLoginFailureAudit(input: {
  tenantId: string;
  actorUserId: string;
  reason: LoginFailureReason;
  ip?: string | null;
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: "auth.login.failed",
    ip: input.ip,
    payload: { reason: input.reason },
  });
}

async function recordPlatformLoginFailureAudit(input: {
  actorUserId: string;
  reason: LoginFailureReason;
  ip?: string | null;
}): Promise<void> {
  await writeAuditLog({
    actorUserId: input.actorUserId,
    action: "auth.login.failed",
    ip: input.ip,
    payload: { kind: "platform", reason: input.reason },
  });
}

async function buildPlatformSession(
  user: {
    id: string;
    email: string;
    role: string;
    firstName: string | null;
    lastName: string | null;
  },
  options?: { requiresMfaSetup?: boolean },
): Promise<LoginSuccess> {
  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email.split("@")[0];

  const sessionPayload: AppSession = {
    sub: user.id,
    email: user.email,
    role: user.role,
    kind: "platform",
    name: displayName,
  };

  const token = await signSessionToken(sessionPayload);
  return {
    token,
    role: user.role,
    kind: "platform",
    redirectTo: options?.requiresMfaSetup ? "/super-admin/seguridad" : "/super-admin",
    requiresMfaSetup: options?.requiresMfaSetup,
  };
}

async function authenticatePlatformUser(
  user: {
    id: string;
    email: string;
    passwordHash: string;
    role: string;
    firstName: string | null;
    lastName: string | null;
    isActive: boolean;
    totpEnabled: boolean;
    totpSecret: string | null;
  },
  password: string,
  emailNorm: string,
  ip?: string | null,
): Promise<Result<LoginResponse, AuthFailure>> {
  if (!user.isActive) {
    await recordLoginAttempt({ email: emailNorm, ip, success: false });
    await recordPlatformLoginFailureAudit({
      actorUserId: user.id,
      reason: "invalid_credentials",
      ip,
    });
    return err({ reason: "invalid_credentials", message: "Credenciales incorrectos" });
  }

  const passwordOk = await compare(password, user.passwordHash);
  if (!passwordOk) {
    await recordLoginAttempt({ email: emailNorm, ip, success: false });
    await recordPlatformLoginFailureAudit({
      actorUserId: user.id,
      reason: "invalid_credentials",
      ip,
    });
    return err({ reason: "invalid_credentials", message: "Credenciales incorrectos" });
  }

  await recordLoginAttempt({ email: emailNorm, ip, success: true });

  if (shouldChallengeTotp("platform", user)) {
    const pendingToken = await signPending2faToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      kind: "platform",
      name: [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || undefined,
    });
    return ok({
      requires2fa: true,
      pendingToken,
      kind: "platform",
      redirectTo: "/super-admin",
    });
  }

  const session = await buildPlatformSession(user, {
    requiresMfaSetup: platformNeedsMfaSetup(user) || undefined,
  });
  await writeAuditLog({
    actorUserId: user.id,
    action: "auth.login",
    ip,
    payload: { kind: "platform", requiresMfaSetup: session.requiresMfaSetup ?? false },
  });
  return ok(session);
}

async function authenticateTenantUser(
  user: {
    id: string;
    email: string;
    passwordHash: string;
    role: string;
    isActive: boolean;
    totpEnabled: boolean;
    totpSecret: string | null;
    tenantId: string;
    emailVerifiedAt: Date | null;
  },
  tenant: TenantAccessRow & { id: string; slug: string },
  password: string,
  emailNorm: string,
  ip?: string | null,
): Promise<Result<LoginResponse, AuthFailure>> {
  const blocked = tenantLoginBlockedMessage(tenant);
  if (blocked) {
    await recordLoginAttempt({ email: emailNorm, ip, success: false });
    await recordTenantLoginFailureAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      reason: "invalid_credentials",
      ip,
    });
    return err({ reason: "invalid_credentials", message: blocked });
  }

  if (!user.isActive) {
    await recordLoginAttempt({ email: emailNorm, ip, success: false });
    await recordTenantLoginFailureAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      reason: "invalid_credentials",
      ip,
    });
    return err({ reason: "invalid_credentials", message: "Credenciales incorrectos" });
  }

  const passwordOk = await compare(password, user.passwordHash);
  if (!passwordOk) {
    await recordLoginAttempt({ email: emailNorm, ip, success: false });
    await recordTenantLoginFailureAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      reason: "invalid_credentials",
      ip,
    });
    return err({ reason: "invalid_credentials", message: "Credenciales incorrectos" });
  }

  if (!user.emailVerifiedAt) {
    if (await tenantUserHasPendingInvite(user.id)) {
      await recordLoginAttempt({ email: emailNorm, ip, success: false });
      await recordTenantLoginFailureAudit({
        tenantId: tenant.id,
        actorUserId: user.id,
        reason: "pending_activation",
        ip,
      });
      return err({
        reason: "pending_activation",
        message:
          "Verifica tu email con el enlace recibido y crea tu contraseña antes de iniciar sesión.",
      });
    }
    await recordLoginAttempt({ email: emailNorm, ip, success: false });
    await recordTenantLoginFailureAudit({
      tenantId: tenant.id,
      actorUserId: user.id,
      reason: "email_not_verified",
      ip,
    });
    return err({
      reason: "email_not_verified",
      message:
        "Verifica tu email antes de iniciar sesión. Revisa tu bandeja o solicita un nuevo enlace.",
    });
  }

  await recordLoginAttempt({ email: emailNorm, ip, success: true });

  if (shouldChallengeTotp("tenant", user)) {
    const pendingToken = await signPending2faToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      kind: "tenant",
      tid: tenant.id,
      slug: tenant.slug,
    });
    return ok({
      requires2fa: true,
      pendingToken,
      kind: "tenant",
      redirectTo: "/dashboard",
      tenantSlug: tenant.slug,
    });
  }

  const sessionPayload: AppSession = {
    sub: user.id,
    tid: tenant.id,
    role: user.role,
    email: user.email,
    slug: tenant.slug,
    kind: "tenant",
  };

  const token = await signSessionToken(sessionPayload);

  await writeAuditLog({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "auth.login",
    ip,
  });

  const needsMfaSetup = tenantAdminNeedsMfaSetup(user.role, user);

  return ok({
    token,
    tenantSlug: tenant.slug,
    role: user.role,
    kind: "tenant",
    redirectTo: "/dashboard",
    requiresMfaSetup: needsMfaSetup || undefined,
  });
}

/**
 * Authenticates tenant or platform user by email + password (email unique platform-wide).
 * Optional 2FA challenge unchanged.
 */
export async function authenticateLogin(
  body: unknown,
  ip?: string | null,
): Promise<Result<LoginResponse, AuthFailure>> {
  const parsed = loginRequestSchema.safeParse(body);
  if (!parsed.success) {
    return err({ reason: "invalid_body", message: "Datos inválidos" });
  }

  const { email, password } = parsed.data;
  const emailNorm = email.trim().toLowerCase();

  if (await isLoginLocked(emailNorm, LOGIN_LOCKOUT_SCOPE)) {
    return err({ reason: "locked", message: "Demasiados intentos. Espera 15 minutos." });
  }

  const platformUser = await prisma.platformUser.findUnique({
    where: { email: emailNorm },
  });
  if (platformUser) {
    return authenticatePlatformUser(platformUser, password, emailNorm, ip);
  }

  // Pre-auth lookup: fleethub_app has no app.tenant_id yet — use super_admin read scope.
  const tenantUser = await withoutTenant((tx) =>
    tx.user.findFirst({
      where: { email: emailNorm },
      include: { tenant: true },
    }),
  );
  if (tenantUser?.tenant) {
    return authenticateTenantUser(tenantUser, tenantUser.tenant, password, emailNorm, ip);
  }

  await recordLoginAttempt({ email: emailNorm, ip, success: false });
  return err({ reason: "invalid_credentials", message: "Credenciales incorrectos" });
}
