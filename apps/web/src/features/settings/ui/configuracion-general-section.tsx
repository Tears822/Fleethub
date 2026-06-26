"use client";

import { Building2 } from "lucide-react";
import { useTranslations } from "@/shared/i18n/i18n-provider";
import { VuiPanel } from "@/shared/ui/vui-panel";

export type ConfiguracionGeneralProps = {
  name: string;
  slug: string;
  /** Se conserva al guardar; no editable en esta pantalla */
  timezone: string;
};

export function ConfiguracionGeneralSection({
  name,
  slug,
}: ConfiguracionGeneralProps) {
  const { t } = useTranslations();

  return (
    <VuiPanel className="p-5 md:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
          <Building2 className="h-4 w-4" strokeWidth={2} aria-hidden />
        </span>
        <h2 className="text-sm font-semibold text-zinc-900">{t("config.general.title")}</h2>
      </div>
      <div className="space-y-4">
        <label className="block text-xs font-medium text-zinc-600">
          {t("config.general.tenantName")}
          <input
            type="text"
            value={name}
            readOnly
            className="mt-1.5 w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 outline-none"
          />
        </label>
        <p className="text-xs text-zinc-500">
          {t("config.general.tenantNameReadonlyHint", { slug })}
        </p>
        <p className="text-xs text-zinc-500">{t("config.general.companyHint")}</p>
        <p className="text-xs text-zinc-500">{t("config.general.languageUserHint")}</p>
      </div>
    </VuiPanel>
  );
}
