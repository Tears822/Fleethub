import Link from "next/link";
import { getSession } from "@/features/auth/server/session.service";
import {
  listAllTenantsForSuperAdmin,
  loadSuperAdminPlatformStats,
} from "@/features/super-admin/server/tenants.queries";
import { listAllUsersForSuperAdmin } from "@/features/super-admin/server/users.queries";
import {
  SuperAdminOutlineLink,
  SuperAdminPrimaryLink,
} from "@/features/super-admin/ui/super-admin-action-links";
import { SuperAdminTenantsTableCompact } from "@/features/super-admin/ui/super-admin-tenants-table";
import { SuperAdminUsersTableCompact } from "@/features/super-admin/ui/super-admin-users-table";
import { SuperAdminPlatformHero } from "@/features/super-admin/ui/super-admin-platform-hero";
import {
  SuperAdminCard,
  SuperAdminPageChrome,
  SuperAdminPanelHeader,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function SuperAdminDashboardPage() {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t, locale } = await getSessionTranslator(session);

  const [stats, tenants, users] = await Promise.all([
    loadSuperAdminPlatformStats(),
    listAllTenantsForSuperAdmin(),
    listAllUsersForSuperAdmin(),
  ]);
  const recentUsers = users.slice(0, 5);
  const dateLocale = locale === "ca" ? "ca-ES" : "es-ES";
  const today = new Date().toLocaleDateString(dateLocale);
  const recentTenants = tenants.slice(0, 5);

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.dashboard.title")}
      subtitle={t("superAdmin.pages.dashboard.subtitle")}
      badge={
        <span className="text-xs font-semibold text-red-600">
          {t("superAdmin.common.restrictedAccess")}
        </span>
      }
    >
      <SuperAdminPlatformHero stats={stats} dateLabel={today} />

      <div className="flex flex-wrap gap-2">
        <SuperAdminPrimaryLink href="/super-admin/tenants/nuevo">
          {t("superAdmin.pages.dashboard.newTenant")}
        </SuperAdminPrimaryLink>
        <SuperAdminPrimaryLink href="/super-admin/usuarios/nuevo">
          {t("superAdmin.pages.dashboard.newSuperAdmin")}
        </SuperAdminPrimaryLink>
        <SuperAdminOutlineLink href="/super-admin/tenants">
          {t("superAdmin.common.viewAllTenants")}
        </SuperAdminOutlineLink>
        <SuperAdminOutlineLink href="/super-admin/usuarios">
          {t("superAdmin.common.viewAllUsers")}
        </SuperAdminOutlineLink>
        <SuperAdminOutlineLink href="/super-admin/informe">
          {t("superAdmin.pages.dashboard.driverReport")}
        </SuperAdminOutlineLink>
        <SuperAdminOutlineLink href="/super-admin/sync">
          {t("superAdmin.pages.dashboard.syncErrors")}
        </SuperAdminOutlineLink>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SuperAdminCard className="overflow-hidden p-0">
          <SuperAdminPanelHeader
            title={t("superAdmin.pages.dashboard.recentTenants")}
            trailing={
              <Link href="/super-admin/tenants" className="text-xs font-semibold text-orange-600 hover:underline">
                {t("superAdmin.common.viewAll")}
              </Link>
            }
          />
          <SuperAdminTenantsTableCompact tenants={recentTenants} showActions />
        </SuperAdminCard>

        <SuperAdminCard className="overflow-hidden p-0">
          <SuperAdminPanelHeader
            title={t("superAdmin.pages.dashboard.recentUsers")}
            trailing={
              <Link href="/super-admin/usuarios" className="text-xs font-semibold text-orange-600 hover:underline">
                {t("superAdmin.common.viewAll")}
              </Link>
            }
          />
          <SuperAdminUsersTableCompact users={recentUsers} showActions />
        </SuperAdminCard>
      </div>
    </SuperAdminPageChrome>
  );
}
