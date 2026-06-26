import { hashSync } from "bcryptjs";
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
import { validatePasswordStrength } from "./password-policy";

const RESET_TTL_MS = 24 * 60 * 60 * 1000;

/** Short-lived token so a verified user can set their first password (invite / post-verify flow). */
export async function issuePasswordSetupToken(
  subjectType: AuthSubjectType,
  subjectId: string,
): Promise<string> {
  const rawToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(rawToken);

  await prisma.authToken.updateMany({
    where: {
      type: AuthTokenType.PASSWORD_RESET,
      subjectType,
      subjectId,
      consumedAt: null,
    },
    data: { consumedAt: new Date() },
  });

  await prisma.authToken.create({
    data: {
      type: AuthTokenType.PASSWORD_RESET,
      subjectType,
      subjectId,
      tokenHash,
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
      payload: { purpose: "initial_setup" },
    },
  });

  return rawToken;
}

export async function requestPasswordReset(body: unknown): Promise<Result<{ ok: true }, { message: string }>> {
  const email =
    typeof body === "object" && body !== null && "email" in body
      ? String((body as { email: string }).email).trim().toLowerCase()
      : "";

  if (!email) {
    return err({ message: "Email obligatorio." });
  }

  const rawToken = generateOpaqueToken();
  const tokenHash = hashOpaqueToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);

  const platformUser = await prisma.platformUser.findUnique({ where: { email } });
  if (platformUser?.isActive) {
    await prisma.authToken.create({
      data: {
        type: AuthTokenType.PASSWORD_RESET,
        subjectType: AuthSubjectType.PLATFORM_USER,
        subjectId: platformUser.id,
        tokenHash,
        expiresAt,
      },
    });
    const link = `${appPublicUrl()}/restablecer-contrasena?token=${rawToken}&scope=platform`;
    await sendEmail({
      to: email,
      subject: "FleetHub — Restablecer contraseña",
      text: `Usa este enlace en las próximas 24 horas:\n${link}`,
    });
    return ok({ ok: true });
  }

  const tenantUser = await withoutTenant((tx) =>
    tx.user.findFirst({
      where: { email, isActive: true },
      select: { id: true, tenantId: true },
    }),
  );

  if (tenantUser) {
    await prisma.authToken.create({
      data: {
        type: AuthTokenType.PASSWORD_RESET,
        subjectType: AuthSubjectType.TENANT_USER,
        subjectId: tenantUser.id,
        tokenHash,
        expiresAt,
      },
    });
    const link = `${appPublicUrl()}/restablecer-contrasena?token=${rawToken}&scope=tenant`;
    await sendEmail({
      to: email,
      subject: "FleetHub — Restablecer contraseña",
      text: `Usa este enlace en las próximas 24 horas:\n${link}`,
    });
  }

  return ok({ ok: true });
}

export async function confirmPasswordReset(
  body: unknown,
): Promise<Result<{ ok: true }, { message: string }>> {
  const token =
    typeof body === "object" && body !== null && "token" in body
      ? String((body as { token: string }).token)
      : "";
  const password =
    typeof body === "object" && body !== null && "password" in body
      ? String((body as { password: string }).password)
      : "";

  const policyErr = validatePasswordStrength(password);
  if (policyErr) return err({ message: policyErr });
  if (!token) return err({ message: "Token inválido." });

  const tokenHash = hashOpaqueToken(token);
  const row = await prisma.authToken.findFirst({
    where: {
      tokenHash,
      type: AuthTokenType.PASSWORD_RESET,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!row) {
    return err({ message: "El enlace ha expirado o no es válido." });
  }

  const passwordHash = hashSync(password, 12);
  const isInitialSetup =
    row.payload &&
    typeof row.payload === "object" &&
    (row.payload as { purpose?: string }).purpose === "initial_setup";

  if (row.subjectType === AuthSubjectType.PLATFORM_USER) {
    const platformUser = await prisma.platformUser.findUnique({ where: { id: row.subjectId } });
    if (!platformUser) return err({ message: "Usuario no encontrado." });
    await prisma.platformUser.update({
      where: { id: row.subjectId },
      data: {
        passwordHash,
        emailVerifiedAt: platformUser.emailVerifiedAt ?? new Date(),
      },
    });
  } else {
    const user = await withoutTenant((tx) =>
      tx.user.findUnique({
        where: { id: row.subjectId },
        select: { id: true, tenantId: true, emailVerifiedAt: true },
      }),
    );
    if (!user) return err({ message: "Usuario no encontrado." });
    await withoutTenant(
      (tx) =>
        tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash,
            emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
          },
        }),
      undefined,
      user.tenantId,
    );
    if (isInitialSetup) {
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
      action: isInitialSetup ? "auth.password_setup" : "auth.password_reset",
    });
  }

  await prisma.authToken.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });

  return ok({ ok: true });
}
