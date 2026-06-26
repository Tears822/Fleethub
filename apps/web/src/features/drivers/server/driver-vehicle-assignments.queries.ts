import "server-only";

import type { CompanyScope } from "@/features/auth/server/company-scope";
import { driverWhere } from "@/features/auth/server/company-scope";
import { withTenant } from "@/infrastructure/database";

export type DriverVehicleAssignmentRow = {
  id: string;
  vehiclePlate: string;
  vehicleModel: string | null;
  assignedAt: string;
  unassignedAt: string | null;
  isCurrent: boolean;
  note: string | null;
};

function formatDateTimeEs(d: Date): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export async function listDriverVehicleAssignments(
  tenantId: string,
  driverId: string,
  scope: CompanyScope,
): Promise<DriverVehicleAssignmentRow[]> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.driverVehicleAssignment.findMany({
      where: {
        tenantId,
        driverId,
        driver: driverWhere(scope),
      },
      orderBy: { assignedAt: "desc" },
      select: {
        id: true,
        vehiclePlate: true,
        vehicleModel: true,
        assignedAt: true,
        unassignedAt: true,
        note: true,
      },
    }),
  );

  return rows.map((r) => ({
    id: r.id,
    vehiclePlate: r.vehiclePlate,
    vehicleModel: r.vehicleModel,
    assignedAt: formatDateTimeEs(r.assignedAt),
    unassignedAt: r.unassignedAt ? formatDateTimeEs(r.unassignedAt) : null,
    isCurrent: r.unassignedAt === null,
    note: r.note,
  }));
}
