import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { Prisma } from "@prisma/client";
import { AuthSubjectType, TenantRole, prisma, writeAuditLog } from "@fleethub/db";
import { emailConflictMessage, findEmailAccountConflict } from "./email-uniqueness";
import { generateRandomPassword, hashPassword, validatePasswordStrength } from "./password-policy";
import { performTenantUserDeletion, updateTenantUser } from "./tenant-users";
import type { AppSession } from "./types";

type UpdatePlatformUserBody = {
  email?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  password?: string;
};

export async function updatePlatformUserForSuperAdmin(
  session: AppSession,
  userId: string,
  body: unknown,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }

  const b = body as UpdatePlatformUserBody;
  const email = b.email?.trim().toLowerCase();
  const firstName = b.firstName?.trim();
  const lastName = b.lastName?.trim();
  const isActive = typeof b.isActive === "boolean" ? b.isActive : undefined;
  const password = b.password?.trim();

  const target = await prisma.platformUser.findUnique({ where: { id: userId } });
  if (!target) return err({ message: "Usuario no encontrado." });

  if (email !== undefined) {
    if (!email) return err({ message: "El email es obligatorio." });
    if (email !== target.email) {
      const conflict = await findEmailAccountConflict(email, { platformUserId: userId });
      if (conflict) return err({ message: emailConflictMessage(conflict) });
    }
  }

  if (password) {
    const policyErr = validatePasswordStrength(password);
    if (policyErr) return err({ message: policyErr });
  }

  if (firstName !== undefined && !firstName) {
    return err({ message: "El nombre es obligatorio." });
  }

  await prisma.platformUser.update({
    where: { id: userId },
    data: {
      ...(email !== undefined ? { email } : {}),
      ...(firstName !== undefined ? { firstName } : {}),
      ...(lastName !== undefined ? { lastName: lastName || null } : {}),
      ...(isActive !== undefined ? { isActive } : {}),
      ...(password ? { passwordHash: hashPassword(password) } : {}),
    },
  });

  await writeAuditLog({
    actorUserId: session.sub,
    action: "platform_user.update",
    entityType: "platform_user",
    entityId: userId,
    payload: { email, isActive },
  });

  return ok({ ok: true });
}

export async function updateTenantUserForSuperAdmin(
  session: AppSession,
  tenantId: string,
  userId: string,
  body: unknown,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }
  if (!tenantId) return err({ message: "Tenant no válido." });

  return updateTenantUser(session, userId, body, { asSuperAdmin: true, tenantId });
}

export async function deletePlatformUserForSuperAdmin(
  session: AppSession,
  userId: string,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }
  if (userId === session.sub) {
    return err({ message: "No puedes eliminar tu propia cuenta." });
  }

  const target = await prisma.platformUser.findUnique({ where: { id: userId } });
  if (!target) return err({ message: "Usuario no encontrado." });

  const otherActive = await prisma.platformUser.count({
    where: { isActive: true, NOT: { id: userId } },
  });
  if (target.isActive && otherActive === 0) {
    return err({ message: "Debe quedar al menos un Super Admin activo." });
  }

  await prisma.authToken.deleteMany({
    where: { subjectType: AuthSubjectType.PLATFORM_USER, subjectId: userId },
  });
  await prisma.platformUser.delete({ where: { id: userId } });

  await writeAuditLog({
    actorUserId: session.sub,
    action: "platform_user.delete",
    entityType: "platform_user",
    entityId: userId,
    payload: { email: target.email },
  });

  return ok({ ok: true });
}

export async function deleteTenantUserForSuperAdmin(
  session: AppSession,
  tenantId: string,
  userId: string,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }
  if (!tenantId) return err({ message: "Tenant no válido." });
  if (!userId) return err({ message: "Usuario no válido." });

  return performTenantUserDeletion(
    tenantId,
    userId,
    session.sub,
    "user.delete.super_admin",
  );
}

const clearTotpData = {
  totpSecret: null,
  totpEnabled: false,
  totpBackupHashes: Prisma.DbNull,
} as const;

