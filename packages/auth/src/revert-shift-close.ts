import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { withTenant, writeAuditLog } from "@fleethub/db";
import type { Prisma } from "@prisma/client";
import { canReopenClosedShift } from "./rbac";
import { driverWhere, resolveCompanyScopeForSession, type CompanyScope } from "./tenant-scope";
import type { AppSession } from "./types";

type RevertCloseInput = {
  tripIds: string[];
  driverId: string;
  reason: string;
};

async function executeRevertShiftClose(
  tx: Prisma.TransactionClient,
  tenantId: string,
  input: RevertCloseInput,
  scope: CompanyScope | undefined,
  audit: {
    actorUserId: string;
    action: string;
    extraPayload?: Record<string, unknown>;
  },
): Promise<
  Result<{ revertedCount: number; tripIds: string[]; driverId: string }, { message: string }>
> {
  const { tripIds, driverId, reason } = input;
  const driverFilter = scope ? driverWhere(scope) : {};

  const where =
    tripIds.length > 0
      ? { id: { in: tripIds }, tenantId, liquidationStatus: "closed" as const, driver: driverFilter }
      : { tenantId, driverId, liquidationStatus: "closed" as const, driver: driverFilter };

  const closed = await tx.trip.findMany({
    where,
    select: { id: true, driverId: true },
  });

  if (closed.length === 0) {
    return err({ message: "No hay viajes cerrados que coincidan con el criterio." });
  }

  if (tripIds.length > 0 && closed.length !== tripIds.length) {
    return err({
      message: "Algunos viajes no están cerrados o no pertenecen a este tenant.",
    });
  }

  const ids = closed.map((t) => t.id);
  const result = await tx.trip.updateMany({
    where: { id: { in: ids } },
    data: { liquidationStatus: "pending" },
  });

  await tx.shiftLiquidation.updateMany({
    where: {
      tenantId,
      status: "active",
      tripIds: { hasSome: ids },
    },
    data: {
      status: "reverted",
      revertedAt: new Date(),
    },
  });

  await writeAuditLog({
    tenantId,
    actorUserId: audit.actorUserId,
    action: audit.action,
    entityType: "driver",
    entityId: closed[0]!.driverId,
    payload: {
      tripIds: ids,
      count: result.count,
      reason,
      ...audit.extraPayload,
    },
  });

  return ok({
    revertedCount: result.count,
    tripIds: ids,
    driverId: closed[0]!.driverId,
  });
}

function parseRevertCloseBody(body: unknown): Result<RevertCloseInput, { message: string }> {
  const b = body as {
    tripIds?: string[];
    driverId?: string;
    reason?: string;
  };
  const tripIds = Array.isArray(b.tripIds)
    ? b.tripIds.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];
  const driverId = b.driverId?.trim() ?? "";
  const reason = typeof b.reason === "string" ? b.reason.trim().slice(0, 2000) : "";

  if (tripIds.length === 0 && !driverId) {
    return err({ message: "Indica los viajes o el conductor del cierre a revertir." });
  }
  if (reason.length < 3) {
    return err({ message: "Indica el motivo (mín. 3 caracteres)." });
  }

  return ok({ tripIds, driverId, reason });
}

export async function revertShiftClose(
  platformSession: { kind: string; sub: string; email?: string },
  tenantId: string,
  body: unknown,
): Promise<
  Result<{ revertedCount: number; tripIds: string[]; driverId: string }, { message: string }>
> {
  if (platformSession.kind !== "platform") {
    return err({ message: "Solo Super Admin puede revertir cierres." });
  }

  const parsed = parseRevertCloseBody(body);
  if (!parsed.ok) return parsed;

  return withTenant(tenantId, async (tx) =>
    executeRevertShiftClose(tx, tenantId, parsed.value, undefined, {
      actorUserId: platformSession.sub,
      action: "shift.revert_close",
      extraPayload: { platformActorEmail: platformSession.email },
    }),
  );
}

export async function revertTenantShiftClose(
  session: AppSession,
  body: unknown,
): Promise<
  Result<{ revertedCount: number; tripIds: string[]; driverId: string }, { message: string }>
> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }

  if (!canReopenClosedShift(session.role)) {
    return err({ message: "Solo el administrador del tenant puede reabrir turnos cerrados." });
  }

  const parsed = parseRevertCloseBody(body);
  if (!parsed.ok) return parsed;

  const tenantId = session.tid;
  const scope = await resolveCompanyScopeForSession({
    ...session,
    kind: "tenant",
    tid: tenantId,
  });

  return withTenant(tenantId, async (tx) =>
    executeRevertShiftClose(tx, tenantId, parsed.value, scope, {
      actorUserId: session.sub,
      action: "shift.reopen_closed",
    }),
  );
}
