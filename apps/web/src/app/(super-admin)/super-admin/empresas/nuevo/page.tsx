import { getSession } from "@/features/auth/server/session.service";
import { listTenantOptionsForSuperAdmin } from "@/features/super-admin/server/companies.queries";
import { SuperAdminCompanyCreateForm } from "@/features/super-admin/ui/super-admin-company-create-form";
import {
  SuperAdminCard,
  SuperAdminCenteredForm,
  SuperAdminPageChrome,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function SuperAdminEmpresasNuevoPage() {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  const tenants = await listTenantOptionsForSuperAdmin();

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.companies.newTitle")}
      subtitle={t("superAdmin.pages.companies.newSubtitle")}
      backHref="/super-admin/empresas"
    >
      <SuperAdminCenteredForm maxWidthClass="max-w-4xl">
        <SuperAdminCard className="p-5 md:p-6">
          <SuperAdminCompanyCreateForm tenants={tenants} />
        </SuperAdminCard>
      </SuperAdminCenteredForm>
    </SuperAdminPageChrome>
  );
}
