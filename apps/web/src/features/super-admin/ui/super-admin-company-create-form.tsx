"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmpresaForm } from "@/features/companies/ui/empresa-form";
import type { SuperAdminTenantOption } from "@/features/super-admin/server/companies.queries";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { useToast } from "@/shared/ui/toast-provider";

type Props = {
  tenants: SuperAdminTenantOption[];
};

export function SuperAdminCompanyCreateForm({ tenants }: Props) {
  const { t } = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [formKey, setFormKey] = useState(0);

  const selected = tenants.find((tenant) => tenant.id === tenantId);

  if (tenants.length === 0) {
    return <p className="text-sm text-zinc-600">{t("superAdmin.companies.noTenantsFirst")}</p>;
  }

  return (
    <div className="space-y-4">
      <label className="sa-label block max-w-md">
        {t("superAdmin.companies.operatorSelectLabel")}
        <select
          className="sa-input mt-1 w-full"
          value={tenantId}
          onChange={(e) => {
            setTenantId(e.target.value);
            setFormKey((k) => k + 1);
          }}
        >
          {tenants.map((tenant) => (
            <option key={tenant.id} value={tenant.id}>
              {tenant.name} ({tenant.slug})
            </option>
          ))}
        </select>
      </label>

      <p className="text-xs text-amber-800 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
        {t("superAdmin.companies.duplicateWarning")}
      </p>

      {selected ? (
        <EmpresaForm
          key={`${tenantId}-${formKey}`}
          mode="create"
          createApiUrl={`/api/super-admin/tenants/${tenantId}/companies`}
          submitLabel={t("superAdmin.companies.createSubmit")}
          onCreateSuccess={() => {
            toast.success(t("superAdmin.companies.createSuccess", { name: selected.name }));
            setFormKey((k) => k + 1);
            router.push("/super-admin/empresas");
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
