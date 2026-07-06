import Link from "next/link";
import { canManageCompanies } from "@/domain/rbac.policy";
import { resolveCompanyScope } from "@/features/auth/server/company-scope";
import { requireTenantSession } from "@/features/auth/server/session.service";
import { getCompanyById } from "@/features/companies/server/companies.queries";
import { EmpresaDetalleActions } from "@/features/companies/ui/empresa-detalle-actions";
import { EmpresaDetalleView } from "@/features/companies/ui/empresa-detalle-view";
import { ShellPage } from "@/features/shell/ui/shell-page";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

export default async function EmpresaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireTenantSession();
  const { t } = await getSessionTranslator(session);
  const scope = await resolveCompanyScope(session);
  const company = await getCompanyById(session.tid, id, scope);

  if (!company) {
    return (
      <ShellPage
        title={t("nav.empresas")}
        description={t("empresasPage.profileDescription")}
        actions={
          <Link href="/empresas" className="erp-btn-outline text-xs">
            {t("common.backToList")}
          </Link>
        }
      >
        <p className="text-sm text-zinc-600">{t("empresasPage.notFound")}</p>
      </ShellPage>
    );
  }

  return (
    <ShellPage
      title={company.legalName}
      description={t("empresasPage.fullProfileDescription")}
      actions={
        <EmpresaDetalleActions
          companyId={company.id}
          canEdit={canManageCompanies(session.role)}
        />
      }
    >
      <EmpresaDetalleView
        company={{
          id: company.id,
          legalName: company.legalName,
          taxId: company.taxId ?? "—",
          isActive: company.isActive,
          driverCount: company._count.drivers,
          activeDrivers: company.activeDrivers,
          licensedDrivers: company.licensedDrivers,
          platforms: company.platforms,
          profile: company.profile,
          documents: company.documents,
          canManageDocuments: canManageCompanies(session.role),
        }}
      />
    </ShellPage>
  );
}
