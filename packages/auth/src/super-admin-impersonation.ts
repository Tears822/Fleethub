import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { TenantRole, withoutTenant, writeAuditLog } from "@fleethub/db";
import { signSessionToken } from "./session-jwt";
import type { AppSession } from "./types";

export type ImpersonationStart = {
  tenantToken: string;
  redirectTo: string;
  tenantSlug: string;
};

export async function startTenantImpersonation(
  session: AppSession,
  tenantId: string,
): Promise<Result<ImpersonationStart, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }

  const tenant = await withoutTenant(
    (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, slug: true, name: true, commercialStatus: true, trialEndsAt: true },
      }),
    undefined,
    tenantId,
  );
  if (!tenant) {
    return err({ message: "Tenant no encontrado." });
  }

  const tenantToken = await signSessionToken({
    sub: session.sub,
    email: session.email,
    role: TenantRole.SOLO_LECTURA,
    kind: "tenant",
    tid: tenant.id,
    slug: tenant.slug,
    name: `SA → ${tenant.name}`,
    impersonating: true,
    platformActorSub: session.sub,
    platformActorEmail: session.email,
  });

  await writeAuditLog({
    actorUserId: session.sub,
    action: "impersonation.start",
    entityType: "tenant",
    entityId: tenant.id,
    payload: { slug: tenant.slug, readOnly: true },
  });

  return ok({
    tenantToken,
    redirectTo: "/dashboard",
    tenantSlug: tenant.slug,
  });
}

export type ImpersonationEnd = {
  platformToken: string;
  redirectTo: string;
};

export async function endTenantImpersonation(
  platformSession: AppSession,
): Promise<Result<ImpersonationEnd, { message: string }>> {
  if (platformSession.kind !== "platform") {
    return err({ message: "Sesión de plataforma no válida." });
  }

  const platformToken = await signSessionToken(platformSession);

  await writeAuditLog({
    actorUserId: platformSession.sub,
    action: "impersonation.end",
    entityType: "platform_user",
    entityId: platformSession.sub,
  });

  return ok({
    platformToken,
    redirectTo: "/super-admin",
  });
}
