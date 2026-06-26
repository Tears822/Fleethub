import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { TenantRole, withTenant, writeAuditLog } from "@fleethub/db";
import {
  buildPaymentUpdateFromMode,
  type PaymentEditMode,
  tripPaymentDisplayBalanced,
} from "./trip-payment-amounts";
import { driverWhere, resolveCompanyScopeForSession, type CompanyScope } from "./tenant-scope";
import type { AppSession } from "./types";

function canManageShifts(role: string): boolean {
  return role === TenantRole.ADMIN_TENANT || role === TenantRole.GESTOR;
}

type TripPaymentUpdateInput = {
  tripId: string;
  mode: PaymentEditMode;
  cashCents?: number;
  cardCents?: number;
  appCents?: number;
  /** If true, marks paymentValidated after applying amounts. */
  confirm?: boolean;
};

type UpdateTripPaymentsBody = {
  trips?: TripPaymentUpdateInput[];
};

export async function updateTenantTripPayments(
  session: AppSession,
  body: unknown,
  options?: { companyScope?: CompanyScope },
): Promise<
  Result<
    { updatedCount: number; confirmedCount: number; tripIds: string[] },
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

  const raw = (body as UpdateTripPaymentsBody).trips;
  const updates = Array.isArray(raw)
    ? raw.filter(
        (u): u is TripPaymentUpdateInput =>
          typeof u?.tripId === "string" &&
          u.tripId.trim().length > 0 &&
          (u.mode === "app" ||
            u.mode === "cash" ||
            u.mode === "card" ||
            u.mode === "mixed"),
      )
    : [];

  if (updates.length === 0) {
    return err({ message: "Indica al menos un viaje y tipo de pago." });
  }

  const scope =
    options?.companyScope ??
    (await resolveCompanyScopeForSession({
      ...session,
      kind: "tenant",
      tid: tenantId,
    }));

  return withTenant(tenantId, async (tx) => {
    const ids = updates.map((u) => u.tripId.trim());
    const trips = await tx.trip.findMany({
      where: {
        id: { in: ids },
        tenantId,
        liquidationStatus: "pending",
        driver: driverWhere(scope),
      },
      select: {
        id: true,
        driverId: true,
        grossAmountCents: true,
        netAmountCents: true,
        paymentValidated: true,
      },
    });

    const byId = new Map(trips.map((t) => [t.id, t]));
    let updatedCount = 0;
    let confirmedCount = 0;
    const updatedIds: string[] = [];

    for (const input of updates) {
      const trip = byId.get(input.tripId.trim());
      if (!trip) continue;

      const net = trip.netAmountCents ?? BigInt(0);
      const gross = trip.grossAmountCents ?? net;
      let paymentFields: ReturnType<typeof buildPaymentUpdateFromMode>;
      try {
        paymentFields = buildPaymentUpdateFromMode(
          input.mode,
          { netAmountCents: net, grossAmountCents: gross },
          {
            cashCents: input.cashCents,
            cardCents: input.cardCents,
            appCents: input.appCents,
          },
        );
      } catch (e) {
        return err({
          message: e instanceof Error ? e.message : "Importes de pago no válidos.",
        });
      }

      const mergedTrip = {
        grossAmountCents: gross,
        netAmountCents: net,
        paymentMethod: paymentFields.paymentMethod,
        cashPaymentCents: paymentFields.cashPaymentCents,
        cardPaymentCents: paymentFields.cardPaymentCents,
        appPaymentCents: paymentFields.appPaymentCents,
      };
      const confirmPayment = input.confirm === true;
      const unconfirmPayment = input.confirm === false;
      if (confirmPayment && !tripPaymentDisplayBalanced(mergedTrip)) {
        return err({
          message:
            "El desglose de pago no cuadra con el importe del viaje (app + efectivo + tarjeta debe igualar el importe).",
        });
      }

      await tx.trip.update({
        where: { id: trip.id },
        data: {
          ...paymentFields,
          ...(confirmPayment
            ? { paymentValidated: true }
            : unconfirmPayment
              ? { paymentValidated: false }
              : {}),
        },
      });
      updatedCount += 1;
      if (confirmPayment) confirmedCount += 1;
      updatedIds.push(trip.id);
    }

    if (updatedCount === 0) {
      return err({
        message: "No hay viajes pendientes de cierre en esta selección.",
      });
    }

    const driverIds = [...new Set(trips.map((t) => t.driverId))];
    await writeAuditLog({
      tenantId,
      actorUserId: session.sub,
      action: "trip.update_payment",
      entityType: "driver",
      entityId: driverIds.length === 1 ? driverIds[0]! : null,
      payload: { tripIds: updatedIds, updatedCount, confirmedCount },
    });

    return ok({ updatedCount, confirmedCount, tripIds: updatedIds });
  });
}
