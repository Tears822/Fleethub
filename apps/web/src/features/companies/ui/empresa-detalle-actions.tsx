"use client";

import Link from "next/link";

export function EmpresaDetalleActions({
  companyId,
  canEdit,
}: {
  companyId: string;
  canEdit: boolean;
}) {
  return (
    <>
      <Link href="/empresas" className="erp-btn-outline text-xs">
        ← Volver al listado
      </Link>
      {canEdit ? (
        <Link href={`/empresas/${companyId}/editar`} className="erp-btn-primary text-xs">
          Editar empresa
        </Link>
      ) : null}
    </>
  );
}
