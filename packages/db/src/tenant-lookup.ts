import type { PrismaClient } from "@prisma/client";
import { prisma } from "./client";

/**
 * Resolves a tenant slug to id before `app.tenant_id` is set on the session.
 * Uses SQL function `app_lookup_tenant_by_slug` (SECURITY DEFINER) so RLS on `tenants` does not block login.
 */
export async function lookupTenantIdBySlug(
  slug: string,
  client: Pick<PrismaClient, "$queryRaw"> = prisma
): Promise<string | null> {
  const rows = await client.$queryRaw<Array<{ id: string | null }>>`
    SELECT (public.app_lookup_tenant_by_slug(${slug}))::text AS id
  `;
  const id = rows[0]?.id;
  return id ?? null;
}
