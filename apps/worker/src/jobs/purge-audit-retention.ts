import { AUDIT_LOG_RETENTION_DAYS, purgeExpiredAuditLogs } from "@fleethub/db";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runAuditLogRetentionPurge(): Promise<number> {
  return purgeExpiredAuditLogs();
}

/** Purga global al arranque y cada 24 h (tenants sin visitar Configuración). */
export function scheduleAuditLogRetention(): void {
  const run = async () => {
    try {
      const removed = await runAuditLogRetentionPurge();
      if (removed > 0) {
        console.log(
          `[worker] Registro de actividad: ${removed} fila(s) eliminada(s) (>${AUDIT_LOG_RETENTION_DAYS} días).`,
        );
      }
    } catch (err) {
      console.error("[worker] Error en purga de audit_log:", err);
    }
  };

  void run();
  setInterval(() => void run(), DAY_MS);
}
