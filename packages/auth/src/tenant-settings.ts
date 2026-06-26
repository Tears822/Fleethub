import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { withTenantRls, writeAuditLog } from "@fleethub/db";
import type { AppSession } from "./types";

export type ProductivityThresholds = {
  eurPerHourMin: number;
  tripsPerHourMin: number;
  acceptanceRateMin: number;
  /** When true, Apps classifies vs fleet day averages instead of fixed mins. */
  useFleetDayAverages?: boolean;
};

const DEFAULT_THRESHOLDS: ProductivityThresholds = {
  eurPerHourMin: 12,
  tripsPerHourMin: 1.5,
  acceptanceRateMin: 85,
};

function parseThresholds(raw: unknown): ProductivityThresholds {
  if (!raw || typeof raw !== "object") return DEFAULT_THRESHOLDS;
  const p = (raw as { productivity?: unknown }).productivity;
  if (!p || typeof p !== "object") return DEFAULT_THRESHOLDS;
  const o = p as Record<string, unknown>;
  return {
    eurPerHourMin: Number(o.eurPerHourMin) || DEFAULT_THRESHOLDS.eurPerHourMin,
    tripsPerHourMin: Number(o.tripsPerHourMin) || DEFAULT_THRESHOLDS.tripsPerHourMin,
    acceptanceRateMin: Number(o.acceptanceRateMin) || DEFAULT_THRESHOLDS.acceptanceRateMin,
    useFleetDayAverages: o.useFleetDayAverages === true,
  };
}

export async function getTenantProductivityThresholds(
  tenantId: string,
): Promise<ProductivityThresholds> {
  const tenant = await withTenantRls(tenantId, (tx) =>
    tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    }),
  );
  return parseThresholds(tenant?.settings);
}

export async function updateTenantProductivityThresholds(
  session: AppSession,
  body: unknown,
): Promise<Result<ProductivityThresholds, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }

  const b = body as Partial<Record<keyof ProductivityThresholds, unknown>> & {
    useFleetDayAverages?: unknown;
  };
  const eurPerHourMin = Number(b.eurPerHourMin);
  const tripsPerHourMin = Number(b.tripsPerHourMin);
  const acceptanceRateMin = Number(b.acceptanceRateMin);
  const useFleetDayAverages = b.useFleetDayAverages === true;

  if (
    !Number.isFinite(eurPerHourMin) ||
    !Number.isFinite(tripsPerHourMin) ||
    !Number.isFinite(acceptanceRateMin) ||
    eurPerHourMin <= 0 ||
    tripsPerHourMin <= 0 ||
    acceptanceRateMin <= 0 ||
    acceptanceRateMin > 100
  ) {
    return err({ message: "Umbrales no válidos." });
  }

  const tenantId = session.tid;
  const productivity: ProductivityThresholds = {
    eurPerHourMin,
    tripsPerHourMin,
    acceptanceRateMin,
    useFleetDayAverages,
  };

  const saved = await withTenantRls(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    if (!tenant) return null;

    const current =
      tenant.settings && typeof tenant.settings === "object"
        ? (tenant.settings as Record<string, unknown>)
        : {};

    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        settings: { ...current, productivity },
      },
    });

    return productivity;
  });
  if (!saved) return err({ message: "Tenant no encontrado." });

  await writeAuditLog({
    tenantId,
    actorUserId: session.sub,
    action: "tenant.settings.productivity",
    entityType: "tenant",
    entityId: tenantId,
    payload: productivity,
  });

  return ok(productivity);
}
