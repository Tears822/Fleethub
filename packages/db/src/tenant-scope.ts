import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./client";

export type WithTenantTransactionOptions = {
  timeout?: number;
  maxWait?: number;
};

/**
 * Runs `callback` inside a transaction with PostgreSQL RLS tenant context:
 * `SET LOCAL app.tenant_id = '<uuid>'` so policies using `current_setting` apply.
 * Use for every query touching tenant-scoped tables from the API layer.
 */
export async function withTenant<T>(
  tenantId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  client: PrismaClient = prisma,
  txOptions?: WithTenantTransactionOptions,
): Promise<T> {
  return client.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)`;
      return callback(tx);
    },
    {
      timeout: txOptions?.timeout,
      maxWait: txOptions?.maxWait,
    },
  );
}

/**
 * Super-admin routes: sets `app.platform_scope = super_admin` for the transaction so
 * permissive RLS policies on tenant-scoped tables allow global reads.
 *
 * When `tenantId` is set, also sets `app.tenant_id` so FOR ALL tenant-isolation policies
 * allow update/delete on that tenant (platform_scope alone is SELECT-only on tenants).
 */
export async function withoutTenant<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  client: PrismaClient = prisma,
  tenantId?: string,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.platform_scope', 'super_admin', true)`;
    if (tenantId) {
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}::text, true)`;
    }
    return callback(tx);
  });
}

/**
 * RLS-safe reads/writes for a single tenant from the API (`fleethub_app`).
 * Sets `platform_scope` + `tenant_id` — required for tenants table mutations under FORCE RLS.
 */
export async function withTenantRls<T>(
  tenantId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  return withoutTenant(callback, client, tenantId);
}
