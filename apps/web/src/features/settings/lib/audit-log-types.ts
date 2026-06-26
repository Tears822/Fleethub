/** Fila del registro de actividad (alineado con `@fleethub/auth` tenant-audit-logs). */

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
