import { withoutTenant, withTenantRls } from "@fleethub/db";
import { buildOperationalAlertsForTenant } from "./operational-alerts";
import { getTenantNotificationSettings } from "./tenant-notification-settings";
import {
  sendTenantAlertDigest,
  type AlertDigestLine,
  type SendAlertDigestResult,
} from "./notify-tenant-alerts";

type LastNotifiedMap = Record<string, string>;

function emailCooldownMs(): number {
  const hours = Number(
    process.env.OPERATIONAL_EMAIL_COOLDOWN_HOURS ??
      process.env.SYNC_STALE_EMAIL_COOLDOWN_HOURS,
  );
  const h = Number.isFinite(hours) && hours > 0 ? hours : 6;
  return h * 60 * 60_000;
}

function parseLastNotified(settings: unknown): LastNotifiedMap {
  if (!settings || typeof settings !== "object") return {};
  const n = (settings as { notifications?: unknown }).notifications;
  if (!n || typeof n !== "object") return {};
  const o = n as {
    lastOperationalNotifiedAt?: unknown;
    lastSyncStaleNotifiedAt?: unknown;
  };
  const unified =
    o.lastOperationalNotifiedAt && typeof o.lastOperationalNotifiedAt === "object"
      ? (o.lastOperationalNotifiedAt as Record<string, unknown>)
      : {};
  const legacy =
    o.lastSyncStaleNotifiedAt && typeof o.lastSyncStaleNotifiedAt === "object"
      ? (o.lastSyncStaleNotifiedAt as Record<string, unknown>)
      : {};
  const out: LastNotifiedMap = {};
  for (const [k, v] of Object.entries({ ...legacy, ...unified })) {
    if (typeof v === "string" && v.trim()) out[k] = v.trim();
  }
  return out;
}

async function saveLastNotified(
  tenantId: string,
  patch: LastNotifiedMap,
  clearIds: string[] = [],
): Promise<void> {
  await withTenantRls(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) return;

    const current =
      tenant.settings && typeof tenant.settings === "object"
        ? (tenant.settings as Record<string, unknown>)
        : {};
    const notifications =
      current.notifications && typeof current.notifications === "object"
        ? { ...(current.notifications as Record<string, unknown>) }
        : {};

    const prev = parseLastNotified(tenant.settings);
    const lastOperationalNotifiedAt: LastNotifiedMap = { ...prev, ...patch };
    for (const id of clearIds) {
      delete lastOperationalNotifiedAt[id];
    }

    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        settings: {
          ...current,
          notifications: { ...notifications, lastOperationalNotifiedAt },
        },
      },
    });
  });
}

function wasNotifiedRecently(alertId: string, last: LastNotifiedMap): boolean {
  const iso = last[alertId];
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t < emailCooldownMs();
}

function prefsAllowAlert(
  alertId: string,
  prefs: Awaited<ReturnType<typeof getTenantNotificationSettings>>,
): boolean {
  if (alertId === "pending-shifts") return prefs.emailOnPendingShifts;
  if (alertId === "productivity-low" || alertId === "productivity-warn") {
    return prefs.emailOnProductivityLow;
  }
  if (alertId.startsWith("sync-")) return prefs.emailOnSyncStale;
  return true;
}

export async function checkAndSendOperationalDigest(
  tenantId: string,
): Promise<SendAlertDigestResult> {
  const prefs = await getTenantNotificationSettings(tenantId);
  const tenant = await withTenantRls(tenantId, (tx) =>
    tx.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, settings: true },
    }),
  );
  if (!tenant) {
    return { sent: 0, skipped: true, reason: "Tenant no encontrado." };
  }

  const allAlerts = await buildOperationalAlertsForTenant(tenantId);
  const lastNotified = parseLastNotified(tenant.settings);
  const toEmail: AlertDigestLine[] = [];
  const markNotified: LastNotifiedMap = {};
  const clearIds: string[] = [];

  for (const alert of allAlerts) {
    if (!prefsAllowAlert(alert.id, prefs)) continue;
    if (wasNotifiedRecently(alert.id, lastNotified)) continue;
    toEmail.push(alert);
    markNotified[alert.id] = new Date().toISOString();
  }

  const activeIds = new Set(allAlerts.map((a) => a.id));
  for (const id of Object.keys(lastNotified)) {
    if (!activeIds.has(id)) clearIds.push(id);
  }

  if (clearIds.length > 0) {
    await saveLastNotified(tenantId, {}, clearIds);
  }

  if (toEmail.length === 0) {
    return {
      sent: 0,
      skipped: true,
      reason:
        allAlerts.length === 0
          ? "Sin alertas operativas."
          : "Sin alertas nuevas o ya notificadas (cooldown / preferencias).",
    };
  }

  const result = await sendTenantAlertDigest(tenantId, tenant.name, toEmail);
  if (!result.skipped && result.sent > 0) {
    await saveLastNotified(tenantId, markNotified);
  }
  return result;
}

/** @deprecated Use checkAndSendOperationalDigest */
export const checkAndSendSyncStaleAlerts = checkAndSendOperationalDigest;

export async function runOperationalDigestsForAllTenants(): Promise<{
  tenants: number;
  emailed: number;
}> {
  const tenants = await withoutTenant((tx) =>
    tx.tenant.findMany({
      where: { commercialStatus: "ACTIVE" },
      select: { id: true, slug: true },
    }),
  );

  let emailed = 0;
  for (const t of tenants) {
    const result = await checkAndSendOperationalDigest(t.id);
    if (!result.skipped && result.sent > 0) {
      emailed += 1;
      console.log(
        `[worker] operational email: tenant "${t.slug}" → ${result.sent} recipient(s).`,
      );
    }
  }

  return { tenants: tenants.length, emailed };
}

/** @deprecated Use runOperationalDigestsForAllTenants */
export const runSyncStaleAlertsForAllTenants = runOperationalDigestsForAllTenants;
