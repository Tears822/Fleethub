import { buildApiUrl } from "@/shared/lib/api-url";

export type PaymentEditMode = "app" | "cash" | "card" | "mixed";

export type TripPaymentUpdatePayload = {
  tripId: string;
  mode: PaymentEditMode;
  cashCents?: number;
  cardCents?: number;
  appCents?: number;
  confirm?: boolean;
};

export async function updateShiftTripPayments(
  trips: TripPaymentUpdatePayload[],
): Promise<{ updatedCount: number; confirmedCount: number; tripIds: string[] }> {
  const res = await fetch(buildApiUrl("/api/tenant/shifts/trip-payments"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ trips }),
  });
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    updatedCount?: number;
    confirmedCount?: number;
    tripIds?: string[];
  };
  if (!res.ok) {
    throw new Error(data.error ?? "No se pudo actualizar el pago.");
  }
  return {
    updatedCount: data.updatedCount ?? 0,
    confirmedCount: data.confirmedCount ?? 0,
    tripIds: data.tripIds ?? [],
  };
}
