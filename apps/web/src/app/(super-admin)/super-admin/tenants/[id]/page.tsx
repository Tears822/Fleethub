import { notFound } from "next/navigation";
import { getSession } from "@/features/auth/server/session.service";
import {
  getTenantByIdForSuperAdmin,
  listTenantCompaniesForSuperAdmin,
} from "@/features/super-admin/server/tenants.queries";
import { SuperAdminTenantCompaniesPanel } from "@/features/super-admin/ui/super-admin-tenant-companies-panel";
import { SuperAdminImpersonateButton } from "@/features/super-admin/ui/super-admin-impersonate-button";
import { SuperAdminTenantForm } from "@/features/super-admin/ui/super-admin-tenant-form";
import {
  SuperAdminCard,
  SuperAdminCenteredForm,
  SuperAdminPageChrome,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SuperAdminEditTenantPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  const { id } = await params;
  const [tenant, companies] = await Promise.all([
    getTenantByIdForSuperAdmin(id),
    listTenantCompaniesForSuperAdmin(id),
  ]);
  if (!tenant) {
    notFound();
  }

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.tenants.editTitle")}
      subtitle={t("superAdmin.pages.tenants.editSubtitle")}
      backHref="/super-admin/tenants"
      actions={<SuperAdminImpersonateButton tenantId={tenant.id} tenantName={tenant.name} />}
    >
      <SuperAdminCenteredForm maxWidthClass="max-w-4xl">
        <SuperAdminCard className="p-5 md:p-6">
          <SuperAdminTenantForm mode="edit" initial={tenant} cancelHref="/super-admin/tenants" />
          <SuperAdminTenantCompaniesPanel
            tenantId={tenant.id}
            tenantName={tenant.name}
            initialCompanies={companies}
          />
        </SuperAdminCard>
      </SuperAdminCenteredForm>
    </SuperAdminPageChrome>
  );
}
