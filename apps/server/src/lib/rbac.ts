import { TenantRole } from "@fleethub/db";
import type { AppSession } from "@fleethub/auth";
import { canExportTenantData } from "@fleethub/auth/rbac";

export function requireTenantSession(session: AppSession | null): AppSession & {
  kind: "tenant";
  tid: string;
} {
  if (!session || session.kind !== "tenant" || !session.tid) {
    throw new Error("UNAUTHORIZED");
  }
  return session as AppSession & { kind: "tenant"; tid: string };
}

export function requireAdminTenant(session: AppSession | null): AppSession & {
  kind: "tenant";
  tid: string;
} {
  const s = requireTenantSession(session);
  if (s.role !== TenantRole.ADMIN_TENANT) {
    throw new Error("FORBIDDEN");
  }
  return s;
}

export function requireNotReadOnly(session: AppSession | null): AppSession & {
  kind: "tenant";
  tid: string;
} {
  const s = requireTenantSession(session);
  if (s.role === TenantRole.SOLO_LECTURA) {
    throw new Error("FORBIDDEN");
  }
  return s;
}

/** Gestor + Admin — operaciones de escritura operativa (conductores, turnos). */
export function requireOperativaWrite(session: AppSession | null): AppSession & {
  kind: "tenant";
  tid: string;
} {
  const s = requireNotReadOnly(session);
  if (s.role !== TenantRole.ADMIN_TENANT && s.role !== TenantRole.GESTOR) {
    throw new Error("FORBIDDEN");
  }
  return s;
}

/** CSV / Excel / ZIP / PDF exports — all tenant roles including solo lectura. */
export function requireExportSession(session: AppSession | null): AppSession & {
  kind: "tenant";
  tid: string;
} {
  const s = requireTenantSession(session);
  if (!canExportTenantData(s.role)) {
    throw new Error("FORBIDDEN");
  }
  return s;
}

export function httpStatusForRbacError(code: string): number {
  if (code === "UNAUTHORIZED") return 401;
  if (code === "FORBIDDEN") return 403;
  return 500;
}
