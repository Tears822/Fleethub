import Link from "next/link";
import { assertTenantRouteAllowed } from "@/features/auth/server/route-guard";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { EmpresaForm } from "@/features/companies/ui/empresa-form";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function EmpresasNuevoPage() {
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  assertTenantRouteAllowed(session, "/empresas/nuevo");

  return (
    <ShellPage
      title={t("pages.newCompany")}
      description="Alta de razón social en el tenant"
      actions={
        <Link href="/empresas" className="erp-btn-outline text-xs">
          ← Volver al listado
        </Link>
      }
    >
      <EmpresaForm mode="create" />
    </ShellPage>
  );
}
