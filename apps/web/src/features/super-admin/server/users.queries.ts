import "server-only";

import { withoutTenant } from "@/infrastructure/database";
import { TenantRole } from "@prisma/client";
import {
  displayName,
  roleToLabel,
  type UserRoleLabel,
} from "@/features/settings/lib/tenant-user-roles";

export type SuperAdminUserRow = {
  id: string;
  kind: "platform" | "tenant";
  tenantId?: string;
  tenantSlug?: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "gestor" | "lectura";
  roleLabel: string;
  tenants: string[];
  status: "Activo" | "Inactivo";
  totpEnabled: boolean;
  self?: boolean;
};

export type SuperAdminUserEditSnapshot =
  | {
      kind: "platform";
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      isActive: boolean;
      totpEnabled: boolean;
    }
  | {
      kind: "tenant";
      id: string;
      tenantId: string;
      tenantName: string;
      firstName: string;
      lastName: string;
      email: string;
      role: UserRoleLabel;
      isActive: boolean;
      totpEnabled: boolean;
      companyIds: string[];
      companies: { id: string; legalName: string }[];
    };

function tenantRoleLabel(role: TenantRole): SuperAdminUserRow["role"] {
  switch (role) {
    case TenantRole.ADMIN_TENANT:
      return "admin";
    case TenantRole.GESTOR:
      return "gestor";
    case TenantRole.SOLO_LECTURA:
      return "lectura";
    default:
      return "admin";
  }
}

function roleDisplayLabel(role: SuperAdminUserRow["role"]): string {
  switch (role) {
    case "superadmin":
      return "Super Admin";
    case "admin":
      return "Admin";
    case "gestor":
      return "Gestor";
    case "lectura":
      return "Solo lectura";
    default:
      return role;
  }
}

function displayUserName(
  firstName: string | null,
  lastName: string | null,
  email: string,
): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || email.split("@")[0] || email;
}

/** All tenant users + platform super-admins for the SA users screen. */
export async function listAllUsersForSuperAdmin(): Promise<SuperAdminUserRow[]> {
  const [tenantUsers, platformUsers] = await withoutTenant((db) =>
    Promise.all([
      db.user.findMany({
        orderBy: { createdAt: "desc" },
        include: { tenant: { select: { id: true, name: true, slug: true } } },
      }),
      db.platformUser.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          isActive: true,
          totpEnabled: true,
        },
      }),
    ]),
  );

  const rows: SuperAdminUserRow[] = tenantUsers.map((u) => {
    const role = tenantRoleLabel(u.role);
    return {
      id: u.id,
      kind: "tenant",
      tenantId: u.tenant.id,
      tenantSlug: u.tenant.slug,
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      name: displayUserName(u.firstName, u.lastName, u.email),
      email: u.email,
      role,
      roleLabel: roleDisplayLabel(role),
      tenants: [u.tenant.name],
      status: u.isActive ? "Activo" : "Inactivo",
      totpEnabled: u.totpEnabled,
    };
  });

  for (const p of platformUsers) {
    rows.push({
      id: p.id,
      kind: "platform",
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      name: displayUserName(p.firstName, p.lastName, p.email),
      email: p.email,
      role: "superadmin",
      roleLabel: roleDisplayLabel("superadmin"),
      tenants: [],
      status: p.isActive ? "Activo" : "Inactivo",
      totpEnabled: p.totpEnabled,
      self: p.email === "superadmin@fleethub.local",
    });
  }

  return rows;
}

export async function getSuperAdminUserForEdit(
  userId: string,
): Promise<SuperAdminUserEditSnapshot | null> {
  return withoutTenant(async (db) => {
    const platform = await db.platformUser.findUnique({ where: { id: userId } });
    if (platform) {
      return {
        kind: "platform",
        id: platform.id,
        firstName: platform.firstName ?? "",
        lastName: platform.lastName ?? "",
        email: platform.email,
        isActive: platform.isActive,
        totpEnabled: platform.totpEnabled,
      };
    }

    const tenantUser = await db.user.findUnique({
      where: { id: userId },
      include: {
        tenant: { select: { id: true, name: true } },
        companies: { select: { companyId: true } },
      },
    });
    if (!tenantUser) return null;

    const companies = await db.company.findMany({
      where: { tenantId: tenantUser.tenantId, isActive: true },
      orderBy: { legalName: "asc" },
      select: { id: true, legalName: true },
    });

    return {
      kind: "tenant",
      id: tenantUser.id,
      tenantId: tenantUser.tenant.id,
      tenantName: tenantUser.tenant.name,
      firstName: tenantUser.firstName ?? "",
      lastName: tenantUser.lastName ?? "",
      email: tenantUser.email,
      role: roleToLabel(tenantUser.role),
      isActive: tenantUser.isActive,
      totpEnabled: tenantUser.totpEnabled,
      companyIds: tenantUser.companies.map((c) => c.companyId),
      companies,
    };
  });
}
