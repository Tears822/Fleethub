import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { RidePlatform, TenantRole, withTenant, writeAuditLog } from "@fleethub/db";
import {
  ensureInitialVehicleAssignment,
  syncDriverVehicleAssignment,
} from "./driver-vehicle-assignments";
import { resolveCompanyScopeForSession } from "./tenant-scope";
import type { AppSession } from "./types";

function canManageDrivers(role: string): boolean {
  return role === TenantRole.ADMIN_TENANT || role === TenantRole.GESTOR;
}

type DriverProfileBody = {
  fullName?: string;
  companyId?: string;
  isActive?: boolean;
  platforms?: string[];
  dni?: string | null;
  phone?: string | null;
  email?: string | null;
  birthDate?: string | null;
  licenseNumber?: string | null;
  vehiclePlate?: string | null;
  vehicleModel?: string | null;
  driverSharePct?: number | null;
  driverBonusSharePct?: number | null;
  driverPlatformFeeSharePct?: number | null;
  dailyFixed?: number | null;
  /** Raw Uber driver UUID (Vehicle Suppliers API). */
  uberExternalDriverId?: string | null;
  /** FreeNow public driver id (Meta-Account API, e.g. GYZDOMBRHEZDQ). */
  freenowExternalDriverId?: string | null;
};

function parseSharePct(value: number | null | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || Number.isNaN(value)) return null;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function parseBirthDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (!value || !value.trim()) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDailyFixedCents(value: number | null | undefined): bigint | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || Number.isNaN(value)) return null;
  return BigInt(Math.round(value * 100));
}

function profileFields(b: DriverProfileBody) {
  return {
    ...(b.dni !== undefined ? { dni: b.dni?.trim() || null } : {}),
    ...(b.phone !== undefined ? { phone: b.phone?.trim() || null } : {}),
    ...(b.email !== undefined ? { email: b.email?.trim().toLowerCase() || null } : {}),
    ...(b.birthDate !== undefined ? { birthDate: parseBirthDate(b.birthDate) } : {}),
    ...(b.licenseNumber !== undefined ? { licenseNumber: b.licenseNumber?.trim() || null } : {}),
    ...(b.vehiclePlate !== undefined ? { vehiclePlate: b.vehiclePlate?.trim() || null } : {}),
    ...(b.vehicleModel !== undefined ? { vehicleModel: b.vehicleModel?.trim() || null } : {}),
    ...(b.driverSharePct !== undefined
      ? { driverSharePct: parseSharePct(b.driverSharePct) ?? null }
      : {}),
    ...(b.driverBonusSharePct !== undefined
      ? { driverBonusSharePct: parseSharePct(b.driverBonusSharePct) ?? null }
      : {}),
    ...(b.driverPlatformFeeSharePct !== undefined
      ? { driverPlatformFeeSharePct: parseSharePct(b.driverPlatformFeeSharePct) ?? null }
      : {}),
    ...(b.dailyFixed !== undefined ? { dailyFixedCents: parseDailyFixedCents(b.dailyFixed) } : {}),
  };
}

export async function createTenantDriver(
  session: AppSession,
  body: unknown,
): Promise<Result<{ driverId: string }, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }
  const tenantId = session.tid;
  if (!canManageDrivers(session.role)) {
    return err({ message: "No autorizado." });
  }

  const b = body as DriverProfileBody;
  const fullName = b.fullName?.trim() ?? "";
  const companyId = b.companyId?.trim() ?? "";
  const isActive = b.isActive !== false;

  if (!fullName) return err({ message: "El nombre completo es obligatorio." });
  if (!companyId) return err({ message: "Seleccione una empresa." });

  const scope = await resolveCompanyScopeForSession({
    ...session,
    kind: "tenant",
    tid: tenantId,
  });
  if (scope.mode === "restricted" && !scope.companyIds.includes(companyId)) {
    return err({ message: "Empresa no válida o sin acceso." });
  }

  const platformsRaw = Array.isArray(b.platforms) ? b.platforms : [];
  const platforms = platformsRaw
    .map((p) => String(p).toUpperCase())
    .filter((p): p is RidePlatform => p === RidePlatform.UBER || p === RidePlatform.FREENOW);

  return withTenant(tenantId, async (tx) => {
    const company = await tx.company.findFirst({
      where: { id: companyId, tenantId, isActive: true },
    });
    if (!company) return err({ message: "Empresa no encontrada." });

    const driver = await tx.driver.create({
      data: {
        tenantId,
        companyId,
        fullName,
        isActive,
        ...profileFields(b),
      },
    });

    for (const platform of platforms) {
      await tx.driverPlatformAccount.create({
        data: {
          tenantId,
          driverId: driver.id,
          platform,
          externalDriverId: `manual-${driver.id.slice(0, 8)}-${platform.toLowerCase()}`,
          metadata: { source: "manual_create" },
        },
      });
    }

    await ensureInitialVehicleAssignment(
      tx,
      tenantId,
      driver.id,
      driver.vehiclePlate,
      driver.vehicleModel,
      driver.createdAt,
    );

    await writeAuditLog({
      tenantId,
      actorUserId: session.sub,
      action: "driver.create",
      entityType: "driver",
      entityId: driver.id,
      payload: { fullName, companyId, platforms },
    });

    return ok({ driverId: driver.id });
  });
}

