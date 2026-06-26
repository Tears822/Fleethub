import { prisma } from "@fleethub/db";

export type EmailAccountConflict = {
  kind: "tenant" | "platform";
  tenantName?: string;
};

/** Email must be unique across all tenant users and platform (Super Admin) users. */
export async function findEmailAccountConflict(
  email: string,
  exclude?: { tenantUserId?: string; platformUserId?: string },
): Promise<EmailAccountConflict | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  const platform = await prisma.platformUser.findFirst({
    where: {
      email: normalized,
      ...(exclude?.platformUserId ? { NOT: { id: exclude.platformUserId } } : {}),
    },
    select: { id: true },
  });
  if (platform) return { kind: "platform" };

  const tenantUser = await prisma.user.findFirst({
    where: {
      email: normalized,
      ...(exclude?.tenantUserId ? { NOT: { id: exclude.tenantUserId } } : {}),
    },
    select: { id: true, tenant: { select: { name: true } } },
  });
  if (tenantUser) {
    return { kind: "tenant", tenantName: tenantUser.tenant.name };
  }

  return null;
}

export function emailConflictMessage(conflict: EmailAccountConflict): string {
  if (conflict.kind === "platform") {
    return "Ya existe un Super Admin con ese email.";
  }
  if (conflict.tenantName) {
    return `Ya existe un usuario con ese email (${conflict.tenantName}).`;
  }
  return "Ya existe un usuario con ese email.";
}
