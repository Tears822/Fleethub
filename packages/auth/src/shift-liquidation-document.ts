import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { withTenant } from "@fleethub/db";
import { resolveDriverEconomics } from "./company-economic-defaults";
import { computeLiquidationSummary, type LiquidationSummary } from "./shift-liquidation";
import { driverWhere, resolveCompanyScopeForSession, type CompanyScope } from "./tenant-scope";
import type { AppSession } from "./types";

export type ShiftLiquidationTripLine = {
  id: string;
  platform: string;
  startedAt: string;
  endedAt: string | null;
  fareType: string | null;
  paymentMethod: string | null;
  grossCents: number;
  netCents: number;
  tipCents: number;
  tollCents: number;
  platformFeeCents: number;
  paymentValidated: boolean;
};

export type ShiftLiquidationDocument = {
  tenantName: string;
  tenantTimezone: string;
  companyLegalName: string;
  companyTaxId: string | null;
  companyLogoUrl: string | null;
  companyContactLine: string;
  driverName: string;
  driverLicense: string | null;
  driverId: string;
  tripIds: string[];
  liquidation: LiquidationSummary;
  trips: ShiftLiquidationTripLine[];
  note: string | null;
  generatedAt: string;
  referenceId: string;
};

type DocumentBody = {
  driverId?: string;
  tripIds?: string[];
  /** When true, trips may already be closed (download after cierre). */
  allowClosed?: boolean;
  note?: string;
};

function profileLine(profile: unknown): string {
  if (!profile || typeof profile !== "object") return "";
  const p = profile as Record<string, unknown>;
  const parts = [p.address, p.city].filter((x) => typeof x === "string" && x.trim());
  return parts.join(", ");
}

function cents(v: bigint | null | undefined): number {
  if (v == null) return 0;
  return Number(v);
}

export async function loadShiftLiquidationDocument(
  session: AppSession,
  body: unknown,
  options?: { companyScope?: CompanyScope },
): Promise<Result<ShiftLiquidationDocument, { message: string }>> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }

  const tenantId = session.tid;
  const b = body as DocumentBody;
  const driverId = b.driverId?.trim() ?? "";
  const tripIds = Array.isArray(b.tripIds)
    ? b.tripIds.filter((id): id is string => typeof id === "string")
    : [];
  const allowClosed = b.allowClosed === true;
  const note = typeof b.note === "string" ? b.note.trim().slice(0, 2000) : null;

  if (!driverId && tripIds.length === 0) {
    return err({ message: "Indica el conductor o los viajes." });
  }

  const scope =
    options?.companyScope ??
    (await resolveCompanyScopeForSession({
      ...session,
      kind: "tenant",
      tid: tenantId,
    }));

  return withTenant(tenantId, async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, timezone: true },
    });
    if (!tenant) return err({ message: "Tenant no encontrado." });

    const statusFilter = allowClosed ? undefined : "pending";

    const trips = await tx.trip.findMany({
      where: {
        tenantId,
        ...(statusFilter ? { liquidationStatus: statusFilter } : {}),
        ...(tripIds.length > 0 ? { id: { in: tripIds } } : {}),
        ...(driverId ? { driverId } : {}),
        driver: driverWhere(scope),
      },
      orderBy: { startedAt: "asc" },
      select: {
        id: true,
        platform: true,
        startedAt: true,
        endedAt: true,
        fareType: true,
        paymentMethod: true,
        grossAmountCents: true,
        netAmountCents: true,
        platformFeeCents: true,
        tipCents: true,
        platformBonusCents: true,
        tollCents: true,
        paymentValidated: true,
        driver: {
          select: {
            id: true,
            fullName: true,
            licenseNumber: true,
            driverSharePct: true,
            driverBonusSharePct: true,
            driverPlatformFeeSharePct: true,
            dailyFixedCents: true,
            company: {
              select: { legalName: true, taxId: true, profile: true, logoUrl: true },
            },
          },
        },
      },
    });

    if (trips.length === 0) {
      return err({ message: "No hay viajes para este documento." });
    }

    const driver = trips[0]!.driver;
    const liquidation = computeLiquidationSummary(
      trips,
      resolveDriverEconomics(driver, driver.company.profile),
    );

    const tripLines: ShiftLiquidationTripLine[] = trips.map((t) => {
      const gross =
        t.grossAmountCents != null
          ? cents(t.grossAmountCents)
          : cents(t.netAmountCents) + cents(t.platformFeeCents);
      const net =
        t.netAmountCents != null ? cents(t.netAmountCents) : gross - cents(t.platformFeeCents);
      return {
        id: t.id,
        platform: t.platform,
        startedAt: t.startedAt.toISOString(),
        endedAt: t.endedAt?.toISOString() ?? null,
        fareType: t.fareType,
        paymentMethod: t.paymentMethod,
        grossCents: gross,
        netCents: net,
        tipCents: cents(t.tipCents),
        tollCents: cents(t.tollCents),
        platformFeeCents: cents(t.platformFeeCents),
        paymentValidated: t.paymentValidated,
      };
    });

    return ok({
      tenantName: tenant.name,
      tenantTimezone: tenant.timezone,
      companyLegalName: driver.company.legalName,
      companyTaxId: driver.company.taxId,
      companyLogoUrl: driver.company.logoUrl,
      companyContactLine: profileLine(driver.company.profile),
      driverName: driver.fullName,
      driverLicense: driver.licenseNumber,
      driverId: driver.id,
      tripIds: trips.map((t) => t.id),
      liquidation,
      trips: tripLines,
      note,
      generatedAt: new Date().toISOString(),
      referenceId: trips[0]!.id.slice(0, 8).toUpperCase(),
    });
  });
}
