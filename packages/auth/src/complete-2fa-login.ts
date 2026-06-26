import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { prisma, withTenant, writeAuditLog } from "@fleethub/db";
import { verifyPending2faToken } from "./pending-2fa-jwt";
import { signSessionToken } from "./session-jwt";
import { verifyBackupCode, verifyTotpCode, consumeBackupHash } from "./totp";
import { tenantLoginBlockedMessage } from "./tenant-commercial-access";
import type { AppSession, LoginSuccess } from "./types";
import type { AuthFailure } from "./authenticate";

type Complete2faBody = {
  pendingToken: string;
  code: string;
};

export async function complete2faLogin(
  body: unknown,
  ip?: string | null,
): Promise<Result<LoginSuccess, AuthFailure>> {
  const pendingToken =
    typeof body === "object" && body !== null && "pendingToken" in body
      ? String((body as Complete2faBody).pendingToken)
      : "";
  const code =
    typeof body === "object" && body !== null && "code" in body
      ? String((body as Complete2faBody).code)
      : "";

  const claims = await verifyPending2faToken(pendingToken);
  if (!claims) {
    return err({ reason: "invalid_body", message: "Sesión 2FA expirada. Vuelve a iniciar sesión." });
  }

  if (claims.kind === "platform") {
    const user = await prisma.platformUser.findUnique({ where: { id: claims.sub } });
    if (!user?.isActive || !user.totpSecret) {
      return err({ reason: "invalid_credentials", message: "No se pudo verificar 2FA." });
    }

    const backupHashes = (user.totpBackupHashes as string[] | null) ?? [];
    let backupIndex = -1;
    const totpOk = verifyTotpCode(user.totpSecret, code);
    const backup = verifyBackupCode(code, backupHashes);
    if (!totpOk && !backup.ok) {
      return err({ reason: "invalid_credentials", message: "Código 2FA incorrecto." });
    }
    if (backup.ok) backupIndex = backup.index;

    if (backup.ok && backupIndex >= 0) {
      await prisma.platformUser.update({
        where: { id: user.id },
        data: { totpBackupHashes: consumeBackupHash(backupHashes, backupIndex) },
      });
    }

    const sessionPayload: AppSession = {
      sub: user.id,
      email: user.email,
      role: user.role,
      kind: "platform",
      name: claims.name,
    };
    const token = await signSessionToken(sessionPayload);
    await writeAuditLog({
      actorUserId: user.id,
      action: "auth.login.2fa",
      ip,
      payload: { kind: "platform" },
    });
    return ok({
      token,
      role: user.role,
      kind: "platform",
      redirectTo: "/super-admin",
    });
  }

  if (!claims.tid) {
    return err({ reason: "invalid_credentials", message: "No se pudo verificar 2FA." });
  }

  return withTenant(claims.tid, async (tx) => {
    const tenant = await tx.tenant.findUnique({ where: { id: claims.tid } });
    if (!tenant) {
      return err({ reason: "invalid_credentials", message: "No se pudo verificar 2FA." });
    }
    const blocked = tenantLoginBlockedMessage(tenant);
    if (blocked) {
      return err({ reason: "invalid_credentials", message: blocked });
    }

    const user = await tx.user.findUnique({ where: { id: claims.sub } });
    if (!user?.isActive || !user.totpSecret) {
      return err({ reason: "invalid_credentials", message: "No se pudo verificar 2FA." });
    }

    const backupHashes = (user.totpBackupHashes as string[] | null) ?? [];
    const totpOk = verifyTotpCode(user.totpSecret, code);
    const backup = verifyBackupCode(code, backupHashes);
    if (!totpOk && !backup.ok) {
      return err({ reason: "invalid_credentials", message: "Código 2FA incorrecto." });
    }

    if (backup.ok && backup.index >= 0) {
      await tx.user.update({
        where: { id: user.id },
        data: { totpBackupHashes: consumeBackupHash(backupHashes, backup.index) },
      });
    }

    const sessionPayload: AppSession = {
      sub: user.id,
      tid: claims.tid,
      role: user.role,
      email: user.email,
      slug: claims.slug,
      kind: "tenant",
    };
    const token = await signSessionToken(sessionPayload);
    await writeAuditLog({
      tenantId: claims.tid,
      actorUserId: user.id,
      action: "auth.login.2fa",
      ip,
    });
    return ok({
      token,
      tenantSlug: claims.slug,
      role: user.role,
      kind: "tenant",
      redirectTo: "/dashboard",
    });
  });
}
