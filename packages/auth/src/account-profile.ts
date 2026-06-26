import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { Prisma } from "@prisma/client";
import { compareSync, hashSync } from "bcryptjs";
import { prisma, withTenant, writeAuditLog } from "@fleethub/db";
import { validatePasswordStrength } from "./password-policy";
import type { AppSession } from "./types";

type ProfileBody = {
  firstName?: string;
  lastName?: string;
};

type PasswordBody = {
  currentPassword?: string;
  newPassword?: string;
};

function verifyPassword(plain: string, hash: string): boolean {
  if (!plain || !hash) return false;
  try {
    return compareSync(plain, hash);
  } catch {
    return false;
  }
}

function profileSaveErrorMessage(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return "No autorizado.";
    return "No se pudieron guardar los datos.";
  }
  return "No se pudieron guardar los datos.";
}

export type AccountProfile = {
  firstName: string;
  lastName: string;
};

export async function getAccountProfile(
  session: AppSession,
): Promise<Result<AccountProfile, { message: string }>> {
  if (session.kind === "platform") {
    const user = await prisma.platformUser.findUnique({
      where: { id: session.sub },
      select: { firstName: true, lastName: true },
    });
    if (!user) return err({ message: "No autorizado." });
    return ok({
      firstName: user.firstName?.trim() ?? "",
      lastName: user.lastName?.trim() ?? "",
    });
  }

  if (!session.tid) {
    return err({ message: "No autorizado." });
  }

  return withTenant(session.tid, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: session.sub },
      select: { firstName: true, lastName: true },
    });
    if (!user) return err({ message: "No autorizado." });
    return ok({
      firstName: user.firstName?.trim() ?? "",
      lastName: user.lastName?.trim() ?? "",
    });
  });
}

export function accountDisplayName(
  profile: AccountProfile,
  email: string,
): string {
  const full = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
  return full || email.split("@")[0] || "Usuario";
}

export async function updateAccountProfile(
  session: AppSession,
  body: unknown,
): Promise<Result<{ firstName: string | null; lastName: string | null }, { message: string }>> {
  const b = body as ProfileBody;
  const firstName = b.firstName?.trim() ?? "";
  const lastName = b.lastName?.trim() ?? "";

  if (!firstName) {
    return err({ message: "El nombre es obligatorio." });
  }

  if (session.kind === "platform") {
    const user = await prisma.platformUser.update({
      where: { id: session.sub },
      data: { firstName, lastName: lastName || null },
      select: { firstName: true, lastName: true },
    });
    return ok({ firstName: user.firstName, lastName: user.lastName });
  }

  if (!session.tid) {
    return err({ message: "No autorizado." });
  }

  if (session.impersonating) {
    return err({ message: "No puedes editar el perfil en modo solo lectura." });
  }

  return withTenant(session.tid, async (tx) => {
    const existing = await tx.user.findFirst({
      where: { id: session.sub },
      select: { id: true },
    });
    if (!existing) return err({ message: "No autorizado." });

    try {
      const user = await tx.user.update({
        where: { id: session.sub },
        data: { firstName, lastName: lastName || null },
        select: { firstName: true, lastName: true },
      });

      await writeAuditLog({
        tenantId: session.tid,
        actorUserId: session.sub,
        action: "user.profile.update",
        entityType: "user",
        entityId: session.sub,
      });

      return ok({ firstName: user.firstName, lastName: user.lastName });
    } catch (error) {
      return err({ message: profileSaveErrorMessage(error) });
    }
  });
}

export async function changeAccountPassword(
  session: AppSession,
  body: unknown,
): Promise<Result<{ ok: true }, { message: string }>> {
  const b = body as PasswordBody;
  const currentPassword = b.currentPassword ?? "";
  const newPassword = b.newPassword ?? "";

  if (!newPassword) {
    return err({ message: "Indica la nueva contraseña." });
  }

  const policyErr = validatePasswordStrength(newPassword);
  if (policyErr) return err({ message: policyErr });

  const passwordHash = hashSync(newPassword, 12);

  if (session.kind === "platform") {
    const user = await prisma.platformUser.findUnique({ where: { id: session.sub } });
    if (!user) return err({ message: "No autorizado." });
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return err({ message: "La contraseña actual no es correcta." });
    }
    await prisma.platformUser.update({
      where: { id: session.sub },
      data: { passwordHash },
    });
    return ok({ ok: true });
  }

  if (!session.tid) {
    return err({ message: "No autorizado." });
  }

  if (session.impersonating) {
    return err({ message: "No puedes cambiar la contraseña en modo solo lectura." });
  }

  return withTenant(session.tid, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: session.sub },
    });
    if (!user) return err({ message: "No autorizado." });
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return err({ message: "La contraseña actual no es correcta." });
    }

    try {
      await tx.user.update({
        where: { id: session.sub },
        data: { passwordHash },
      });

      await writeAuditLog({
        tenantId: session.tid,
        actorUserId: session.sub,
        action: "user.password.change",
        entityType: "user",
        entityId: session.sub,
      });

      return ok({ ok: true });
    } catch (error) {
      return err({ message: profileSaveErrorMessage(error) });
    }
  });
}
