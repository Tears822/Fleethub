import { lookupTenantIdBySlug, prisma } from "@fleethub/db";
import type { WebhookPlatform } from "./webhook-verify.js";

function headerString(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name.toLowerCase()] ?? headers[name];
  if (typeof v === "string") return v.trim() || undefined;
  if (Array.isArray(v)) return v[0]?.trim() || undefined;
  return undefined;
}

function pickEventType(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.event_type === "string") return o.event_type;
  if (typeof o.eventType === "string") return o.eventType;
  if (typeof o.type === "string") return o.type;
  return null;
}

/** Resolve tenant for webhook stub (slug header required; Uber org id optional fallback). */
export async function resolveWebhookTenant(
  platform: WebhookPlatform,
  headers: Record<string, string | string[] | undefined>,
  body: unknown,
): Promise<{ tenantId: string; tenantSlug: string } | { error: string; status: 400 }> {
  const slug =
    headerString(headers, "x-fleethub-tenant-slug") ??
    headerString(headers, "x-tenant-slug");

  if (slug) {
    const tenantId = await lookupTenantIdBySlug(slug);
    if (!tenantId) {
      return { error: `Tenant no encontrado: ${slug}`, status: 400 };
    }
    return { tenantId, tenantSlug: slug };
  }

  if (platform === "uber" && body && typeof body === "object") {
    const orgId =
      (body as { organization_id?: string }).organization_id ??
      (body as { meta?: { organization_id?: string } }).meta?.organization_id;
    if (typeof orgId === "string" && orgId.trim()) {
      const tenant = await prisma.tenant.findFirst({
        where: {
          settings: { path: ["integrations", "uberOrgId"], equals: orgId.trim() },
        },
        select: { id: true, slug: true },
      });
      if (tenant) {
        return { tenantId: tenant.id, tenantSlug: tenant.slug };
      }
    }
  }

  return {
    error:
      "Indica el tenant con la cabecera X-FleetHub-Tenant-Slug (ej. demo-a) o configura uberOrgId en integraciones.",
    status: 400,
  };
}

export function summarizeWebhookPayload(platform: WebhookPlatform, body: unknown) {
  return {
    platform,
    eventType: pickEventType(body),
    payloadKeys:
      body && typeof body === "object" ? Object.keys(body as object).slice(0, 12) : [],
  };
}
