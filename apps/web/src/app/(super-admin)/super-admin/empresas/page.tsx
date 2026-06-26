import Link from "next/link";
import { getSession } from "@/features/auth/server/session.service";
import { listAllCompaniesForSuperAdmin } from "@/features/super-admin/server/companies.queries";
import { SuperAdminPrimaryLink } from "@/features/super-admin/ui/super-admin-action-links";
import { SuperAdminCompaniesList } from "@/features/super-admin/ui/super-admin-companies-list";
import {
  SuperAdminCard,
  SuperAdminPageChrome,
  SuperAdminPanelHeader,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function SuperAdminEmpresasPage() {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  const companies = await listAllCompaniesForSuperAdmin();

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.companies.title")}
      subtitle={t("superAdmin.pages.companies.subtitle")}
      actions={
        <SuperAdminPrimaryLink href="/super-admin/empresas/nuevo">
          {t("superAdmin.nav.newCompany")}
        </SuperAdminPrimaryLink>
      }
    >
      <SuperAdminCard className="overflow-hidden p-0">
        <SuperAdminPanelHeader
          title={t("superAdmin.pages.companies.allCompanies", { count: companies.length })}
          trailing={
            <Link href="/super-admin/tenants" className="text-xs font-semibold text-orange-600 hover:underline">
              {t("superAdmin.common.viewOperators")}
            </Link>
          }
        />
        <SuperAdminCompaniesList companies={companies} />
      </SuperAdminCard>
    </SuperAdminPageChrome>
  );
}
