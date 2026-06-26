import Link from "next/link";
import { getSession } from "@/features/auth/server/session.service";
import { listAllTenantsForSuperAdmin } from "@/features/super-admin/server/tenants.queries";
import { SuperAdminPrimaryLink } from "@/features/super-admin/ui/super-admin-action-links";
import { SuperAdminTenantsList } from "@/features/super-admin/ui/super-admin-tenants-list";
import {
  SuperAdminCard,
  SuperAdminPageChrome,
  SuperAdminPanelHeader,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function SuperAdminTenantsPage() {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  const tenants = await listAllTenantsForSuperAdmin();

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.tenants.title")}
      subtitle={t("superAdmin.pages.tenants.subtitle")}
      actions={
        <SuperAdminPrimaryLink href="/super-admin/tenants/nuevo">
          {t("superAdmin.pages.dashboard.newTenant")}
        </SuperAdminPrimaryLink>
      }
    >
      <SuperAdminCard className="overflow-hidden p-0">
        <SuperAdminPanelHeader
          title={t("superAdmin.pages.tenants.allTenants", { count: tenants.length })}
          trailing={
            <Link href="/super-admin" className="text-xs font-semibold text-orange-600 hover:underline">
              {t("superAdmin.common.backToPanel")}
            </Link>
          }
        />
        <SuperAdminTenantsList tenants={tenants} />
      </SuperAdminCard>
    </SuperAdminPageChrome>
  );
}
