import Link from "next/link";
import { redirect } from "next/navigation";
import { assertTenantRouteAllowed } from "@/features/auth/server/route-guard";
import { resolveCompanyScope } from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { listCompaniesForTenant } from "@/features/companies/server/companies.queries";
import { ConductorNuevoForm } from "@/features/drivers/ui/conductor-nuevo-form";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function ConductoresNuevoPage() {
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  assertTenantRouteAllowed(session, "/conductores/nuevo");

  const scope = await resolveCompanyScope(session);
  const companies = await listCompaniesForTenant(session.tid, scope);

  if (companies.length === 0) {
    redirect("/conductores");
  }

  return (
    <ShellPage
      title={t("pages.newDriver")}
      description="Rellene los datos del nuevo conductor"
      actions={
        <Link href="/conductores" className="erp-btn-outline text-xs">
          ← Volver al listado
        </Link>
      }
    >
      <ConductorNuevoForm
        companies={companies.map((c) => ({ id: c.id, legalName: c.legalName }))}
      />
    </ShellPage>
  );
}
