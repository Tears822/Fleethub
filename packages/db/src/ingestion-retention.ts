import { prisma } from "./client";

/** Días de detalle de telemetría de ingesta (PROPUESTA §6). */
export const INGESTION_EVENT_RETENTION_DAYS = 90;

export function ingestionEventRetentionCutoff(): Date {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - INGESTION_EVENT_RETENTION_DAYS);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
}

export async function purgeExpiredIngestionEvents(tenantId?: string): Promise<number> {
  const cutoff = ingestionEventRetentionCutoff();
  const result = await prisma.ingestionEvent.deleteMany({
    where: {
      receivedAt: { lt: cutoff },
      ...(tenantId ? { tenantId } : {}),
    },
  });
  return result.count;
}
