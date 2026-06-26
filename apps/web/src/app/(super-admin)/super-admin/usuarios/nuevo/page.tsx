import { getSession } from "@/features/auth/server/session.service";
import { SuperAdminUserForm } from "@/features/super-admin/ui/super-admin-user-form";
import {
  SuperAdminCard,
  SuperAdminCenteredForm,
  SuperAdminPageChrome,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function SuperAdminNuevoUsuarioPage() {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.users.newTitle")}
      subtitle={t("superAdmin.pages.users.newSubtitle")}
      backHref="/super-admin/usuarios"
    >
      <SuperAdminCenteredForm maxWidthClass="max-w-3xl">
        <SuperAdminCard className="p-5 md:p-6">
          <SuperAdminUserForm />
        </SuperAdminCard>
      </SuperAdminCenteredForm>
    </SuperAdminPageChrome>
  );
}
