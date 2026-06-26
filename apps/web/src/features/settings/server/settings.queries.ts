import "server-only";

import type { ProductivityThresholds, TenantNotificationSettings } from "@fleethub/auth";
import { withTenant } from "@/infrastructure/database";

const DEFAULT_THRESHOLDS: ProductivityThresholds = {
  eurPerHourMin: 12,
  tripsPerHourMin: 1.5,
  acceptanceRateMin: 85,
};

function parseProductivity(settings: unknown): ProductivityThresholds {
  if (!settings || typeof settings !== "object") return DEFAULT_THRESHOLDS;
  const p = (settings as { productivity?: unknown }).productivity;
  if (!p || typeof p !== "object") return DEFAULT_THRESHOLDS;
  const o = p as Record<string, unknown>;
  return {
    eurPerHourMin: Number(o.eurPerHourMin) || DEFAULT_THRESHOLDS.eurPerHourMin,
    tripsPerHourMin: Number(o.tripsPerHourMin) || DEFAULT_THRESHOLDS.tripsPerHourMin,
    acceptanceRateMin: Number(o.acceptanceRateMin) || DEFAULT_THRESHOLDS.acceptanceRateMin,
    useFleetDayAverages: o.useFleetDayAverages === true,
  };
}

export async function getTenantGeneralSettings(tenantId: string) {
  return withTenant(tenantId, (tx) =>
    tx.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true, timezone: true, locale: true, settings: true },
    }),
  );
}

export async function getTenantProductivitySettings(
  tenantId: string,
): Promise<ProductivityThresholds> {
  const tenant = await getTenantGeneralSettings(tenantId);
  return parseProductivity(tenant?.settings);
}

export type TenantIntegrationSettings = {
  pollingMinutesUber: number;
  pollingMinutesFreeNow: number;
  freenowPublicCompanyId: string;
  uberOrgId: string;
  uberSyncDays: number;
  freenowSyncDays: number;
};

const DEFAULT_INTEGRATIONS: TenantIntegrationSettings = {
  pollingMinutesUber: 15,
  pollingMinutesFreeNow: 15,
  freenowPublicCompanyId: "",
  uberOrgId: "",
  uberSyncDays: 7,
  freenowSyncDays: 7,
};

const DEFAULT_NOTIFICATIONS: TenantNotificationSettings = {
  emailOnPendingShifts: true,
  emailOnProductivityLow: true,
  emailOnSyncStale: true,
};

export function parseTenantNotificationSettings(settings: unknown): TenantNotificationSettings {
  if (!settings || typeof settings !== "object") return DEFAULT_NOTIFICATIONS;
  const n = (settings as { notifications?: unknown }).notifications;
  if (!n || typeof n !== "object") return DEFAULT_NOTIFICATIONS;
  const o = n as Record<string, unknown>;
  return {
    emailOnPendingShifts: o.emailOnPendingShifts !== false,
    emailOnProductivityLow: o.emailOnProductivityLow !== false,
    emailOnSyncStale: o.emailOnSyncStale !== false,
  };
}

export function parseTenantIntegrationSettings(settings: unknown): TenantIntegrationSettings {
  if (!settings || typeof settings !== "object") return DEFAULT_INTEGRATIONS;
  const i = (settings as { integrations?: unknown }).integrations;
  if (!i || typeof i !== "object") return DEFAULT_INTEGRATIONS;
  const o = i as Record<string, unknown>;
  const uberSyncDays = Number(o.uberSyncDays);
  const freenowSyncDays = Number(o.freenowSyncDays);
  return {
    pollingMinutesUber: Math.max(5, Number(o.pollingMinutesUber) || DEFAULT_INTEGRATIONS.pollingMinutesUber),
    pollingMinutesFreeNow: Math.max(
      5,
      Number(o.pollingMinutesFreeNow) || DEFAULT_INTEGRATIONS.pollingMinutesFreeNow,
    ),
    freenowPublicCompanyId:
      typeof o.freenowPublicCompanyId === "string" ? o.freenowPublicCompanyId.trim() : "",
    uberOrgId: typeof o.uberOrgId === "string" ? o.uberOrgId.trim() : "",
    uberSyncDays:
      Number.isFinite(uberSyncDays) && uberSyncDays >= 1
        ? Math.min(28, Math.round(uberSyncDays))
        : DEFAULT_INTEGRATIONS.uberSyncDays,
    freenowSyncDays:
      Number.isFinite(freenowSyncDays) && freenowSyncDays >= 1
        ? Math.min(28, Math.round(freenowSyncDays))
        : DEFAULT_INTEGRATIONS.freenowSyncDays,
  };
}
