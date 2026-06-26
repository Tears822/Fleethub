import type { LucideIcon } from "lucide-react";
import { canManageShifts, canManageTenantSettings } from "@/domain/rbac.policy";
import {
  Banknote,
  BarChart3,
  Building2,
  CarFront,
  CheckSquare,
  ClipboardList,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";

export type NavItem = {
  href: string;
  /** i18n key under `nav.*` */
  labelKey: string;
  icon: LucideIcon;
  visibleForRole?: (role: string) => boolean;
};

export type NavGroup = {
  id: string;
  /** i18n key under `nav.sections.*` */
  sectionLabelKey: string;
  items: NavItem[];
};

export const shellNavGroups: NavGroup[] = [
  {
    id: "operativa",
    sectionLabelKey: "nav.sections.operativa",
    items: [
      { href: "/dashboard", labelKey: "nav.dashboard", icon: LayoutDashboard },
      { href: "/apps", labelKey: "nav.apps", icon: CarFront },
      {
        href: "/cerrar-turnos",
        labelKey: "nav.cerrarTurnos",
        icon: CheckSquare,
        visibleForRole: (role) => canManageShifts(role),
      },
      { href: "/turnos-cerrados", labelKey: "nav.turnosCerrados", icon: ClipboardList },
    ],
  },
  {
    id: "gestion",
    sectionLabelKey: "nav.sections.gestion",
    items: [
      { href: "/conductores", labelKey: "nav.conductores", icon: Users },
      { href: "/empresas", labelKey: "nav.empresas", icon: Building2 },
      { href: "/facturacion", labelKey: "nav.facturacion", icon: Banknote },
      { href: "/analitica", labelKey: "nav.analitica", icon: BarChart3 },
    ],
  },
  {
    id: "sistema",
    sectionLabelKey: "nav.sections.sistema",
    items: [
      {
        href: "/configuracion",
        labelKey: "nav.configuracion",
        icon: Settings,
        visibleForRole: (role) => canManageTenantSettings(role),
      },
    ],
  },
];

/** Flat list for title resolution, smoke tests, etc. */
export function flattenShellNavItems(): NavItem[] {
  return shellNavGroups.flatMap((g) => g.items);
}

export function getShellNavTitle(pathname: string, t: (key: string) => string): string {
  if (pathname === "/ajustes" || pathname.startsWith("/ajustes/")) {
    return t("common.settings");
  }
  for (const item of flattenShellNavItems()) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      return t(item.labelKey);
    }
  }
  return t("common.panel");
}
