import "server-only";

import {
  AUDIT_LOG_UI_LIST_MAX,
  listTenantAuditLogs,
  type AppSession,
  type TenantAuditLogRow,
} from "@fleethub/auth";

export type { TenantAuditLogRow } from "@/features/settings/lib/audit-log-types";

export async function getTenantAuditLogsForSettings(
  session: AppSession,
): Promise<TenantAuditLogRow[]> {
  const result = await listTenantAuditLogs(session, AUDIT_LOG_UI_LIST_MAX);
  if (!result.ok) return [];
  return result.value;
}
