import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { Prisma } from "@prisma/client";
import {
  AuthSubjectType,
  AuthTokenType,
  TenantRole,
  prisma,
  withTenant,
  withoutTenant,
  writeAuditLog,
} from "@fleethub/db";
import { generateOpaqueToken, hashOpaqueToken } from "./crypto-tokens";
import { emailConflictMessage, findEmailAccountConflict } from "./email-uniqueness";
import { sendTenantUserVerificationEmail } from "./email-verification";
import { hashPassword, validatePasswordStrength } from "./password-policy";
import type { AppSession } from "./types";

function normalizeEmail(raw: unknown): string {
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Drop assignments to inactive companies or rows outside the user's tenant. */
async function pruneInvalidUserCompanyLinks(
  tx: Prisma.TransactionClient,
  userId: string,
  tenantId: string,
): Promise<void> {
  await tx.userCompany.deleteMany({
    where: {
      userId,
      company: {
        OR: [{ isActive: false }, { tenantId: { not: tenantId } }],
      },
    },
  });
}

export async function inviteTenantUser(
  session: AppSession,
  body: unknown,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid || session.role !== TenantRole.ADMIN_TENANT) {
    return err({ message: "No autorizado." });
  }

  const email =
    typeof body === "object" && body !== null && "email" in body
      ? String((body as { email: string }).email).trim().toLowerCase()
      : "";
  const roleRaw =
    typeof body === "object" && body !== null && "role" in body
      ? String((body as { role: string }).role)
      : TenantRole.GESTOR;
  const companyIds =
    typeof body === "object" && body !== null && "companyIds" in body
      ? (body as { companyIds: string[] }).companyIds
      : [];
  const firstName =
    typeof body === "object" && body !== null && "firstName" in body
      ? String((body as { firstName: string }).firstName).trim()
      : "";
  const lastName =
    typeof body === "object" && body !== null && "lastName" in body
      ? String((body as { lastName: string }).lastName).trim()
      : "";

  if (!email) return err({ message: "Email obligatorio." });
  if (!isValidEmail(email)) return err({ message: "Email no válido." });

  const emailConflict = await findEmailAccountConflict(email);
  if (emailConflict) {
    return err({ message: emailConflictMessage(emailConflict) });
  }

  const role =
    roleRaw === TenantRole.ADMIN_TENANT ||
    roleRaw === TenantRole.GESTOR ||
    roleRaw === TenantRole.SOLO_LECTURA
      ? roleRaw
      : TenantRole.GESTOR;

  return withTenant(session.tid, async (tx) => {

    const companies = await tx.company.findMany({
      where: { tenantId: session.tid!, id: { in: companyIds }, isActive: true },
    });
    if (companyIds.length > 0 && companies.length !== companyIds.length) {
      return err({ message: "Empresa no válida." });
    }

    const tempPassword = generateOpaqueToken().slice(0, 16);
    const passwordHash = hashPassword(tempPassword);

    const tenant = await tx.tenant.findUnique({
      where: { id: session.tid! },
      select: { slug: true, name: true, locale: true },
    });
    if (!tenant) return err({ message: "Tenant no encontrado." });

    const user = await tx.user.create({
      data: {
        tenantId: session.tid!,
        email,
        passwordHash,
        role,
        firstName: firstName || null,
        lastName: lastName || null,
        locale: tenant.locale,
        isActive: true,
      },
    });

    if (companyIds.length === 0) {
      return err({ message: "Asigna al menos una empresa." });
    }
    await tx.userCompany.createMany({
      data: companyIds.map((companyId) => ({ userId: user.id, companyId })),
    });

    await sendTenantUserVerificationEmail({
      userId: user.id,
      email: user.email,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      requirePasswordSetup: true,
    });

    await writeAuditLog({
      tenantId: session.tid,
      actorUserId: session.sub,
      action: "user.invite",
      entityType: "user",
      entityId: user.id,
      payload: { email, role },
    });

    return ok({ ok: true });
  });
}

export async function activateInvitedUser(
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

  const row = await prisma.authToken.findFirst({
    where: {
      tokenHash: hashOpaqueToken(token),
      type: AuthTokenType.USER_INVITE,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
  });

  if (!row) return err({ message: "Invitación no válida o expirada." });

  const user = await withoutTenant((tx) =>
    tx.user.findUnique({
      where: { id: row.subjectId },
      select: { id: true, tenantId: true },
    }),
  );
  if (!user) return err({ message: "Usuario no encontrado." });

  await withoutTenant(
    (tx) =>
      tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash: hashPassword(password),
          emailVerifiedAt: new Date(),
        },
      }),
    undefined,
    user.tenantId,
  );

  await prisma.authToken.update({
    where: { id: row.id },
    data: { consumedAt: new Date() },
  });

  return ok({ ok: true });
}

