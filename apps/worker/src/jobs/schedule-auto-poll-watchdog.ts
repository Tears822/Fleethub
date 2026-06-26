import { autoPollAlertThresholdMinutes, getGlobalAutoPollHealth, isSmtpConfigured, sendEmail } from "@fleethub/auth";
import { prisma } from "@fleethub/db";

const DEFAULT_TICK_MS = 15 * 60_000;
const COOLDOWN_MS = 6 * 60 * 60_000;

let lastAlertAtMs = 0;

function enabled(): boolean {
  const v = process.env.FLEET_AUTO_POLL_ALERT_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

function tickMs(): number {
  const n = Number(process.env.FLEET_AUTO_POLL_ALERT_TICK_MS);
  return Number.isFinite(n) && n >= 60_000 ? n : DEFAULT_TICK_MS;
}

function alertRecipients(): string[] {
  const fromEnv = process.env.FLEET_AUTO_POLL_ALERT_EMAIL?.trim();
  if (fromEnv) {
    return fromEnv
      .split(/[,;]/)
      .map((e) => e.trim())
      .filter(Boolean);
  }
  return [];
}

async function resolvePlatformAlertEmails(): Promise<string[]> {
  const explicit = alertRecipients();
  if (explicit.length > 0) return explicit;

  const users = await prisma.platformUser.findMany({
    where: { isActive: true },
    select: { email: true },
    take: 20,
  });
  return users.map((u) => u.email).filter(Boolean);
}

async function sendAutoPollStaleAlert(health: Awaited<ReturnType<typeof getGlobalAutoPollHealth>>): Promise<void> {
  if (!isSmtpConfigured()) {
    console.error(
      "[worker] auto-poll watchdog: STALE — configure SMTP or FLEET_AUTO_POLL_ALERT_EMAIL for email alerts.",
    );
    return;
  }

  const recipients = await resolvePlatformAlertEmails();
  if (recipients.length === 0) {
    console.error(
      "[worker] auto-poll watchdog: STALE — set FLEET_AUTO_POLL_ALERT_EMAIL or add active platform users.",
    );
    return;
  }

  const last =
    health.lastAutoSuccessAt != null
      ? health.lastAutoSuccessAt.toLocaleString("es-ES", {
          dateStyle: "short",
          timeStyle: "short",
        })
      : "nunca";

  const subject = "[FleetHub] Poll automático detenido";
  const text = [
    "El polling automático de Uber/FreeNow no ha completado con éxito en el margen configurado.",
    "",
    `Último poll automático OK: ${last}`,
    `Umbral de alerta: ${health.alertThresholdMinutes} min`,
    `Tenants activos sin poll reciente: ${health.tenantsMissingRecentAutoPoll}/${health.activeTenantCount}`,
    "",
    "Acciones:",
    "1. Revisar Super Admin → Sync global",
    "2. journalctl -u fleethub-worker -n 200 (buscar poll: enqueued / poll error)",
    "3. systemctl restart fleethub-worker",
    "",
    "Los sync manuales desde Configuración no sustituyen el poll automático.",
  ].join("\n");

  for (const to of recipients) {
    await sendEmail({ to, subject, text });
  }
  console.warn(`[worker] auto-poll watchdog: emailed ${recipients.length} recipient(s).`);
}

/**
 * Alert platform ops when automatic polling stops globally (before tenants complain).
 */
export function scheduleAutoPollWatchdog(): void {
  if (!enabled()) {
    console.log(
      "[worker] Auto-poll watchdog disabled (set FLEET_AUTO_POLL_ALERT_ENABLED=1).",
    );
    return;
  }

  const intervalMs = tickMs();
  const threshold = autoPollAlertThresholdMinutes();
  console.log(
    `[worker] Auto-poll watchdog every ${intervalMs / 1000}s (alert if no auto success in ${threshold} min).`,
  );

  const run = async () => {
    try {
      const health = await getGlobalAutoPollHealth();
      if (!health.stale || health.activeTenantCount === 0) return;

      const now = Date.now();
      if (now - lastAlertAtMs < COOLDOWN_MS) return;
      lastAlertAtMs = now;

      console.error(
        `[worker] auto-poll watchdog: STALE — last auto success ${health.minutesSinceAutoSuccess ?? "?"} min ago; ${health.tenantsMissingRecentAutoPoll}/${health.activeTenantCount} tenants missing recent auto poll.`,
      );
      await sendAutoPollStaleAlert(health);
    } catch (err) {
      console.error("[worker] auto-poll watchdog error:", err);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
}
