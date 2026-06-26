import { notFound } from "next/navigation";
import { getSession } from "@/features/auth/server/session.service";
import { getSuperAdminUserForEdit } from "@/features/super-admin/server/users.queries";
import { SuperAdminUserEditForm } from "@/features/super-admin/ui/super-admin-user-edit-form";
import {
  SuperAdminCard,
  SuperAdminCenteredForm,
  SuperAdminPageChrome,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SuperAdminEditUserPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  const { id } = await params;
  const user = await getSuperAdminUserForEdit(id);
  if (!user) {
    notFound();
  }

  const subtitle =
    user.kind === "platform"
      ? t("superAdmin.pages.users.editSuperAdmin")
      : t("superAdmin.pages.users.editTenantUser", { tenantName: user.tenantName });

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.users.editTitle")}
      subtitle={subtitle}
      backHref="/super-admin/usuarios"
    >
      <SuperAdminCenteredForm maxWidthClass="max-w-3xl">
        <SuperAdminCard className="p-5 md:p-6">
          <SuperAdminUserEditForm initial={user} />
        </SuperAdminCard>
      </SuperAdminCenteredForm>
    </SuperAdminPageChrome>
  );
}
