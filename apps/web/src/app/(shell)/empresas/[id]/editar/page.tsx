import Link from "next/link";
import { redirect } from "next/navigation";
import { assertTenantRouteAllowed } from "@/features/auth/server/route-guard";
import { resolveCompanyScope } from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { getCompanyById } from "@/features/companies/server/companies.queries";
import { EmpresaForm } from "@/features/companies/ui/empresa-form";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function EmpresasEditarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  assertTenantRouteAllowed(session, `/empresas/${id}/editar`);

  const scope = await resolveCompanyScope(session);
  const company = await getCompanyById(session.tid, id, scope);
  if (!company) {
    redirect("/empresas");
  }

  return (
    <ShellPage
      title={t("pages.editCompany")}
      description={company.legalName}
      actions={
        <Link href={`/empresas/${id}`} className="erp-btn-outline text-xs">
          ← Volver a la ficha
        </Link>
      }
    >
      <EmpresaForm
        mode="edit"
        initial={{
          id: company.id,
          legalName: company.legalName,
          taxId: company.taxId,
          logoUrl: company.logoUrl,
          isActive: company.isActive,
          profile: company.profile,
        }}
      />
    </ShellPage>
  );
}
