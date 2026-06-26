import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { withTenantRls, writeAuditLog } from "@fleethub/db";
import type { AppSession } from "./types";

export type TenantGeneralSettings = {
  name: string;
  slug: string;
  timezone: string;
  locale: string;
};

export type TenantIntegrationSettings = {
  pollingMinutesUber: number;
  pollingMinutesFreeNow: number;
  /** FreeNow public company id (e.g. GEYTMOBQGE). Falls back to env when empty. */
  freenowPublicCompanyId: string;
  /** Optional Uber org UUID override; falls back to UBER_ORG_ID / first org from API. */
  uberOrgId: string;
  uberSyncDays: number;
  freenowSyncDays: number;
};

/** Super Admin impersonating a tenant (platform support view). */
export function canViewTenantPlatformIds(session: AppSession): boolean {
  return session.kind === "tenant" && session.impersonating === true;
}

export function integrationSettingsForSession(
  session: AppSession,
  settings: TenantIntegrationSettings,
): TenantIntegrationSettings {
  if (canViewTenantPlatformIds(session)) return settings;
  return { ...settings, freenowPublicCompanyId: "", uberOrgId: "" };
}

const DEFAULT_INTEGRATIONS: TenantIntegrationSettings = {
  pollingMinutesUber: 15,
  pollingMinutesFreeNow: 15,
  freenowPublicCompanyId: "",
  uberOrgId: "",
  uberSyncDays: 7,
  freenowSyncDays: 7,
};

const ALLOWED_TIMEZONES = new Set([
  "Europe/Madrid",
  "Europe/Lisbon",
  "Atlantic/Canary",
  "Europe/London",
  "UTC",
]);

function parseIntegrations(raw: unknown): TenantIntegrationSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_INTEGRATIONS;
  const i = (raw as { integrations?: unknown }).integrations;
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

export async function updateTenantIntegrationSettings(
  session: AppSession,
  body: unknown,
): Promise<Result<TenantIntegrationSettings, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }

  const b = body as Partial<TenantIntegrationSettings>;
  const pollingMinutesUber = Number(b.pollingMinutesUber);
  const pollingMinutesFreeNow = Number(b.pollingMinutesFreeNow);
  const uberSyncDays = Number(b.uberSyncDays);
  const freenowSyncDays = Number(b.freenowSyncDays);

  if (
    !Number.isFinite(pollingMinutesUber) ||
    !Number.isFinite(pollingMinutesFreeNow) ||
    pollingMinutesUber < 5 ||
    pollingMinutesFreeNow < 5
  ) {
    return err({ message: "Intervalos de polling no válidos (mínimo 5 min)." });
  }

  if (!Number.isFinite(uberSyncDays) || uberSyncDays < 1 || uberSyncDays > 28) {
    return err({ message: "Ventana Uber debe ser entre 1 y 28 días." });
  }

  if (!Number.isFinite(freenowSyncDays) || freenowSyncDays < 1 || freenowSyncDays > 28) {
    return err({ message: "Ventana FreeNow debe ser entre 1 y 28 días." });
  }

  const tenantId = session.tid;
  const updated = await withTenantRls(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) return null;

    const existing = parseIntegrations(tenant.settings);
    const canEditPlatformIds = canViewTenantPlatformIds(session);

    const integrations: TenantIntegrationSettings = {
      pollingMinutesUber: Math.round(pollingMinutesUber),
      pollingMinutesFreeNow: Math.round(pollingMinutesFreeNow),
      freenowPublicCompanyId: canEditPlatformIds
        ? String(b.freenowPublicCompanyId ?? "").trim()
        : existing.freenowPublicCompanyId,
      uberOrgId: canEditPlatformIds ? String(b.uberOrgId ?? "").trim() : existing.uberOrgId,
      uberSyncDays: Math.round(uberSyncDays),
      freenowSyncDays: Math.round(freenowSyncDays),
    };

    const current =
      tenant.settings && typeof tenant.settings === "object"
        ? (tenant.settings as Record<string, unknown>)
        : {};

    await tx.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...current, integrations } },
    });

    return integrations;
  });
  if (!updated) {
    return err({
      message:
        "Tenant no encontrado. Cierra sesión y vuelve a entrar; si persiste, contacta con soporte.",
    });
  }
  const integrations = updated;

  await writeAuditLog({
    tenantId: session.tid,
    actorUserId: session.sub,
    action: "tenant.settings.integrations",
    entityType: "tenant",
    entityId: session.tid,
    payload: integrations,
  });

  return ok(integrations);
}

export async function getTenantGeneralSettings(
  tenantId: string,
): Promise<TenantGeneralSettings | null> {
  return withTenantRls(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true, timezone: true, locale: true },
    });
    return tenant ?? null;
  });
}

export async function getTenantIntegrationSettings(
  tenantId: string,
): Promise<TenantIntegrationSettings> {
  const tenant = await withTenantRls(tenantId, (tx) =>
    tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    }),
  );
  return parseIntegrations(tenant?.settings);
}

export async function updateTenantGeneralSettings(
  session: AppSession,
  body: unknown,
): Promise<Result<TenantGeneralSettings, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }

  const b = body as {
    name?: string;
    timezone?: string;
  };

  const timezone = b.timezone?.trim() ?? "";
  const nameFromBody = b.name?.trim();

  if (!ALLOWED_TIMEZONES.has(timezone)) {
    return err({ message: "Zona horaria no válida." });
  }

  const tenantId = session.tid;
  const canRenameTenant = session.impersonating === true;

  if (canRenameTenant && nameFromBody !== undefined && !nameFromBody) {
    return err({ message: "El nombre del tenant es obligatorio." });
  }

  const updated = await withTenantRls(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true, timezone: true, locale: true, settings: true },
    });
    if (!tenant) return null;

    const current =
      tenant.settings && typeof tenant.settings === "object"
        ? (tenant.settings as Record<string, unknown>)
        : {};

    const integrations = parseIntegrations(tenant.settings);
    const name =
      canRenameTenant && nameFromBody !== undefined ? nameFromBody : tenant.name;

    return tx.tenant.update({
      where: { id: tenantId },
      data: {
        name,
        timezone,
        settings: { ...current, integrations },
      },
      select: { name: true, slug: true, timezone: true, locale: true },
    });
  });

  if (!updated) {
    return err({
      message:
        "Tenant no encontrado. Cierra sesión y vuelve a entrar; si persiste, contacta con soporte.",
    });
  }

  await writeAuditLog({
    tenantId,
    actorUserId: session.sub,
    action: "tenant.settings.general",
    entityType: "tenant",
    entityId: tenantId,
    payload: {
      name: updated.name,
      timezone: updated.timezone,
      locale: updated.locale,
    },
  });

  return ok(updated);
}
