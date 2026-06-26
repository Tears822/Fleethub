import { buildApiUrl } from "@/shared/lib/api-url";

export async function validateShiftTripPayments(tripIds: string[]): Promise<{
  validatedCount: number;
  tripIds: string[];
}> {
  const res = await fetch(buildApiUrl("/api/tenant/shifts/validate-payments"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tripIds }),
  });
  const data = (await res.json()) as {
    error?: string;
    validatedCount?: number;
    tripIds?: string[];
  };
  if (!res.ok) {
    throw new Error(data.error ?? "No se pudo confirmar el tipo de pago.");
  }
  return {
    validatedCount: data.validatedCount ?? 0,
    tripIds: data.tripIds ?? [],
  };
}
