import { getTenantIntegrationSettings } from "@fleethub/auth";
import { prisma } from "@fleethub/db";
import { defaultFreenowPublicCompanyForTenantSlug } from "./freenow-tenant-company-map.js";
import { defaultUberOrgForTenantSlug } from "./uber-tenant-org-map.js";

function pickEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : undefined;
}

async function resolveTenantSlug(tenantId: string): Promise<string | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { slug: true },
  });
  return tenant?.slug ?? null;
}

/** Per-tenant platform ids with slug map + server .env fallback (OAuth stays global in .env). */
export async function resolveTenantFreenowPublicCompanyId(tenantId: string): Promise<string> {
  const settings = await getTenantIntegrationSettings(tenantId);
  if (settings.freenowPublicCompanyId) return settings.freenowPublicCompanyId;

  const slug = await resolveTenantSlug(tenantId);
  const fromSlug = slug ? defaultFreenowPublicCompanyForTenantSlug(slug) : undefined;
  return fromSlug || pickEnv("FREENOW_PUBLIC_COMPANY_ID") || "GEYTMOBQGE";
}

export async function resolveTenantUberOrgId(tenantId: string): Promise<string | undefined> {
  const settings = await getTenantIntegrationSettings(tenantId);
  if (settings.uberOrgId) return settings.uberOrgId;

  const slug = await resolveTenantSlug(tenantId);
  const fromSlug = slug ? defaultUberOrgForTenantSlug(slug)?.orgId : undefined;
  return fromSlug || pickEnv("UBER_ORG_ID");
}

export async function resolveTenantUberSyncDays(tenantId: string): Promise<number> {
  const settings = await getTenantIntegrationSettings(tenantId);
  return settings.uberSyncDays;
}

export async function resolveTenantFreenowSyncDays(tenantId: string): Promise<number> {
  const settings = await getTenantIntegrationSettings(tenantId);
  return settings.freenowSyncDays;
}
