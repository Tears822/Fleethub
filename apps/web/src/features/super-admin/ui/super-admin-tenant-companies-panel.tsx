"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmpresaForm } from "@/features/companies/ui/empresa-form";
import type { SuperAdminTenantCompanyRow } from "@/features/super-admin/server/tenants.queries";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type Props = {
  tenantId: string;
  tenantName: string;
  initialCompanies: SuperAdminTenantCompanyRow[];
};

export function SuperAdminTenantCompaniesPanel({
  tenantId,
  tenantName,
  initialCompanies,
}: Props) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);

  return (
    <section className="mt-8 border-t border-zinc-200 pt-6">
      <h3 className="text-sm font-semibold text-zinc-900">{t("superAdmin.tenants.companiesPanelTitle")}</h3>
      <p className="mt-1 text-xs text-zinc-600">{t("superAdmin.tenants.companiesPanelHelp")}</p>

      {initialCompanies.length > 0 ? (
        <ul className="mt-3 space-y-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm">
          {initialCompanies.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-2 text-zinc-800"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{c.legalName}</span>
                {c.taxId ? (
                  <span className="font-mono text-xs text-zinc-500">{c.taxId}</span>
                ) : null}
                {!c.isActive ? (
                  <span className="text-xs text-amber-700">{t("superAdmin.common.inactiveTag")}</span>
                ) : null}
              </div>
              <Link
                href={`/super-admin/empresas/${c.id}/editar`}
                className="sa-btn-edit shrink-0"
              >
                {t("common.edit")}
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">{t("superAdmin.tenants.noCompanies")}</p>
      )}

      <div className="mt-6">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {t("superAdmin.tenants.addCompanySection")}
        </h4>
        <EmpresaForm
          key={formKey}
          mode="create"
          createApiUrl={`/api/super-admin/tenants/${tenantId}/companies`}
          submitLabel={t("superAdmin.tenants.addCompanySubmit")}
          onCreateSuccess={() => {
            toast.success(t("superAdmin.tenants.companyAdded", { tenantName }));
            setFormKey((k) => k + 1);
            router.refresh();
          }}
        />
      </div>
    </section>
  );
}
