import { prisma } from "./client";

/** Días de historial de auditoría conservados en base de datos. */
export const AUDIT_LOG_RETENTION_DAYS = 90;

export function auditLogRetentionCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - AUDIT_LOG_RETENTION_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

/** Elimina entradas anteriores al periodo de retención (por tenant o global). */
export async function purgeExpiredAuditLogs(tenantId?: string): Promise<number> {
  const cutoff = auditLogRetentionCutoff();
  const result = await prisma.auditLog.deleteMany({
    where: {
      createdAt: { lt: cutoff },
      ...(tenantId ? { tenantId } : {}),
    },
  });
  return result.count;
}
