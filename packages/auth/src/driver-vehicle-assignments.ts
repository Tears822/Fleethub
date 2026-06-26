import type { Prisma } from "@prisma/client";

export type VehicleSnapshot = {
  plate: string | null;
  model: string | null;
};

function normalizeVehicle(plate: string | null | undefined, model: string | null | undefined): VehicleSnapshot {
  return {
    plate: plate?.trim() || null,
    model: model?.trim() || null,
  };
}

function vehiclesEqual(a: VehicleSnapshot, b: VehicleSnapshot): boolean {
  return a.plate === b.plate && a.model === b.model;
}

/** Records assignment history when the driver's current vehicle changes. */
export async function syncDriverVehicleAssignment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  driverId: string,
  before: VehicleSnapshot,
  after: VehicleSnapshot,
  assignedAt: Date = new Date(),
): Promise<void> {
  const prev = normalizeVehicle(before.plate, before.model);
  const next = normalizeVehicle(after.plate, after.model);
  if (vehiclesEqual(prev, next)) return;

  const open = await tx.driverVehicleAssignment.findFirst({
    where: { tenantId, driverId, unassignedAt: null },
    orderBy: { assignedAt: "desc" },
  });

  if (open) {
    await tx.driverVehicleAssignment.update({
      where: { id: open.id },
      data: { unassignedAt: assignedAt },
    });
  }

  if (next.plate) {
    await tx.driverVehicleAssignment.create({
      data: {
        tenantId,
        driverId,
        vehiclePlate: next.plate,
        vehicleModel: next.model,
        assignedAt,
      },
    });
  }
}

/** Ensures an open assignment exists when a driver is created with a vehicle. */
export async function ensureInitialVehicleAssignment(
  tx: Prisma.TransactionClient,
  tenantId: string,
  driverId: string,
  plate: string | null | undefined,
  model: string | null | undefined,
  assignedAt: Date,
): Promise<void> {
  const v = normalizeVehicle(plate, model);
  if (!v.plate) return;

  const existing = await tx.driverVehicleAssignment.findFirst({
    where: { tenantId, driverId, unassignedAt: null },
  });
  if (existing) return;

  await tx.driverVehicleAssignment.create({
    data: {
      tenantId,
      driverId,
      vehiclePlate: v.plate,
      vehicleModel: v.model,
      assignedAt,
    },
  });
}
