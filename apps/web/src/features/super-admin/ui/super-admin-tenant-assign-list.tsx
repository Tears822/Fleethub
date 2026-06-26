"use client";

import type { SuperAdminTenantRow } from "@/features/super-admin/server/tenants.queries";
import { useTranslations } from "@/shared/i18n/i18n-provider";

export function SuperAdminTenantAssignList({
  tenants,
  selectedIds,
  onToggle,
}: {
  tenants: SuperAdminTenantRow[];
  selectedIds?: Set<string>;
  onToggle?: (tenantId: string) => void;
}) {
  const { t } = useTranslations();

  if (tenants.length === 0) {
    return <p className="text-sm text-zinc-500">{t("superAdmin.tenants.emptyAvailable")}</p>;
  }

  const interactive = Boolean(onToggle);

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {tenants.map((tenant) => {
        const checked = selectedIds?.has(tenant.id) ?? false;
        return (
          <label
            key={tenant.id}
            className={`flex cursor-pointer items-start gap-2.5 rounded-lg border bg-zinc-50 px-3 py-2.5 text-sm transition ${
              checked ? "border-orange-300 ring-1 ring-orange-200" : "border-zinc-200 hover:border-zinc-300"
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              readOnly={!interactive}
              onChange={interactive ? () => onToggle?.(tenant.id) : undefined}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 accent-orange-500"
            />
            <span className="min-w-0">
              <span className="block font-semibold leading-snug text-zinc-800">{tenant.name}</span>
              <span className="mt-0.5 block text-[11px] font-medium text-zinc-500">{tenant.plan}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
