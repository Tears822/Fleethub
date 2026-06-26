"use client";

import type { ClosedShiftRow } from "@/features/shifts/ui/cerrar-turnos-types";
import { RevertClosedShiftButton } from "@/features/shifts/ui/revert-closed-shift-button";

type Props = {
  tenantId: string;
  row: ClosedShiftRow;
};

export function SuperAdminRevertCloseButton({ tenantId, row }: Props) {
  return (
    <RevertClosedShiftButton
      row={row}
      endpoint={`/api/super-admin/tenants/${tenantId}/shifts/revert-close`}
      variant="superAdmin"
    />
  );
}

export function AdminReopenClosedShiftButton({ row }: { row: ClosedShiftRow }) {
  return (
    <RevertClosedShiftButton
      row={row}
      endpoint="/api/tenant/shifts/revert-close"
      variant="admin"
    />
  );
}
