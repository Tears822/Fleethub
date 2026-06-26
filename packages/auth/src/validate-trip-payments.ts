import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { TenantRole, withTenant, writeAuditLog } from "@fleethub/db";
import { tripPaymentDisplayBalanced } from "./trip-payment-amounts";
import { driverWhere, resolveCompanyScopeForSession, type CompanyScope } from "./tenant-scope";
import type { AppSession } from "./types";

function canManageShifts(role: string): boolean {
  return role === TenantRole.ADMIN_TENANT || role === TenantRole.GESTOR;
}

type ValidatePaymentsBody = {
  tripIds?: string[];
};

export async function validateTenantTripPayments(
  session: AppSession,
  body: unknown,
  options?: { companyScope?: CompanyScope },
): Promise<Result<{ validatedCount: number; tripIds: string[] }, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }
  const tenantId = session.tid;
  if (!canManageShifts(session.role)) {
    return err({ message: "No autorizado." });
  }

  const tripIds = Array.isArray((body as ValidatePaymentsBody).tripIds)
    ? (body as ValidatePaymentsBody).tripIds!.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];

  if (tripIds.length === 0) {
    return err({ message: "Indica los viajes a confirmar." });
  }

  const scope =
    options?.companyScope ??
    (await resolveCompanyScopeForSession({
      ...session,
      kind: "tenant",
      tid: tenantId,
    }));

  return withTenant(tenantId, async (tx) => {
    const trips = await tx.trip.findMany({
      where: {
        id: { in: tripIds },
        tenantId,
        liquidationStatus: "pending",
        paymentValidated: false,
        driver: driverWhere(scope),
      },
      select: {
        id: true,
        driverId: true,
        grossAmountCents: true,
        netAmountCents: true,
        paymentMethod: true,
        cashPaymentCents: true,
        cardPaymentCents: true,
        appPaymentCents: true,
      },
    });

    if (trips.length === 0) {
      return err({
        message: "No hay viajes pendientes de confirmar de pago en esta selección.",
      });
    }

    const balanced = trips.filter((t) =>
      tripPaymentDisplayBalanced({
        grossAmountCents: t.grossAmountCents,
        netAmountCents: t.netAmountCents,
        paymentMethod: t.paymentMethod,
        cashPaymentCents: t.cashPaymentCents,
        cardPaymentCents: t.cardPaymentCents,
        appPaymentCents: t.appPaymentCents,
      }),
    );
    if (balanced.length === 0) {
      return err({
        message:
          "No se puede confirmar: el desglose de pago no cuadra con el importe del viaje (app + efectivo + tarjeta).",
      });
    }

    const ids = balanced.map((t) => t.id);
    const result = await tx.trip.updateMany({
      where: { id: { in: ids } },
      data: { paymentValidated: true },
    });

    const driverIds = [...new Set(balanced.map((t) => t.driverId))];
    await writeAuditLog({
      tenantId,
      actorUserId: session.sub,
      action: "trip.validate_payment",
      entityType: "driver",
      entityId: driverIds.length === 1 ? driverIds[0]! : null,
      payload: { tripIds: ids, count: result.count, driverIds },
    });

    return ok({ validatedCount: result.count, tripIds: ids });
  });
}
