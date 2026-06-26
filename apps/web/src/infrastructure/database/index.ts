/**
 * Single import surface for persistence. Features depend on this, not on `@fleethub/db` directly,
 * so the data layer can evolve (read replicas, tracing, etc.) without wide refactors.
 */
export {
  prisma,
  withTenant,
  withoutTenant,
  lookupTenantIdBySlug,
} from "@fleethub/db";
