import { getSession } from "@/features/auth/server/session.service";
import { EMPTY_TENANT_FORM } from "@/features/super-admin/lib/super-admin-tenant-form-data";
import { SuperAdminTenantForm } from "@/features/super-admin/ui/super-admin-tenant-form";
import {
  SuperAdminCard,
  SuperAdminCenteredForm,
  SuperAdminPageChrome,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function SuperAdminNuevoTenantPage() {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.tenants.newTitle")}
      subtitle={t("superAdmin.pages.tenants.newSubtitle")}
      backHref="/super-admin/tenants"
    >
      <SuperAdminCenteredForm maxWidthClass="max-w-3xl">
        <SuperAdminCard className="p-5 md:p-6">
          <SuperAdminTenantForm mode="create" initial={EMPTY_TENANT_FORM} cancelHref="/super-admin/tenants" />
        </SuperAdminCard>
      </SuperAdminCenteredForm>
    </SuperAdminPageChrome>
  );
}