export async function resendTenantUserInvite(
  session: AppSession,
  userId: string,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid || session.role !== TenantRole.ADMIN_TENANT) {
    return err({ message: "No autorizado." });
  }

  if (!userId) return err({ message: "Usuario no válido." });

  return withTenant(session.tid, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, tenantId: session.tid! },
    });
    if (!user) return err({ message: "Usuario no encontrado." });
    if (!user.isActive) return err({ message: "El usuario está inactivo." });
    if (user.emailVerifiedAt) {
      return err({ message: "Este usuario ya activó su cuenta." });
    }

    const tenant = await tx.tenant.findUnique({
      where: { id: session.tid! },
      select: { slug: true, name: true },
    });
    if (!tenant) return err({ message: "Tenant no encontrado." });

    const tempPassword = generateOpaqueToken().slice(0, 16);
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(tempPassword) },
    });

    await prisma.authToken.updateMany({
      where: {
        type: AuthTokenType.USER_INVITE,
        subjectType: AuthSubjectType.TENANT_USER,
        subjectId: user.id,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    await sendTenantUserVerificationEmail({
      userId: user.id,
      email: user.email,
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
      requirePasswordSetup: true,
    });

    await writeAuditLog({
      tenantId: session.tid,
      actorUserId: session.sub,
      action: "user.invite.resend",
      entityType: "user",
      entityId: user.id,
      payload: { email: user.email },
    });

    return ok({ ok: true });
  });
}

