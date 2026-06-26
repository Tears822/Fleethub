import { isLikelyFleetEntityDriverName } from "@fleethub/auth";
import { RidePlatform, withTenant } from "@fleethub/db";
import type { Prisma } from "@prisma/client";
import {
  freenowDriverDisplayName,
  freenowLinkedCompanyName,
  freenowPublicDriverId,
  listAllFreenowCompanyDrivers,
} from "./freenow-client.js";
import {
  findFleetCompanyForFreenowName,
  listAllFreenowLinkedCompanies,
  normalizeCompanyMatchKey,
} from "./freenow-company-map.js";
import { FREENOW_FLEET_COMPANY_SEEDS } from "./freenow-fleet-company-seeds.js";

type DbTx = Prisma.TransactionClient;

export type FreenowRealignStats = {
  companiesEnsured: number;
  freenowCompanies: number;
  driversSeen: number;
  reassigned: number;
  linked: number;
  created: number;
  skipped: number;
  unmatchedCompanies: string[];
  errors: string[];
};

function normalizeDriverName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function ensureMissingFreenowFleetCompanies(
  tx: DbTx,
  tenantId: string,
): Promise<number> {
  const linked = await listAllFreenowLinkedCompanies();
  if (!linked.ok) return 0;

  const fleetCompanies = await tx.company.findMany({
    where: { tenantId },
    select: { id: true, legalName: true, taxId: true },
  });

  let ensured = 0;
  for (const fnCompany of linked.companies) {
    const publicCompanyId = fnCompany.id?.trim();
    if (!publicCompanyId) continue;
    const fnName = freenowLinkedCompanyName(fnCompany);
    if (findFleetCompanyForFreenowName(fleetCompanies, fnName)) continue;

    const seed = FREENOW_FLEET_COMPANY_SEEDS[publicCompanyId];
    if (!seed) continue;

    const taxId = seed.taxId.trim().toUpperCase();
    const existingByTax = fleetCompanies.find((c) => c.taxId?.toUpperCase() === taxId);
    if (existingByTax) continue;

    const created = await tx.company.create({
      data: {
        tenantId,
        legalName: seed.legalName,
        taxId,
        isActive: true,
        profile: { country: "España" },
      },
      select: { id: true, legalName: true, taxId: true },
    });
    fleetCompanies.push(created);
    ensured += 1;
  }

  return ensured;
}

async function findDriverForFreenowRow(
  tx: DbTx,
  tenantId: string,
  externalDriverId: string,
  fullName: string,
): Promise<{ id: string; companyId: string } | null> {
  const byExt = await tx.driverPlatformAccount.findFirst({
    where: { tenantId, platform: RidePlatform.FREENOW, externalDriverId },
    select: { driverId: true },
  });
  if (byExt) {
    const driver = await tx.driver.findFirst({
      where: { id: byExt.driverId, tenantId },
      select: { id: true, companyId: true },
    });
    if (driver) return driver;
  }

  const normalized = normalizeDriverName(fullName);
  const candidates = await tx.driver.findMany({
    where: { tenantId },
    select: { id: true, companyId: true, fullName: true },
  });
  for (const c of candidates) {
    if (normalizeDriverName(c.fullName) === normalized) {
      return { id: c.id, companyId: c.companyId };
    }
  }
  return null;
}

export async function realignDriverCompaniesFromFreenow(params: {
  tenantId: string;
  dryRun?: boolean;
}): Promise<FreenowRealignStats> {
  const stats: FreenowRealignStats = {
    companiesEnsured: 0,
    freenowCompanies: 0,
    driversSeen: 0,
    reassigned: 0,
    linked: 0,
    created: 0,
    skipped: 0,
    unmatchedCompanies: [],
    errors: [],
  };

  const linked = await listAllFreenowLinkedCompanies();
  if (!linked.ok) {
    stats.errors.push(linked.message);
    return stats;
  }

  stats.freenowCompanies = linked.companies.length;

  if (params.dryRun) {
    const fleetCompanies = await withTenant(params.tenantId, (tx) =>
      tx.company.findMany({
        where: { tenantId: params.tenantId },
        select: { id: true, legalName: true },
      }),
    );
    for (const fnCompany of linked.companies) {
      const fnName = freenowLinkedCompanyName(fnCompany);
      if (!findFleetCompanyForFreenowName(fleetCompanies, fnName)) {
        stats.unmatchedCompanies.push(`${fnCompany.id} ${fnName}`);
      }
    }
    return stats;
  }

  await withTenant(params.tenantId, async (tx) => {
    stats.companiesEnsured = await ensureMissingFreenowFleetCompanies(tx, params.tenantId);

    const fleetCompanies = await tx.company.findMany({
      where: { tenantId: params.tenantId },
      select: { id: true, legalName: true },
    });

    for (const fnCompany of linked.companies) {
      const publicCompanyId = fnCompany.id?.trim();
      if (!publicCompanyId) continue;
      const fnName = freenowLinkedCompanyName(fnCompany);
      const fleet = findFleetCompanyForFreenowName(fleetCompanies, fnName);
      if (!fleet) {
        stats.unmatchedCompanies.push(`${publicCompanyId} ${fnName}`);
        continue;
      }

      const api = await listAllFreenowCompanyDrivers(publicCompanyId, { status: "ACTIVE" });
      if (!api.ok) {
        stats.errors.push(`${publicCompanyId}: ${api.message}`);
        continue;
      }

      for (const row of api.drivers) {
        const externalDriverId = freenowPublicDriverId(row);
        const fullName = freenowDriverDisplayName(row);
        if (!externalDriverId || !fullName) {
          stats.skipped += 1;
          continue;
        }
        if (isLikelyFleetEntityDriverName(fullName, fleetCompanies.map((c) => c.legalName))) {
          stats.skipped += 1;
          continue;
        }
        stats.driversSeen += 1;

        let driver = await findDriverForFreenowRow(tx, params.tenantId, externalDriverId, fullName);

        if (!driver) {
          const created = await tx.driver.create({
            data: {
              tenantId: params.tenantId,
              companyId: fleet.id,
              fullName,
              isActive: true,
              driverSharePct: 40,
              driverBonusSharePct: 50,
              driverPlatformFeeSharePct: 0,
              dailyFixedCents: BigInt(0),
            },
            select: { id: true, companyId: true },
          });
          driver = created;
          stats.created += 1;
        } else if (driver.companyId !== fleet.id) {
          await tx.driver.update({
            where: { id: driver.id },
            data: { companyId: fleet.id },
          });
          stats.reassigned += 1;
        }

        const existingDpa = await tx.driverPlatformAccount.findFirst({
          where: { tenantId: params.tenantId, driverId: driver.id, platform: RidePlatform.FREENOW },
        });
        const metadata = {
          ...(typeof existingDpa?.metadata === "object" && existingDpa?.metadata
            ? (existingDpa.metadata as Record<string, unknown>)
            : {}),
          source: "freenow_realign",
          freenowPublicCompanyId: publicCompanyId,
          freenowLinkedAt: new Date().toISOString(),
        };

        if (existingDpa) {
          await tx.driverPlatformAccount.update({
            where: { id: existingDpa.id },
            data: {
              externalDriverId,
              isActive: true,
              metadata,
            },
          });
        } else {
          await tx.driverPlatformAccount.create({
            data: {
              tenantId: params.tenantId,
              driverId: driver.id,
              platform: RidePlatform.FREENOW,
              externalDriverId,
              isActive: true,
              metadata,
            },
          });
        }
        stats.linked += 1;
      }
    }
  });

  return stats;
}
