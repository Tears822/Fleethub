import type { Prisma } from "@prisma/client";
import { prisma } from "./client";
import { withTenantRls } from "./tenant-scope";

export type WriteAuditLogInput = {
  tenantId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  ip?: string | null;
  payload?: Prisma.InputJsonValue;
};

export async function writeAuditLog(input: WriteAuditLogInput): Promise<void> {
  const data = {
    tenantId: input.tenantId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    ip: input.ip ?? null,
    payload: input.payload ?? undefined,
  };

  if (input.tenantId) {
    await withTenantRls(input.tenantId, async (tx) => {
      await tx.auditLog.create({ data });
    });
    return;
  }

  await prisma.auditLog.create({ data });
}
