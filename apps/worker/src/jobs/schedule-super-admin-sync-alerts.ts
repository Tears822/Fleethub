import {
  getGlobalAutoPollHealth,
  getSuperAdminSyncAlertSummary,
  isSmtpConfigured,
  sendEmail,
} from "@fleethub/auth";
import { getFleetQueuesSnapshot } from "@fleethub/db/bullmq-queue-stats";
import { prisma } from "@fleethub/db";

const DEFAULT_TICK_MS = 15 * 60_000;
const COOLDOWN_MS = 4 * 60 * 60_000;

let lastAlertAtMs = 0;

function enabled(): boolean {
  const v = process.env.FLEET_SA_SYNC_ALERT_ENABLED?.trim().toLowerCase();
  if (v === "0" || v === "false" || v === "no") return false;
  return true;
}

function tickMs(): number {
  const n = Number(process.env.FLEET_SA_SYNC_ALERT_TICK_MS);
  return Number.isFinite(n) && n >= 60_000 ? n : DEFAULT_TICK_MS;
}

async function resolveRecipients(): Promise<string[]> {
  const fromEnv = process.env.FLEET_AUTO_POLL_ALERT_EMAIL?.trim();
  if (fromEnv) {
    return fromEnv
      .split(/[,;]/)
      .map((e) => e.trim())
      .filter(Boolean);
  }
  const users = await prisma.platformUser.findMany({
    where: { isActive: true },
    select: { email: true },
    take: 20,
  });
  return users.map((u) => u.email).filter(Boolean);
}

async function sendSuperAdminSyncAlert(summary: Awaited<ReturnType<typeof getSuperAdminSyncAlertSummary>>): Promise<void> {
  if (!isSmtpConfigured()) {
    console.error("[worker] SA sync alert: configure SMTP for email alerts.");
    return;
  }
  const recipients = await resolveRecipients();
  if (recipients.length === 0) {
    console.error("[worker] SA sync alert: set FLEET_AUTO_POLL_ALERT_EMAIL or add platform users.");
    return;
  }

  const subject = "[FleetHub] Problemas de sincronización — acción Super Admin";
  const text = [
    "Se detectaron problemas de sincronización que requieren revisión desde Super Admin.",
    "",
    `Jobs fallidos en cola fleet-sync: ${summary.queueFailed}`,
    `Sync bloqueadas «En curso»: ${summary.staleRunningCount}`,
    `Fallos de sync (24 h): ${summary.failedLast24h}`,
    `Tenants afectados: ${summary.tenantsWithProblems}`,
    "",
    "Acciones en Super Admin → Sync global:",
    "1. Reconciliar sync bloqueadas",
    "2. Reintentar jobs fallidos",
    "3. Forzar sync por tenant (botón en tabla de cobertura)",
    "",
    "URL: /super-admin/sync",
  ].join("\n");

  for (const to of recipients) {
    await sendEmail({ to, subject, text });
  }
  console.warn(`[worker] SA sync alert: emailed ${recipients.length} recipient(s).`);
}

/**
 * Email Super Admins when queue failures, stale RUNNING syncs, or tenant sync failures accumulate.
 */
export function scheduleSuperAdminSyncAlerts(): void {
  if (!enabled()) {
    console.log("[worker] Super Admin sync alerts disabled (FLEET_SA_SYNC_ALERT_ENABLED=1 to enable).");
    return;
  }

  const intervalMs = tickMs();
  console.log(`[worker] Super Admin sync alerts every ${intervalMs / 1000}s.`);

  const run = async () => {
    try {
      const queues = await getFleetQueuesSnapshot();
      const summary = await getSuperAdminSyncAlertSummary(queues.fleetSync.failed);
      const autoPoll = await getGlobalAutoPollHealth();

      const shouldAlert =
        summary.queueFailed > 0 ||
        summary.staleRunningCount > 0 ||
        summary.failedLast24h >= 3 ||
        autoPoll.stale;

      if (!shouldAlert) return;

      const now = Date.now();
      if (now - lastAlertAtMs < COOLDOWN_MS) return;
      lastAlertAtMs = now;

      console.error(
        `[worker] SA sync alert: queueFailed=${summary.queueFailed} stale=${summary.staleRunningCount} failed24h=${summary.failedLast24h}`,
      );
      await sendSuperAdminSyncAlert(summary);
    } catch (err) {
      console.error("[worker] SA sync alert error:", err);
    }
  };

  void run();
  setInterval(() => void run(), intervalMs);
}
