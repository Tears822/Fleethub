import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { RidePlatform, TenantRole, withTenant, writeAuditLog } from "@fleethub/db";
import { driverEconomicsFromTrip, fetchPendingShiftTrips } from "./fetch-pending-shift-trips";
import { parseShiftCloseTimeRange } from "./shift-close-filters";
import { computeLiquidationSummary } from "./shift-liquidation";
import { tripPaymentDisplayBalanced } from "./trip-payment-amounts";
import { resolveCompanyScopeForSession, type CompanyScope } from "./tenant-scope";
import type { AppSession } from "./types";
import type { LiquidationSummary } from "./shift-liquidation";

function canManageShifts(role: string): boolean {
  return role === TenantRole.ADMIN_TENANT || role === TenantRole.GESTOR;
}

type CloseShiftsBody = {
  driverId?: string;
  tripIds?: string[];
  platform?: string;
  note?: string;
  timeFrom?: string;
  timeTo?: string;
};

export async function closeTenantTrips(
  session: AppSession,
  body: unknown,
  options?: { companyScope?: CompanyScope },
): Promise<
  Result<
    {
      closedCount: number;
      liquidation: LiquidationSummary;
      tripIds: string[];
      driverId: string;
      shiftLiquidationId: string;
    },
    { message: string }
  >
> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }
  const tenantId = session.tid;
  if (!canManageShifts(session.role)) {
    return err({ message: "No autorizado." });
  }

  const b = body as CloseShiftsBody;
  const driverId = b.driverId?.trim() ?? "";
  const tripIds = Array.isArray(b.tripIds)
    ? b.tripIds.filter((id): id is string => typeof id === "string")
    : [];
  const platformRaw = b.platform?.trim().toUpperCase();
  const platform =
    platformRaw === RidePlatform.UBER || platformRaw === RidePlatform.FREENOW
      ? platformRaw
      : undefined;
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 2000) : "";

  if (!driverId && tripIds.length === 0) {
    return err({ message: "Indica el conductor o los viajes a cerrar." });
  }

  const rangeResult = parseShiftCloseTimeRange(b);
  if (!rangeResult.ok) return rangeResult;
  const timeRange = rangeResult.value;

  const scope =
    options?.companyScope ??
    (await resolveCompanyScopeForSession({
      ...session,
      kind: "tenant",
      tid: tenantId,
    }));

  return withTenant(tenantId, async (tx) => {
    const pending = await fetchPendingShiftTrips(tx, {
      tenantId,
      scope,
      driverId,
      tripIds,
      platform,
      timeRange,
    });

    if (pending.length === 0) {
      return err({
        message: timeRange
          ? "No hay viajes pendientes de cerrar en la franja horaria indicada."
          : "No hay viajes pendientes de cerrar para este criterio.",
      });
    }

    const unvalidated = pending.filter((t) => !t.paymentValidated);
    if (unvalidated.length > 0) {
      return err({
        message:
          unvalidated.length === 1
            ? "Hay 1 viaje con tipo de pago sin confirmar. Confírmalo en el detalle antes de cerrar el turno."
            : `Hay ${unvalidated.length} viajes con tipo de pago sin confirmar. Confírmalos en el detalle antes de cerrar el turno.`,
      });
    }

    const unbalanced = pending.filter(
      (t) =>
        t.paymentValidated &&
        !tripPaymentDisplayBalanced({
          grossAmountCents: t.grossAmountCents,
          netAmountCents: t.netAmountCents,
          paymentMethod: t.paymentMethod,
          cashPaymentCents: t.cashPaymentCents,
          cardPaymentCents: t.cardPaymentCents,
          appPaymentCents: t.appPaymentCents,
        }),
    );
    if (unbalanced.length > 0) {
      return err({
        message:
          unbalanced.length === 1
            ? "Hay 1 viaje con el desglose de pago descuadrado (app + efectivo + tarjeta debe igualar el importe). Corrígelo en el detalle antes de cerrar."
            : `Hay ${unbalanced.length} viajes con el desglose de pago descuadrado. Corrígelos en el detalle antes de cerrar el turno.`,
      });
    }

    const liquidation = computeLiquidationSummary(pending, driverEconomicsFromTrip(pending[0]!.driver));

    const closedIds = pending.map((t) => t.id);
    const result = await tx.trip.updateMany({
      where: { id: { in: closedIds } },
      data: { liquidationStatus: "closed" },
    });

    let periodFrom = pending[0]!.startedAt;
    let periodTo = pending[0]!.endedAt ?? pending[0]!.startedAt;
    for (const t of pending) {
      const end = t.endedAt ?? t.startedAt;
      if (t.startedAt < periodFrom) periodFrom = t.startedAt;
      if (end > periodTo) periodTo = end;
    }
    if (timeRange) {
      periodFrom = timeRange.timeFrom;
      periodTo = timeRange.timeTo;
    }

    const resolvedDriverId = driverId || pending[0]!.driverId;

    const liquidationRow = await tx.shiftLiquidation.create({
      data: {
        tenantId,
        driverId: resolvedDriverId,
        closedAt: new Date(),
        periodFrom,
        periodTo,
        tripIds: closedIds,
        platform: platform ?? null,
        note: note || null,
        summary: liquidation,
        closedByUserId: session.sub,
        status: "active",
      },
    });

    await writeAuditLog({
      tenantId,
      actorUserId: session.sub,
      action: "shift.close",
      entityType: "driver",
      entityId: resolvedDriverId,
      payload: {
        shiftLiquidationId: liquidationRow.id,
        tripIds: closedIds,
        count: result.count,
        platform,
        timeRange: timeRange
          ? {
              from: timeRange.timeFrom.toISOString(),
              to: timeRange.timeTo.toISOString(),
            }
          : undefined,
        note: note || undefined,
        liquidation,
      },
    });

    return ok({
      closedCount: result.count,
      liquidation,
      tripIds: closedIds,
      driverId: resolvedDriverId,
      shiftLiquidationId: liquidationRow.id,
    });
  });
}