export async function updateTenantDriver(
  session: AppSession,
  driverId: string,
  body: unknown,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }
  const tenantId = session.tid;
  if (!canManageDrivers(session.role)) {
    return err({ message: "No autorizado." });
  }

  const id = driverId.trim();
  if (!id) return err({ message: "Conductor no válido." });

  const b = body as DriverProfileBody;
  const scope = await resolveCompanyScopeForSession({
    ...session,
    kind: "tenant",
    tid: tenantId,
  });

  return withTenant(tenantId, async (tx) => {
    const existing = await tx.driver.findFirst({
      where: {
        id,
        tenantId,
        ...(scope.mode === "restricted" ? { companyId: { in: scope.companyIds } } : {}),
      },
    });
    if (!existing) return err({ message: "Conductor no encontrado." });

    let companyId = existing.companyId;
    if (b.companyId !== undefined) {
      const nextCompany = b.companyId.trim();
      if (!nextCompany) return err({ message: "Seleccione una empresa." });
      if (scope.mode === "restricted" && !scope.companyIds.includes(nextCompany)) {
        return err({ message: "Empresa no válida o sin acceso." });
      }
      const company = await tx.company.findFirst({
        where: { id: nextCompany, tenantId, isActive: true },
      });
      if (!company) return err({ message: "Empresa no encontrada." });
      companyId = nextCompany;
    }

    const fullName = b.fullName?.trim();
    if (b.fullName !== undefined && !fullName) {
      return err({ message: "El nombre completo es obligatorio." });
    }

    const updated = await tx.driver.update({
      where: { id },
      data: {
        ...(fullName ? { fullName } : {}),
        ...(b.companyId !== undefined ? { companyId } : {}),
        ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
        ...profileFields(b),
      },
    });

    if (b.vehiclePlate !== undefined || b.vehicleModel !== undefined) {
      await syncDriverVehicleAssignment(
        tx,
        tenantId,
        id,
        { plate: existing.vehiclePlate, model: existing.vehicleModel },
        { plate: updated.vehiclePlate, model: updated.vehicleModel },
      );
    }

    if (Array.isArray(b.platforms)) {
      const platforms = b.platforms
        .map((p) => String(p).toUpperCase())
        .filter((p): p is RidePlatform => p === RidePlatform.UBER || p === RidePlatform.FREENOW);

      const current = await tx.driverPlatformAccount.findMany({
        where: { tenantId, driverId: id },
        select: { platform: true },
      });
      const currentSet = new Set(current.map((c) => c.platform));

      for (const platform of platforms) {
        if (!currentSet.has(platform)) {
          await tx.driverPlatformAccount.create({
            data: {
              tenantId,
              driverId: id,
              platform,
              externalDriverId: `manual-${id.slice(0, 8)}-${platform.toLowerCase()}`,
              metadata: { source: "manual_update" },
            },
          });
        }
      }
    }

    if (b.uberExternalDriverId !== undefined) {
      const ext = b.uberExternalDriverId?.trim() ?? "";
      const uberAccount = await tx.driverPlatformAccount.findFirst({
        where: { tenantId, driverId: id, platform: RidePlatform.UBER },
      });
      if (ext) {
        if (uberAccount) {
          await tx.driverPlatformAccount.update({
            where: { id: uberAccount.id },
            data: {
              externalDriverId: ext,
              isActive: true,
              metadata: {
                ...(typeof uberAccount.metadata === "object" && uberAccount.metadata
                  ? (uberAccount.metadata as Record<string, unknown>)
                  : {}),
                source: "manual_uuid",
                linkedAt: new Date().toISOString(),
              },
            },
          });
        } else {
          await tx.driverPlatformAccount.create({
            data: {
              tenantId,
              driverId: id,
              platform: RidePlatform.UBER,
              externalDriverId: ext,
              metadata: { source: "manual_uuid" },
            },
          });
        }
      }
    }

    if (b.freenowExternalDriverId !== undefined) {
      const ext = b.freenowExternalDriverId?.trim() ?? "";
      const fnAccount = await tx.driverPlatformAccount.findFirst({
        where: { tenantId, driverId: id, platform: RidePlatform.FREENOW },
      });
      if (ext) {
        if (fnAccount) {
          await tx.driverPlatformAccount.update({
            where: { id: fnAccount.id },
            data: {
              externalDriverId: ext,
              isActive: true,
              metadata: {
                ...(typeof fnAccount.metadata === "object" && fnAccount.metadata
                  ? (fnAccount.metadata as Record<string, unknown>)
                  : {}),
                source: "freenow_manual_id",
                linkedAt: new Date().toISOString(),
              },
            },
          });
        } else {
          await tx.driverPlatformAccount.create({
            data: {
              tenantId,
              driverId: id,
              platform: RidePlatform.FREENOW,
              externalDriverId: ext,
              metadata: { source: "freenow_manual_id" },
            },
          });
        }
      }
    }

    await writeAuditLog({
      tenantId,
      actorUserId: session.sub,
      action: "driver.update",
      entityType: "driver",
      entityId: id,
      payload: { companyId, isActive: b.isActive },
    });

    return ok({ ok: true });
  });
}
