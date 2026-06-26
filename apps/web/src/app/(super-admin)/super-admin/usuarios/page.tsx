import Link from "next/link";
import { getSession } from "@/features/auth/server/session.service";
import { listAllUsersForSuperAdmin } from "@/features/super-admin/server/users.queries";
import { SuperAdminPrimaryLink } from "@/features/super-admin/ui/super-admin-action-links";
import { SuperAdminUsersList } from "@/features/super-admin/ui/super-admin-users-list";
import {
  SuperAdminCard,
  SuperAdminPageChrome,
  SuperAdminPanelHeader,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function SuperAdminUsuariosPage() {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  const users = await listAllUsersForSuperAdmin();

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.users.title")}
      subtitle={t("superAdmin.pages.users.subtitle")}
      actions={
        <SuperAdminPrimaryLink href="/super-admin/usuarios/nuevo">
          {t("superAdmin.pages.dashboard.newSuperAdmin")}
        </SuperAdminPrimaryLink>
      }
    >
      <SuperAdminCard className="overflow-hidden p-0">
        <SuperAdminPanelHeader
          title={t("superAdmin.pages.users.allUsers", { count: users.length })}
          trailing={
            <Link href="/super-admin" className="text-xs font-semibold text-orange-600 hover:underline">
              {t("superAdmin.common.backToPanel")}
            </Link>
          }
        />
        <SuperAdminUsersList users={users} />
      </SuperAdminCard>
    </SuperAdminPageChrome>
  );
}