/** Super Admin: quita 2FA para que el usuario pueda configurarlo de nuevo (soporte sin borrar cuenta). */
export async function resetTotpForSuperAdmin(
  session: AppSession,
  target: { kind: "platform" | "tenant"; userId: string; tenantId?: string },
): Promise<Result<{ ok: true; wasEnabled: boolean }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }

  if (target.kind === "platform") {
    const user = await prisma.platformUser.findUnique({
      where: { id: target.userId },
      select: { id: true, email: true, totpEnabled: true },
    });
    if (!user) return err({ message: "Usuario no encontrado." });

    await prisma.platformUser.update({
      where: { id: user.id },
      data: clearTotpData,
    });

    await writeAuditLog({
      actorUserId: session.sub,
      action: "platform_user.totp.reset",
      entityType: "platform_user",
      entityId: user.id,
      payload: { email: user.email, previousEnabled: user.totpEnabled },
    });

    return ok({ ok: true, wasEnabled: user.totpEnabled });
  }

  const tenantId = target.tenantId?.trim();
  if (!tenantId) return err({ message: "Tenant no válido." });

  const user = await prisma.user.findFirst({
    where: { id: target.userId, tenantId },
    select: { id: true, email: true, totpEnabled: true, tenantId: true },
  });
  if (!user) return err({ message: "Usuario no encontrado." });

  await prisma.user.update({
    where: { id: user.id },
    data: clearTotpData,
  });

  await writeAuditLog({
    tenantId: user.tenantId,
    actorUserId: session.sub,
    action: "user.totp.reset",
    entityType: "user",
    entityId: user.id,
    payload: { email: user.email, previousEnabled: user.totpEnabled, by: "super_admin" },
  });

  return ok({ ok: true, wasEnabled: user.totpEnabled });
}

const clearTotpOnPasswordReset = {
  totpSecret: null,
  totpEnabled: false,
  totpBackupHashes: Prisma.DbNull,
} as const;

/** Super Admin: set a new login password (generates one if omitted). */
export async function resetPasswordForSuperAdmin(
  session: AppSession,
  target: { kind: "platform" | "tenant"; userId: string; tenantId?: string },
  body?: { password?: string },
): Promise<Result<{ password: string; email: string }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }

  const requested = body?.password?.trim();
  const password = requested && requested.length > 0 ? requested : generateRandomPassword();
  const policyErr = validatePasswordStrength(password);
  if (policyErr) return err({ message: policyErr });

  const passwordHash = hashPassword(password);

  if (target.kind === "platform") {
    const user = await prisma.platformUser.findUnique({
      where: { id: target.userId },
      select: { id: true, email: true, isActive: true },
    });
    if (!user) return err({ message: "Usuario no encontrado." });

    await prisma.platformUser.update({
      where: { id: user.id },
      data: { passwordHash, ...clearTotpOnPasswordReset },
    });

    await writeAuditLog({
      actorUserId: session.sub,
      action: "platform_user.password.reset",
      entityType: "platform_user",
      entityId: user.id,
      payload: { email: user.email, generated: !requested },
    });

    return ok({ password, email: user.email });
  }

  const tenantId = target.tenantId?.trim();
  if (!tenantId) return err({ message: "Tenant no válido." });

  const user = await prisma.user.findFirst({
    where: { id: target.userId, tenantId },
    select: { id: true, email: true, tenantId: true, emailVerifiedAt: true },
  });
  if (!user) return err({ message: "Usuario no encontrado." });

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash,
      ...clearTotpOnPasswordReset,
      isActive: true,
      emailVerifiedAt: user.emailVerifiedAt ?? new Date(),
    },
  });

  await writeAuditLog({
    tenantId: user.tenantId,
    actorUserId: session.sub,
    action: "user.password.reset",
    entityType: "user",
    entityId: user.id,
    payload: { email: user.email, generated: !requested, by: "super_admin" },
  });

  return ok({ password, email: user.email });
}
