import "server-only";

import { TenantRole } from "@prisma/client";
import { withTenant } from "@/infrastructure/database";
import { displayName, roleToLabel, type UserRoleLabel } from "@/features/settings/lib/tenant-user-roles";

export type TenantUserSettingsRow = {
  id: string;
  email: string;
  name: string;
  role: UserRoleLabel;
  roleRaw: TenantRole;
  isActive: boolean;
  pendingActivation: boolean;
  companyIds: string[];
  companyNames: string[];
};

export async function listTenantUsersForSettings(
  tenantId: string,
): Promise<TenantUserSettingsRow[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.user.findMany({
      where: { email: { not: { endsWith: "@fleethub.local" } } },
      orderBy: [{ isActive: "desc" }, { email: "asc" }],
      include: {
        companies: {
          include: { company: { select: { id: true, legalName: true, isActive: true } } },
        },
      },
    }),
  );

  return rows.map((u) => {
    const links = u.companies.filter((l) => l.company.isActive);
    return {
      id: u.id,
      email: u.email,
      name: displayName(u.firstName, u.lastName, u.email),
      role: roleToLabel(u.role),
      roleRaw: u.role,
      isActive: u.isActive,
      pendingActivation: !u.emailVerifiedAt,
      companyIds: links.map((l) => l.company.id),
      companyNames: links.map((l) => l.company.legalName),
    };
  });
}
