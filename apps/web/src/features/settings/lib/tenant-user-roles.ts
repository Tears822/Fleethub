import { TenantRole } from "@prisma/client";

export type UserRoleLabel = "Admin" | "Gestor" | "Solo lectura";

export function roleToLabel(role: TenantRole | string): UserRoleLabel {
  if (role === TenantRole.ADMIN_TENANT) return "Admin";
  if (role === TenantRole.GESTOR) return "Gestor";
  return "Solo lectura";
}

export function labelToRole(label: UserRoleLabel): TenantRole {
  if (label === "Admin") return TenantRole.ADMIN_TENANT;
  if (label === "Gestor") return TenantRole.GESTOR;
  return TenantRole.SOLO_LECTURA;
}

export function displayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  email: string,
): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || email.split("@")[0] || email;
}

export function splitFullName(name: string): { firstName: string; lastName: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}
