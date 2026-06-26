import { RidePlatform, withTenant } from "@fleethub/db";

function tripHasAmounts(row: {
  grossAmountCents: bigint | null;
  netAmountCents: bigint | null;
}): boolean {
  const gross = row.grossAmountCents;
  const net = row.netAmountCents;
  return (
    (gross != null && gross > BigInt(0)) || (net != null && net > BigInt(0))
  );
}

export type UberPaymentWindowSummary = {
  total: number;
  withAmounts: number;
  missing: number;
};

export async function summarizeUberTripAmountsInWindow(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<UberPaymentWindowSummary> {
  const rows = await withTenant(tenantId, (tx) =>
    tx.trip.findMany({
      where: {
        tenantId,
        platform: RidePlatform.UBER,
        startedAt: { gte: from, lte: to },
      },
      select: { grossAmountCents: true, netAmountCents: true },
    }),
  );

  let withAmounts = 0;
  for (const row of rows) {
    if (tripHasAmounts(row)) withAmounts += 1;
  }

  const total = rows.length;
  return {
    total,
    withAmounts,
    missing: total - withAmounts,
  };
}