export async function updateTenantUser(
  session: AppSession,
  userId: string,
  body: unknown,
  opts?: { asSuperAdmin?: boolean; tenantId?: string },
): Promise<Result<{ ok: true }, { message: string }>> {
  const asSuperAdmin = Boolean(opts?.asSuperAdmin && session.kind === "platform");
  const tenantId = asSuperAdmin ? opts?.tenantId : session.kind === "tenant" ? session.tid : undefined;

  if (!asSuperAdmin && (session.kind !== "tenant" || !session.tid || session.role !== TenantRole.ADMIN_TENANT)) {
    return err({ message: "No autorizado." });
  }
  if (asSuperAdmin && !tenantId) {
    return err({ message: "Tenant no válido." });
  }
  if (!tenantId) {
    return err({ message: "No autorizado." });
  }

  if (!userId) return err({ message: "Usuario no válido." });

  const b = body as Record<string, unknown>;
  const roleRaw = typeof b.role === "string" ? b.role : undefined;
  const isActive = typeof b.isActive === "boolean" ? b.isActive : undefined;
  const companyIds = Array.isArray(b.companyIds)
    ? (b.companyIds as string[]).filter((id) => typeof id === "string")
    : undefined;
  const firstName =
    typeof b.firstName === "string" ? b.firstName.trim() : undefined;
  const lastName = typeof b.lastName === "string" ? b.lastName.trim() : undefined;
  const emailRaw = "email" in b ? b.email : undefined;
  const email = emailRaw !== undefined ? normalizeEmail(emailRaw) : undefined;
  const passwordRaw = typeof b.password === "string" ? b.password.trim() : undefined;
  const password = passwordRaw && passwordRaw.length > 0 ? passwordRaw : undefined;

  if (password && !asSuperAdmin) {
    return err({ message: "No autorizado." });
  }
  if (password) {
    const policyErr = validatePasswordStrength(password);
    if (policyErr) return err({ message: policyErr });
  }

  const role =
    roleRaw === TenantRole.ADMIN_TENANT ||
    roleRaw === TenantRole.GESTOR ||
    roleRaw === TenantRole.SOLO_LECTURA
      ? roleRaw
      : undefined;

  return withTenant(tenantId, async (tx) => {
    const target = await tx.user.findFirst({
      where: { id: userId, tenantId },
    });
    if (!target) return err({ message: "Usuario no encontrado." });

    if (!asSuperAdmin && userId === session.sub) {
      if (isActive === false) {
        return err({ message: "No puedes desactivar tu propia cuenta." });
      }
      if (role && role !== TenantRole.ADMIN_TENANT) {
        return err({ message: "No puedes cambiar tu propio rol." });
      }
    }

    const activeAdmins = await tx.user.count({
      where: {
        tenantId,
        role: TenantRole.ADMIN_TENANT,
        isActive: true,
        NOT: { id: userId },
      },
    });

    const willBeAdmin = role ? role === TenantRole.ADMIN_TENANT : target.role === TenantRole.ADMIN_TENANT;
    const willBeActive = isActive !== undefined ? isActive : target.isActive;

    if (target.role === TenantRole.ADMIN_TENANT && (!willBeAdmin || !willBeActive) && activeAdmins === 0) {
      return err({ message: "Debe quedar al menos un administrador activo." });
    }

    if (companyIds !== undefined) {
      const companies = await tx.company.findMany({
        where: { tenantId, id: { in: companyIds }, isActive: true },
      });
      if (companyIds.length === 0) {
        return err({ message: "Asigna al menos una empresa." });
      }
      if (companies.length !== companyIds.length) {
        return err({ message: "Empresa no válida." });
      }
    }

    if (email !== undefined) {
      if (!email) return err({ message: "Email obligatorio." });
      if (!isValidEmail(email)) return err({ message: "Email no válido." });
      if (email !== target.email.toLowerCase()) {
        const emailConflict = await findEmailAccountConflict(email, { tenantUserId: userId });
        if (emailConflict) {
          return err({ message: emailConflictMessage(emailConflict) });
        }
      }
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        ...(role !== undefined ? { role } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(firstName !== undefined ? { firstName: firstName || null } : {}),
        ...(lastName !== undefined ? { lastName: lastName || null } : {}),
        ...(email !== undefined && email !== target.email.toLowerCase()
          ? { email, emailVerifiedAt: null }
          : {}),
        ...(password
          ? {
              passwordHash: hashPassword(password),
              totpEnabled: false,
              totpSecret: null,
              totpBackupHashes: Prisma.DbNull,
              emailVerifiedAt: target.emailVerifiedAt ?? new Date(),
            }
          : {}),
      },
    });

    if (companyIds !== undefined) {
      await tx.userCompany.deleteMany({ where: { userId } });
      await tx.userCompany.createMany({
        data: companyIds.map((companyId) => ({ userId, companyId })),
      });
    } else {
      await pruneInvalidUserCompanyLinks(tx, userId, tenantId);
    }

    await writeAuditLog({
      tenantId,
      actorUserId: session.sub,
      action: asSuperAdmin ? "user.update.super_admin" : "user.update",
      entityType: "user",
      entityId: userId,
      payload: { role, isActive, companyIds, email, asSuperAdmin, passwordChanged: Boolean(password) },
    });

    if (email !== undefined && email !== target.email.toLowerCase()) {
      const tenant = await tx.tenant.findUnique({
        where: { id: tenantId },
        select: { slug: true, name: true },
      });
      if (tenant) {
        await sendTenantUserVerificationEmail({
          userId,
          email,
          tenantSlug: tenant.slug,
          tenantName: tenant.name,
        });
      }
    }

    return ok({ ok: true });
  });
}

export async function performTenantUserDeletion(
  tenantId: string,
  userId: string,
  actorUserId: string,
  auditAction: string,
): Promise<Result<{ ok: true }, { message: string }>> {
  return withTenant(tenantId, async (tx) => {
    const target = await tx.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, email: true, role: true, isActive: true },
    });
    if (!target) return err({ message: "Usuario no encontrado." });

    const otherActiveAdmins = await tx.user.count({
      where: {
        tenantId,
        role: TenantRole.ADMIN_TENANT,
        isActive: true,
        NOT: { id: userId },
      },
    });
    if (
      target.role === TenantRole.ADMIN_TENANT &&
      target.isActive &&
      otherActiveAdmins === 0
    ) {
      return err({ message: "Debe quedar al menos un administrador activo." });
    }

    await prisma.authToken.deleteMany({
      where: { subjectType: AuthSubjectType.TENANT_USER, subjectId: userId },
    });
    await tx.user.delete({ where: { id: userId } });

    await writeAuditLog({
      tenantId,
      actorUserId,
      action: auditAction,
      entityType: "user",
      entityId: userId,
      payload: { email: target.email },
    });

    return ok({ ok: true });
  });
}

export async function deleteTenantUser(
  session: AppSession,
  userId: string,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid || session.role !== TenantRole.ADMIN_TENANT) {
    return err({ message: "No autorizado." });
  }
  if (!userId) return err({ message: "Usuario no válido." });
  if (userId === session.sub) {
    return err({ message: "No puedes eliminar tu propia cuenta." });
  }

  return performTenantUserDeletion(session.tid, userId, session.sub, "user.delete");
}
