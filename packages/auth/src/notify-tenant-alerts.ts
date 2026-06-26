import { TenantRole, withTenantRls } from "@fleethub/db";
import { appPublicUrl, isSmtpConfigured, sendEmail } from "./email";
import { getTenantNotificationSettings } from "./tenant-notification-settings";

export type AlertDigestLine = {
  id: string;
  title: string;
  description: string;
};

export type SendAlertDigestResult = {
  sent: number;
  skipped: boolean;
  reason?: string;
};

function filterAlertsForNotifications(
  alerts: AlertDigestLine[],
  prefs: Awaited<ReturnType<typeof getTenantNotificationSettings>>,
): AlertDigestLine[] {
  return alerts.filter((a) => {
    if (a.id === "pending-shifts") return prefs.emailOnPendingShifts;
    if (a.id === "productivity-low" || a.id === "productivity-warn") {
      return prefs.emailOnProductivityLow;
    }
    if (a.id.startsWith("sync-")) return prefs.emailOnSyncStale;
    return a.id !== "all-clear";
  });
}

export async function sendTenantAlertDigest(
  tenantId: string,
  tenantName: string,
  alerts: AlertDigestLine[],
): Promise<SendAlertDigestResult> {
  if (!isSmtpConfigured()) {
    return { sent: 0, skipped: true, reason: "SMTP no configurado en el servidor." };
  }

  const actionable = alerts.filter((a) => a.id !== "all-clear");
  if (actionable.length === 0) {
    return { sent: 0, skipped: true, reason: "No hay alertas que notificar." };
  }

  const prefs = await getTenantNotificationSettings(tenantId);
  const toSend = filterAlertsForNotifications(actionable, prefs);
  if (toSend.length === 0) {
    return { sent: 0, skipped: true, reason: "Todas las alertas están desactivadas en preferencias." };
  }

  const recipients = await withTenantRls(tenantId, (tx) =>
    tx.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: [TenantRole.ADMIN_TENANT, TenantRole.GESTOR] },
      },
      select: { email: true },
    }),
  );

  if (recipients.length === 0) {
    return { sent: 0, skipped: true, reason: "No hay gestores con email activo." };
  }

  const lines = toSend.map((a) => `• ${a.title}: ${a.description}`).join("\n");
  const subject = `[FleetHub] ${toSend.length} alerta${toSend.length === 1 ? "" : "s"} — ${tenantName}`;
  const text = `Resumen de alertas operativas para ${tenantName}:\n\n${lines}\n\nPanel: ${appPublicUrl()}/dashboard\n`;

  let sent = 0;
  for (const { email } of recipients) {
    await sendEmail({ to: email, subject, text });
    sent += 1;
  }

  return { sent, skipped: false };
}
