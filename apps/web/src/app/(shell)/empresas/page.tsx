import { resolveCompanyScope } from "@/features/auth/server/company-scope";
import { canExportTenantData, canManageCompanies } from "@/domain/rbac.policy";
import { requireTenantSession } from "@/features/auth/server/session.service";
import Link from "next/link";
import { ExportCsvButton } from "@/shared/ui/export-csv-button";
import { ExportFileButton } from "@/shared/ui/export-file-button";
import { EmpresasPrototypeLayout } from "@/features/companies/ui/empresas-prototype-layout";
import { listCompaniesForTenant } from "@/features/companies/server/companies.queries";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function EmpresasPage() {
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  const scope = await resolveCompanyScope(session);
  const companies = await listCompaniesForTenant(session.tid, scope);

  return (
    <ShellPage
      title={t("nav.empresas")}
      description={t("empresas.pageDescription")}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canManageCompanies(session.role) ? (
            <Link href="/empresas/nuevo" className="erp-btn-primary text-xs">
              {t("empresas.newCompany")}
            </Link>
          ) : null}
          {canExportTenantData(session.role) ? (
            <>
              <ExportFileButton
                href="/api/tenant/export/empresas.xlsx"
                label={t("common.exportExcel")}
                filename="empresas.xlsx"
              />
              <ExportCsvButton href="/api/tenant/export/empresas.csv" filename="empresas.csv" />
            </>
          ) : null}
        </div>
      }
    >
      <EmpresasPrototypeLayout
        companies={companies}
        canManage={canManageCompanies(session.role)}
      />
    </ShellPage>
  );
}
