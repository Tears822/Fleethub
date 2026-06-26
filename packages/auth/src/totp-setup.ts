import { Prisma } from "@prisma/client";
import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { prisma, withTenant, writeAuditLog } from "@fleethub/db";
import { platformMustHaveMfaEnabled, tenantAdminMustKeepTotp } from "./mfa-policy";
import {
  generateBackupCodes,
  generateTotpSecret,
  getTotpUri,
  hashBackupCodes,
  verifyBackupCode,
  verifyTotpCode,
} from "./totp";
import type { AppSession } from "./types";

export type TotpStatus = {
  enabled: boolean;
  canDisable: boolean;
};

export function totpCanBeDisabled(session: AppSession): boolean {
  if (session.kind === "platform" && platformMustHaveMfaEnabled()) {
    return false;
  }
  if (session.kind === "tenant" && tenantAdminMustKeepTotp(session.role)) {
    return false;
  }
  return true;
}

export async function getTotpStatus(session: AppSession): Promise<Result<TotpStatus, { message: string }>> {
  if (session.kind === "platform") {
    const user = await prisma.platformUser.findUnique({
      where: { id: session.sub },
      select: { totpEnabled: true },
    });
    if (!user) return err({ message: "No autorizado." });
    return ok({
      enabled: user.totpEnabled,
      canDisable: totpCanBeDisabled(session),
    });
  }

  if (!session.tid) return err({ message: "Sesión no válida." });

  if (session.impersonating) {
    return ok({ enabled: false, canDisable: false });
  }

  return withTenant(session.tid, async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: session.sub },
      select: { totpEnabled: true },
    });
    if (!user) return err({ message: "No autorizado." });
    return ok({
      enabled: user.totpEnabled,
      canDisable: totpCanBeDisabled(session),
    });
  });
}

export async function beginTotpSetup(
  session: AppSession,
): Promise<Result<{ secret: string; uri: string; backupCodes: string[] }, { message: string }>> {
  const secret = generateTotpSecret();
  const backupCodes = generateBackupCodes();
  const uri = getTotpUri(session.email, secret);

  if (session.kind === "platform") {
    await prisma.platformUser.update({
      where: { id: session.sub },
      data: { totpSecret: secret, totpEnabled: false },
    });
  } else if (session.tid) {
    if (session.impersonating) {
      return err({ message: "No puedes configurar 2FA en modo solo lectura." });
    }
    await withTenant(session.tid, async (tx) => {
      await tx.user.update({
        where: { id: session.sub },
        data: { totpSecret: secret, totpEnabled: false },
      });
    });
  } else {
    return err({ message: "Sesión no válida." });
  }

  return ok({ secret, uri, backupCodes });
}

export async function confirmTotpSetup(
  session: AppSession,
  code: string,
): Promise<Result<{ ok: true; backupCodes: string[] }, { message: string }>> {
  let secret: string | null = null;

  if (session.kind === "platform") {
    const user = await prisma.platformUser.findUnique({ where: { id: session.sub } });
    secret = user?.totpSecret ?? null;
    if (!secret || !verifyTotpCode(secret, code)) {
      return err({ message: "Código incorrecto." });
    }
    const backupCodes = generateBackupCodes();
    await prisma.platformUser.update({
      where: { id: session.sub },
      data: {
        totpEnabled: true,
        totpBackupHashes: hashBackupCodes(backupCodes),
      },
    });
    return ok({ ok: true, backupCodes });
  }

  if (!session.tid) return err({ message: "Sesión no válida." });

  if (session.impersonating) {
    return err({ message: "No puedes configurar 2FA en modo solo lectura." });
  }

  return withTenant(session.tid, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: session.sub } });
    secret = user?.totpSecret ?? null;
    if (!secret || !verifyTotpCode(secret, code)) {
      return err({ message: "Código incorrecto." });
    }
    const backupCodes = generateBackupCodes();
    await tx.user.update({
      where: { id: session.sub },
      data: {
        totpEnabled: true,
        totpBackupHashes: hashBackupCodes(backupCodes),
      },
    });
    return ok({ ok: true, backupCodes });
  });
}

export async function disableTotp(
  session: AppSession,
  code: string,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (!totpCanBeDisabled(session)) {
    return err({
      message:
        session.kind === "tenant"
          ? "No se puede desactivar 2FA para el administrador del operador en producción."
          : "No se puede desactivar 2FA para Super Admin en producción.",
    });
  }

  const normalizedCode = code.replace(/\s/g, "");
  if (!normalizedCode) {
    return err({ message: "Introduce el código de verificación." });
  }

  const clearTotp = {
    totpSecret: null,
    totpEnabled: false,
    totpBackupHashes: Prisma.DbNull,
  };

  if (session.kind === "platform") {
    const user = await prisma.platformUser.findUnique({ where: { id: session.sub } });
    if (!user?.totpEnabled || !user.totpSecret) {
      return err({ message: "2FA no está activo." });
    }

    const backupHashes = (user.totpBackupHashes as string[] | null) ?? [];
    const totpOk = verifyTotpCode(user.totpSecret, normalizedCode);
    const backup = verifyBackupCode(normalizedCode, backupHashes);
    if (!totpOk && !backup.ok) {
      return err({ message: "Código incorrecto." });
    }

    await prisma.platformUser.update({
      where: { id: session.sub },
      data: clearTotp,
    });

    await writeAuditLog({
      actorUserId: session.sub,
      action: "auth.totp.disable",
      entityType: "platform_user",
      entityId: session.sub,
      payload: { kind: "platform" },
    });

    return ok({ ok: true });
  }

  if (!session.tid) return err({ message: "Sesión no válida." });

  if (session.impersonating) {
    return err({ message: "No puedes configurar 2FA en modo solo lectura." });
  }

  return withTenant(session.tid, async (tx) => {
    const user = await tx.user.findUnique({ where: { id: session.sub } });
    if (!user?.totpEnabled || !user.totpSecret) {
      return err({ message: "2FA no está activo." });
    }

    const backupHashes = (user.totpBackupHashes as string[] | null) ?? [];
    const totpOk = verifyTotpCode(user.totpSecret, normalizedCode);
    const backup = verifyBackupCode(normalizedCode, backupHashes);
    if (!totpOk && !backup.ok) {
      return err({ message: "Código incorrecto." });
    }

    await tx.user.update({
      where: { id: session.sub },
      data: clearTotp,
    });

    await writeAuditLog({
      tenantId: session.tid,
      actorUserId: session.sub,
      action: "auth.totp.disable",
      entityType: "user",
      entityId: session.sub,
    });

    return ok({ ok: true });
  });
}
