import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  Building2,
  Landmark,
  LayoutDashboard,
  Plus,
  Shield,
  Users,
} from "lucide-react";

export type SuperAdminNavItem = {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  accent?: boolean;
};

export type SuperAdminNavGroup = {
  id: string;
  sectionLabelKey: string;
  items: SuperAdminNavItem[];
};

export const superAdminNavGroups: SuperAdminNavGroup[] = [
  {
    id: "global",
    sectionLabelKey: "superAdmin.nav.sections.global",
    items: [
      { href: "/super-admin", labelKey: "superAdmin.nav.dashboard", icon: LayoutDashboard },
      { href: "/super-admin/informe", labelKey: "superAdmin.nav.informe", icon: BarChart3 },
      { href: "/super-admin/sync", labelKey: "superAdmin.nav.sync", icon: Activity },
    ],
  },
  {
    id: "tenants",
    sectionLabelKey: "superAdmin.nav.sections.tenants",
    items: [
      { href: "/super-admin/tenants", labelKey: "superAdmin.nav.tenants", icon: Building2 },
      { href: "/super-admin/empresas", labelKey: "superAdmin.nav.companies", icon: Landmark },
      {
        href: "/super-admin/tenants/nuevo",
        labelKey: "superAdmin.nav.newTenant",
        icon: Plus,
        accent: true,
      },
      {
        href: "/super-admin/empresas/nuevo",
        labelKey: "superAdmin.nav.newCompany",
        icon: Plus,
        accent: true,
      },
    ],
  },
  {
    id: "usuarios",
    sectionLabelKey: "superAdmin.nav.sections.users",
    items: [
      { href: "/super-admin/usuarios", labelKey: "superAdmin.nav.users", icon: Users },
      {
        href: "/super-admin/usuarios/nuevo",
        labelKey: "superAdmin.nav.newUser",
        icon: Plus,
        accent: true,
      },
    ],
  },
  {
    id: "cuenta",
    sectionLabelKey: "superAdmin.nav.sections.account",
    items: [
      { href: "/super-admin/seguridad", labelKey: "superAdmin.nav.security", icon: Shield },
    ],
  },
];

export function getSuperAdminNavTitleKey(pathname: string): string {
  if (
    /^\/super-admin\/tenants\/[^/]+$/.test(pathname) &&
    pathname !== "/super-admin/tenants/nuevo"
  ) {
    return "superAdmin.nav.editTenant";
  }
  if (/^\/super-admin\/empresas\/[^/]+\/editar$/.test(pathname)) {
    return "superAdmin.nav.editCompany";
  }
  if (pathname === "/super-admin/empresas/nuevo") {
    return "superAdmin.nav.newCompany";
  }
  if (pathname.startsWith("/super-admin/empresas")) {
    return "superAdmin.nav.companies";
  }
  for (const group of superAdminNavGroups) {
    for (const item of group.items) {
      if (
        pathname === item.href ||
        (item.href !== "/super-admin" && pathname.startsWith(`${item.href}/`))
      ) {
        return item.labelKey;
      }
    }
  }
  return "superAdmin.nav.dashboard";
}

/** @deprecated Use getSuperAdminNavTitleKey with t() */
export function getSuperAdminNavTitle(pathname: string): string {
  return getSuperAdminNavTitleKey(pathname);
}
