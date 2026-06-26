import Link from "next/link";
import { notFound } from "next/navigation";
import { getSession } from "@/features/auth/server/session.service";
import { getCompanyByIdForSuperAdmin } from "@/features/super-admin/server/companies.queries";
import { SuperAdminDeleteCompanyButton } from "@/features/super-admin/ui/super-admin-delete-company-button";
import { SuperAdminCompanyDocumentsMaintenance } from "@/features/super-admin/ui/super-admin-company-documents-maintenance";
import { EmpresaForm } from "@/features/companies/ui/empresa-form";
import {
  SuperAdminCard,
  SuperAdminCenteredForm,
  SuperAdminPageChrome,
} from "@/features/super-admin/ui/super-admin-page-chrome";
import { getSessionTranslator } from "@/shared/i18n/tenant-translator.server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function SuperAdminEditarEmpresaPage({ params }: PageProps) {
  const session = await getSession();
  if (!session) throw new Error("Unreachable: layout guards session");
  const { t } = await getSessionTranslator(session);

  const { id } = await params;
  const company = await getCompanyByIdForSuperAdmin(id);
  if (!company) {
    notFound();
  }

  return (
    <SuperAdminPageChrome
      title={t("superAdmin.pages.companies.editTitle")}
      subtitle={t("superAdmin.pages.companies.editSubtitle", {
        legalName: company.legalName,
        tenantName: company.tenantName,
        tenantSlug: company.tenantSlug,
      })}
      backHref="/super-admin/empresas"
      actions={
        <Link
          href={`/super-admin/tenants/${company.tenantId}`}
          className="sa-btn-outline text-xs"
        >
          {t("superAdmin.common.viewOperator")}
        </Link>
      }
    >
      <SuperAdminCenteredForm maxWidthClass="max-w-4xl">
        <SuperAdminCard className="space-y-6 p-5 md:p-6">
          <p className="text-xs text-zinc-600">{t("superAdmin.pages.companies.editIntro")}</p>

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
            patchApiUrl={`/api/super-admin/companies/${company.id}`}
            cancelHref="/super-admin/empresas"
          />

          <div className="border-t border-zinc-200 pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t("superAdmin.pages.companies.documentsSection")}
            </h4>
            <p className="mt-1 text-xs text-zinc-600">{t("superAdmin.pages.companies.documentsIntro")}</p>
            <div className="mt-3">
              <SuperAdminCompanyDocumentsMaintenance
                companyId={company.id}
                initialDocuments={company.documentsMaintenance}
              />
            </div>
          </div>

          <div className="border-t border-zinc-200 pt-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {t("superAdmin.pages.companies.removeSection")}
            </h4>
            <p className="mt-1 text-xs text-zinc-600">
              {t("superAdmin.pages.companies.driversAssociated")}{" "}
              <strong>{company.driverCount}</strong>.{" "}
              {company.driverCount > 0
                ? t("superAdmin.pages.companies.driversBlockDeactivate")
                : t("superAdmin.pages.companies.driversBlockDelete")}
            </p>
            <div className="mt-3">
              <SuperAdminDeleteCompanyButton
                companyId={company.id}
                legalName={company.legalName}
                driverCount={company.driverCount}
              />
            </div>
          </div>
        </SuperAdminCard>
      </SuperAdminCenteredForm>
    </SuperAdminPageChrome>
  );
}
