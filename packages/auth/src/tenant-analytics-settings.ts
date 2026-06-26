import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { withTenantRls, withoutTenant, writeAuditLog } from "@fleethub/db";
import { canManageTenantSettings } from "./rbac";
import type { AppSession } from "./types";

export type TenantAnalyticsSettings = {
  /** Contribuye datos agregados al benchmark sectorial y puede ver comparativas. */
  sectorBenchmarkOptIn: boolean;
};

const DEFAULT_ANALYTICS: TenantAnalyticsSettings = {
  sectorBenchmarkOptIn: false,
};

export function parseTenantAnalyticsSettings(raw: unknown): TenantAnalyticsSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_ANALYTICS;
  const a = (raw as { analytics?: unknown }).analytics;
  if (!a || typeof a !== "object") return DEFAULT_ANALYTICS;
  return {
    sectorBenchmarkOptIn: (a as { sectorBenchmarkOptIn?: unknown }).sectorBenchmarkOptIn === true,
  };
}

export async function getTenantAnalyticsSettings(
  tenantId: string,
): Promise<TenantAnalyticsSettings> {
  const tenant = await withTenantRls(tenantId, (tx) =>
    tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    }),
  );
  return parseTenantAnalyticsSettings(tenant?.settings);
}

/** Tenants that opted in to sector benchmarks (for cross-tenant aggregation). */
export async function listSectorBenchmarkOptInTenantIds(): Promise<string[]> {
  const tenants = await withoutTenant((tx) =>
    tx.tenant.findMany({
      select: { id: true, settings: true },
    }),
  );
  return tenants
    .filter((t) => parseTenantAnalyticsSettings(t.settings).sectorBenchmarkOptIn)
    .map((t) => t.id);
}

export async function updateTenantAnalyticsSettings(
  session: AppSession,
  body: unknown,
): Promise<Result<TenantAnalyticsSettings, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }
  if (!canManageTenantSettings(session.role)) {
    return err({ message: "No autorizado." });
  }

  const b = body as { sectorBenchmarkOptIn?: unknown };
  const sectorBenchmarkOptIn = b.sectorBenchmarkOptIn === true;

  const tenantId = session.tid;
  const analytics: TenantAnalyticsSettings = { sectorBenchmarkOptIn };

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

    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        settings: { ...current, analytics },
      },
    });

    return analytics;
  });
  if (!saved) return err({ message: "Tenant no encontrado." });

  await writeAuditLog({
    tenantId,
    actorUserId: session.sub,
    action: "tenant.settings.analytics",
    entityType: "tenant",
    entityId: tenantId,
    payload: analytics,
  });

  return ok(analytics);
}
