import "server-only";

import { redirect } from "next/navigation";
import {
  getTenantRouteRestriction,
  isTenantRouteAllowed,
  redirectPathForRestriction,
} from "@/domain/rbac.policy";
import type { TenantSession } from "@/features/auth/server/session.service";

/** Server-side guard for tenant shell pages (complements edge middleware). */
export function assertTenantRouteAllowed(session: TenantSession, pathname: string): void {
  if (isTenantRouteAllowed(session.role, pathname)) return;
  const restriction = getTenantRouteRestriction(pathname);
  redirect(restriction ? redirectPathForRestriction(restriction) : "/dashboard");
}
