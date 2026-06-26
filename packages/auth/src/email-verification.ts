import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import {
  AuthSubjectType,
  AuthTokenType,
  prisma,
  withoutTenant,
  writeAuditLog,
} from "@fleethub/db";
import { generateOpaqueToken, hashOpaqueToken } from "./crypto-tokens";
import { appPublicUrl, sendEmail } from "./email";
import { issuePasswordSetupToken } from "./password-reset";

const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;

function verificationLink(rawToken: string): string {
  return `${appPublicUrl()}/verificar-email?token=${rawToken}`;
}

async function invalidatePendingVerifyTokens(userId: string): Promise<void> {
  await prisma.authToken.updateMany({
    where: {
      type: AuthTokenType.EMAIL_VERIFY,
      subjectType: AuthSubjectType.TENANT_USER,
      subjectId: userId,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });
}

export async function issueTenantUserEmailVerification(
  userId: string,
  tenantSlug: string,
  opts?: { requirePasswordSetup?: boolean },
): Promise<string> {
  await invalidatePendingVerifyTokens(userId);
  const rawToken = generateOpaqueToken();
  await prisma.authToken.create({
    data: {
      type: AuthTokenType.EMAIL_VERIFY,
      subjectType: AuthSubjectType.TENANT_USER,
      subjectId: userId,
      tokenHash: hashOpaqueToken(rawToken),
      expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
      payload: {
        tenantSlug,
        requirePasswordSetup: opts?.requirePasswordSetup === true,
      },
    },
  });
  return rawToken;
}

export async function sendTenantUserVerificationEmail(input: {
  userId: string;
  email: string;
  tenantSlug: string;
  tenantName?: string;
  requirePasswordSetup?: boolean;
}): Promise<void> {
  const rawToken = await issueTenantUserEmailVerification(
    input.userId,
    input.tenantSlug,
    { requirePasswordSetup: input.requirePasswordSetup },
  );
  const link = verificationLink(rawToken);
  const who = input.tenantName?.trim() ? ` (${input.tenantName})` : "";
  const text = input.requirePasswordSetup
    ? `Has sido invitado a FleetHub${who}.\n\nVerifica tu email y crea tu contraseña:\n\n${link}\n\nEl enlace caduca en 48 horas.`
    : `Confirma tu dirección de email para acceder a FleetHub${who}.\n\n${link}\n\nEl enlace caduca en 48 horas.`;
  await sendEmail({
    to: input.email,
    subject: input.requirePasswordSetup
      ? "FleetHub — Activa tu cuenta"
      : "FleetHub — Verifica tu email",
    text,
  });
}

export async function verifyEmailWithToken(
  body: unknown,
): Promise<
  Result<
    {
      ok: true;
      tenantSlug: string;
      needsPasswordSetup: boolean;
      setupToken?: string;
    },
    { message: string }
  >
> {
  const token =
    typeof body === "object" && body !== null && "token" in body
      ? String((body as { token: string }).token)
      : "";
  if (!token.trim()) return err({ message: "Enlace no válido." });

  const row = await prisma.authToken.findFirst({
    where: {
      tokenHash: hashOpaqueToken(token),
      type: AuthTokenType.EMAIL_VERIFY,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!row) return err({ message: "Enlace no válido o expirado." });

  const user = await withoutTenant((tx) =>
    tx.user.findUnique({
      where: { id: row.subjectId },
      include: { tenant: { select: { id: true, slug: true } } },
    }),
  );
  if (!user?.tenant) return err({ message: "Usuario no encontrado." });

  const tokenPayload =
    row.payload && typeof row.payload === "object"
      ? (row.payload as { requirePasswordSetup?: boolean })
      : null;
  const hadPendingInvite = await tenantUserHasPendingInvite(user.id);
  const needsPasswordSetup =
    tokenPayload?.requirePasswordSetup === true || hadPendingInvite;

  await withoutTenant(
    (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      }),
    undefined,
    user.tenantId,
  );

  await prisma.authToken.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });

  if (hadPendingInvite) {
    await prisma.authToken.updateMany({
      where: {
        type: AuthTokenType.USER_INVITE,
        subjectType: AuthSubjectType.TENANT_USER,
        subjectId: user.id,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });
  }

  await writeAuditLog({
    tenantId: user.tenantId,
    actorUserId: user.id,
    action: "auth.email_verified",
    entityType: "user",
    entityId: user.id,
    payload: { email: user.email },
  });

  let setupToken: string | undefined;
  if (needsPasswordSetup) {
    setupToken = await issuePasswordSetupToken(AuthSubjectType.TENANT_USER, user.id);
  }

  return ok({
    ok: true,
    tenantSlug: user.tenant.slug,
    needsPasswordSetup,
    setupToken,
  });
}

export async function resendEmailVerification(
  body: unknown,
): Promise<Result<{ ok: true }, { message: string }>> {
  const email =
    typeof body === "object" && body !== null && "email" in body
      ? String((body as { email: string }).email).trim().toLowerCase()
      : "";
  if (!email) return err({ message: "Email obligatorio." });

  const user = await withoutTenant((tx) =>
    tx.user.findFirst({
      where: { email, isActive: true },
      include: { tenant: { select: { slug: true, name: true } } },
    }),
  );

  if (user && !user.emailVerifiedAt && user.tenant) {
    const pendingInvite = await prisma.authToken.findFirst({
      where: {
        type: AuthTokenType.USER_INVITE,
        subjectType: AuthSubjectType.TENANT_USER,
        subjectId: user.id,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    if (!pendingInvite) {
      await sendTenantUserVerificationEmail({
        userId: user.id,
        email: user.email,
        tenantSlug: user.tenant.slug,
        tenantName: user.tenant.name,
      });
    }
  }

  return ok({ ok: true });
}

export async function tenantUserHasPendingInvite(userId: string): Promise<boolean> {
  const row = await prisma.authToken.findFirst({
    where: {
      type: AuthTokenType.USER_INVITE,
      subjectType: AuthSubjectType.TENANT_USER,
      subjectId: userId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });
  return Boolean(row);
}
