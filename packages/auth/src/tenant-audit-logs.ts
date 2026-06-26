import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import {
  TenantRole,
  auditLogRetentionCutoff,
  prisma,
  purgeExpiredAuditLogs,
  withTenant,
} from "@fleethub/db";
import type { AppSession } from "./types";

export type TenantAuditLogRow = {
  id: string;
  action: string;
  actionLabel: string;
  entityType: string | null;
  entityId: string | null;
  actorName: string;
  actorEmail: string | null;
  createdAt: string;
  detail: string | null;
};

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Inicio de sesión",
  "auth.login.failed": "Inicio de sesión fallido",
  "auth.login.2fa": "Inicio de sesión (2FA)",
  "auth.password_reset": "Contraseña restablecida",
  "auth.password_setup": "Contraseña creada",
  "auth.email_verified": "Email verificado",
  "tenant.signup.public": "Registro público (SaaS)",
  "auth.totp.disable": "2FA desactivado",
  "user.profile.update": "Perfil actualizado",
  "user.password.change": "Contraseña cambiada",
  "user.invite": "Usuario invitado",
  "user.invite.resend": "Invitación reenviada",
  "user.update": "Usuario actualizado",
  "company.create": "Empresa creada",
  "company.update": "Empresa actualizada",
  "company.delete": "Empresa eliminada",
  "company.logo.upload": "Logo de empresa subido",
  "company.document.upload": "Documento subido",
  "company.document.status": "Estado de documento",
  "driver.create": "Conductor creado",
  "driver.update": "Conductor actualizado",
  "shift.close": "Turno cerrado",
  "shift.revert_close": "Cierre de turno revertido",
  "trip.validate_payment": "Tipo de pago confirmado",
  "trip.update_payment": "Tipo de pago actualizado",
  "tenant.settings.general": "Ajustes generales",
  "tenant.settings.productivity": "Umbrales de productividad",
  "tenant.settings.notifications": "Notificaciones",
  "tenant.settings.analytics": "Analítica sectorial",
  "impersonation.start": "Impersonación iniciada",
  "impersonation.end": "Impersonación finalizada",
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

const LOGIN_FAILURE_REASON_LABELS: Record<string, string> = {
  invalid_credentials: "credenciales incorrectas",
  pending_activation: "cuenta pendiente de activación",
  email_not_verified: "email no verificado",
  locked: "cuenta bloqueada por intentos",
};

function payloadDetail(action: string, payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  const parts: string[] = [];
  if (action === "auth.login.failed" && typeof p.reason === "string") {
    parts.push(LOGIN_FAILURE_REASON_LABELS[p.reason] ?? p.reason);
  }
  if (typeof p.docId === "string") parts.push(`doc: ${p.docId}`);
  if (typeof p.fileName === "string") parts.push(p.fileName);
  if (typeof p.status === "string") parts.push(`estado: ${p.status}`);
  if (typeof p.driverId === "string") parts.push(`conductor`);
  if (typeof p.tripCount === "number") parts.push(`${p.tripCount} viaje(s)`);
  if (typeof p.note === "string" && p.note.trim()) parts.push(`nota: ${p.note.trim().slice(0, 80)}`);
  if (typeof p.tenantSlug === "string") parts.push(`tenant: ${p.tenantSlug}`);
  if (parts.length === 0 && action.startsWith("shift.")) {
    return Object.keys(p).length > 0 ? JSON.stringify(p).slice(0, 120) : null;
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function requireAdmin(session: AppSession): Result<true, { message: string }> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }
  if (session.role !== TenantRole.ADMIN_TENANT) {
    return err({ message: "Solo el administrador puede ver el registro de actividad." });
  }
  return ok(true);
}

export const AUDIT_LOG_UI_LIST_MAX = 500;
export const AUDIT_LOG_EXPORT_MAX = 5000;

export async function listTenantAuditLogs(
  session: AppSession,
  limit = AUDIT_LOG_UI_LIST_MAX,
): Promise<Result<TenantAuditLogRow[], { message: string }>> {
  const auth = requireAdmin(session);
  if (!auth.ok) return auth;

  const tenantId = session.tid!;
  await purgeExpiredAuditLogs(tenantId);

  const take = Math.min(Math.max(limit, 1), AUDIT_LOG_EXPORT_MAX);
  const retentionFrom = auditLogRetentionCutoff();

  const logs = await withTenant(tenantId, (tx) =>
    tx.auditLog.findMany({
      where: { tenantId, createdAt: { gte: retentionFrom } },
      orderBy: { createdAt: "desc" },
      take,
    }),
  );

  const actorIds = [...new Set(logs.map((l) => l.actorUserId).filter((id): id is string => Boolean(id)))];

  const [tenantUsers, platformUsers] = await Promise.all([
    actorIds.length > 0
      ? withTenant(tenantId, (tx) =>
          tx.user.findMany({
            where: { id: { in: actorIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          }),
        )
      : [],
    actorIds.length > 0
      ? prisma.platformUser.findMany({
          where: { id: { in: actorIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [],
  ]);

  const actorById = new Map<string, { name: string; email: string | null }>();
  for (const u of tenantUsers) {
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
    actorById.set(u.id, { name, email: u.email });
  }
  for (const u of platformUsers) {
    if (actorById.has(u.id)) continue;
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email;
    actorById.set(u.id, { name: `${name} (Super Admin)`, email: u.email });
  }

  const rows: TenantAuditLogRow[] = logs.map((log) => {
    const actor = log.actorUserId ? actorById.get(log.actorUserId) : undefined;
    return {
      id: log.id.toString(),
      action: log.action,
      actionLabel: actionLabel(log.action),
      entityType: log.entityType,
      entityId: log.entityId,
      actorName: actor?.name ?? (log.actorUserId ? "Usuario desconocido" : "Sistema"),
      actorEmail: actor?.email ?? null,
      createdAt: log.createdAt.toISOString(),
      detail: payloadDetail(log.action, log.payload),
    };
  });

  return ok(rows);
}
