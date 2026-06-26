import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { withTenantRls, writeAuditLog } from "@fleethub/db";
import type { AppSession } from "./types";

export type TenantNotificationSettings = {
  emailOnPendingShifts: boolean;
  emailOnProductivityLow: boolean;
  emailOnSyncStale: boolean;
};

const DEFAULT_NOTIFICATIONS: TenantNotificationSettings = {
  emailOnPendingShifts: true,
  emailOnProductivityLow: true,
  emailOnSyncStale: true,
};

function parseNotifications(raw: unknown): TenantNotificationSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_NOTIFICATIONS;
  const n = (raw as { notifications?: unknown }).notifications;
  if (!n || typeof n !== "object") return DEFAULT_NOTIFICATIONS;
  const o = n as Record<string, unknown>;
  return {
    emailOnPendingShifts: o.emailOnPendingShifts !== false,
    emailOnProductivityLow: o.emailOnProductivityLow !== false,
    emailOnSyncStale: o.emailOnSyncStale !== false,
  };
}

export async function getTenantNotificationSettings(
  tenantId: string,
): Promise<TenantNotificationSettings> {
  const tenant = await withTenantRls(tenantId, (tx) =>
    tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    }),
  );
  return parseNotifications(tenant?.settings);
}

export async function updateTenantNotificationSettings(
  session: AppSession,
  body: unknown,
): Promise<Result<TenantNotificationSettings, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }

  const b = body as Partial<TenantNotificationSettings>;
  const notifications: TenantNotificationSettings = {
    emailOnPendingShifts: b.emailOnPendingShifts !== false,
    emailOnProductivityLow: b.emailOnProductivityLow !== false,
    emailOnSyncStale: b.emailOnSyncStale !== false,
  };

  const tenantId = session.tid;

  const saved = await withTenantRls(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) return null;

    const current =
      tenant.settings && typeof tenant.settings === "object"
        ? (tenant.settings as Record<string, unknown>)
        : {};

    const prevNotifications =
      current.notifications && typeof current.notifications === "object"
        ? (current.notifications as Record<string, unknown>)
        : {};

    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...current,
          notifications: { ...prevNotifications, ...notifications },
        },
      },
    });

    return notifications;
  });
  if (!saved) return err({ message: "Tenant no encontrado." });

  await writeAuditLog({
    tenantId,
    actorUserId: session.sub,
    action: "tenant.settings.notifications",
    entityType: "tenant",
    entityId: tenantId,
    payload: notifications,
  });

  return ok(notifications);
}
