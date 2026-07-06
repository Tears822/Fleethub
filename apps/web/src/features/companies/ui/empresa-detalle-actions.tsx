"use client";

import Link from "next/link";
import { useTranslations } from "@/shared/i18n/i18n-provider";

export function EmpresaDetalleActions({
  companyId,
  canEdit,
}: {
  companyId: string;
  canEdit: boolean;
}) {
  const { t } = useTranslations();

  return (
    <>
      <Link href="/empresas" className="erp-btn-outline text-xs">
        {t("common.backToList")}
      </Link>
      {canEdit ? (
        <Link href={`/empresas/${companyId}/editar`} className="erp-btn-primary text-xs">
          {t("empresasPage.editCompany")}
        </Link>
      ) : null}
    </>
  );
}
