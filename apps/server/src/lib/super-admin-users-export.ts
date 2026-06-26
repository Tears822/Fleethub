import ExcelJS from "exceljs";
import { prisma, TenantRole } from "@fleethub/db";

function displayName(firstName: string | null, lastName: string | null, email: string): string {
  const full = [firstName, lastName].filter(Boolean).join(" ").trim();
  return full || email.split("@")[0] || email;
}

function tenantRoleLabel(role: TenantRole): string {
  switch (role) {
    case TenantRole.ADMIN_TENANT:
      return "Admin";
    case TenantRole.GESTOR:
      return "Gestor";
    case TenantRole.SOLO_LECTURA:
      return "Solo lectura";
    default:
      return "Admin";
  }
}

export async function buildSuperAdminUsersXlsx(): Promise<Buffer> {
  const [tenantUsers, platformUsers] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ tenant: { name: "asc" } }, { email: "asc" }],
      include: { tenant: { select: { name: true, slug: true } } },
    }),
    prisma.platformUser.findMany({
      orderBy: { email: "asc" },
    }),
  ]);

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Usuarios");
  sheet.columns = [
    { header: "Tipo", key: "kind", width: 14 },
    { header: "Nombre", key: "firstName", width: 16 },
    { header: "Apellidos", key: "lastName", width: 18 },
    { header: "Nombre mostrado", key: "displayName", width: 22 },
    { header: "Email", key: "email", width: 28 },
    { header: "Rol", key: "role", width: 14 },
    { header: "Operador / tenant", key: "tenants", width: 24 },
    { header: "Slug operador", key: "tenantSlug", width: 18 },
    { header: "2FA activo", key: "totp", width: 10 },
    { header: "Estado", key: "status", width: 10 },
    { header: "ID usuario", key: "id", width: 38 },
  ];

  for (const u of tenantUsers) {
    sheet.addRow({
      kind: "Usuario tenant",
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      displayName: displayName(u.firstName, u.lastName, u.email),
      email: u.email,
      role: tenantRoleLabel(u.role),
      tenants: u.tenant.name,
      tenantSlug: u.tenant.slug,
      totp: u.totpEnabled ? "Sí" : "No",
      status: u.isActive ? "Activo" : "Inactivo",
      id: u.id,
    });
  }

  for (const p of platformUsers) {
    sheet.addRow({
      kind: "Super Admin",
      firstName: p.firstName ?? "",
      lastName: p.lastName ?? "",
      displayName: displayName(p.firstName, p.lastName, p.email),
      email: p.email,
      role: "Super Admin",
      tenants: "",
      tenantSlug: "",
      totp: p.totpEnabled ? "Sí" : "No",
      status: p.isActive ? "Activo" : "Inactivo",
      id: p.id,
    });
  }

  sheet.getRow(1).font = { bold: true };
  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
