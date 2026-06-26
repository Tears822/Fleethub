import { ensureInitialVehicleAssignment } from "@fleethub/auth";
import { RidePlatform, prisma, withTenant } from "@fleethub/db";
import type { Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";

type DbTx = Prisma.TransactionClient;

export type GroupDriverSpreadsheetRow = {
  fullName: string;
  dni: string | null;
  companyLegalName: string;
  companyTaxId: string;
  platform: RidePlatform;
  platformDriverId: string | null;
  email: string | null;
};

export type GroupDriverImportStats = {
  rowsRead: number;
  groups: number;
  created: number;
  updated: number;
  reassigned: number;
  platformLinks: number;
  skipped: number;
  errors: string[];
};

function normalizeTaxId(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function parsePlatform(raw: string): RidePlatform | null {
  const u = raw.trim().toUpperCase();
  if (u === "UBER") return RidePlatform.UBER;
  if (u === "FREENOW" || u === "FREE NOW" || u === "FREE-NOW") return RidePlatform.FREENOW;
  return null;
}

function isUuidLike(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

function isLikelyFreenowPublicId(id: string): boolean {
  return id.length >= 12 && /^[A-Z0-9]+$/i.test(id);
}

function mergeGroupKey(row: GroupDriverSpreadsheetRow): string {
  const taxId = normalizeTaxId(row.companyTaxId);
  const dni = row.dni?.trim().toUpperCase();
  const name = normalizeName(row.fullName).toUpperCase();
  return `${taxId}|${dni || name}`;
}

type MergedGroup = {
  fullName: string;
  dni: string | null;
  companyTaxId: string;
  companyLegalName: string;
  email: string | null;
  uberExternalDriverId: string | null;
  freenowExternalDriverId: string | null;
  freenowSpreadsheetCode: string | null;
};

function mergeRows(rows: GroupDriverSpreadsheetRow[]): MergedGroup[] {
  const map = new Map<string, MergedGroup>();
  for (const row of rows) {
    const key = mergeGroupKey(row);
    const existing = map.get(key);
    const base: MergedGroup = existing ?? {
      fullName: normalizeName(row.fullName),
      dni: row.dni?.trim() || null,
      companyTaxId: normalizeTaxId(row.companyTaxId),
      companyLegalName: row.companyLegalName.trim(),
      email: row.email?.trim().toLowerCase() || null,
      uberExternalDriverId: null,
      freenowExternalDriverId: null,
      freenowSpreadsheetCode: null,
    };
    if (row.email?.trim()) base.email = row.email.trim().toLowerCase();
    const pid = row.platformDriverId?.trim() || null;
    if (row.platform === RidePlatform.UBER && pid) {
      base.uberExternalDriverId = pid;
    }
    if (row.platform === RidePlatform.FREENOW && pid) {
      if (isLikelyFreenowPublicId(pid)) {
        base.freenowExternalDriverId = pid;
      } else {
        base.freenowSpreadsheetCode = pid;
        if (!base.freenowExternalDriverId) base.freenowExternalDriverId = pid;
      }
    }
    map.set(key, base);
  }
  return [...map.values()];
}

/** Parse client CSV (fullName,dni,companyLegalName,companyTaxId,platform,platformDriverId,email). */
export function parseGroupDriverCsv(content: string): GroupDriverSpreadsheetRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length === 0) return [];

  const rows: GroupDriverSpreadsheetRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.toLowerCase().includes("fullname")) continue;

    const cols: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cols.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cols.push(cur);

    const fullName = cols[0]?.trim() ?? "";
    const taxId = cols[3]?.trim() ?? "";
    const platform = parsePlatform(cols[4] ?? "");
    if (!fullName || !taxId || !platform) continue;

    rows.push({
      fullName,
      dni: cols[1]?.trim() || null,
      companyLegalName: cols[2]?.trim() || "",
      companyTaxId: taxId,
      platform,
      platformDriverId: cols[5]?.trim() || null,
      email: cols[6]?.trim() || null,
    });
  }
  return rows;
}

async function findDriverInCompany(
  tx: DbTx,
  tenantId: string,
  companyId: string,
  group: MergedGroup,
): Promise<{ id: string } | null> {
  if (group.dni) {
    const byDni = await tx.driver.findFirst({
      where: { tenantId, companyId, dni: group.dni },
      select: { id: true },
    });
    if (byDni) return byDni;
  }

  const byName = await tx.driver.findFirst({
    where: {
      tenantId,
      companyId,
      fullName: { equals: group.fullName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (byName) return byName;

  if (group.uberExternalDriverId) {
    const byUber = await tx.driverPlatformAccount.findFirst({
      where: {
        tenantId,
        platform: RidePlatform.UBER,
        externalDriverId: group.uberExternalDriverId,
      },
      select: { driverId: true },
    });
    if (byUber) {
      const d = await tx.driver.findFirst({
        where: { id: byUber.driverId, tenantId, companyId },
        select: { id: true },
      });
      if (d) return d;
    }
  }

  if (group.freenowExternalDriverId) {
    const byFn = await tx.driverPlatformAccount.findFirst({
      where: {
        tenantId,
        platform: RidePlatform.FREENOW,
        externalDriverId: group.freenowExternalDriverId,
      },
      select: { driverId: true },
    });
    if (byFn) {
      const d = await tx.driver.findFirst({
        where: { id: byFn.driverId, tenantId, companyId },
        select: { id: true },
      });
      if (d) return d;
    }
  }

  return null;
}

/** Find driver tenant-wide (DNI, name, platform ids) — used to reassign empresa from Excel. */
async function findDriverInTenant(
  tx: DbTx,
  tenantId: string,
  group: MergedGroup,
): Promise<{ id: string; companyId: string } | null> {
  if (group.uberExternalDriverId) {
    const byUber = await tx.driverPlatformAccount.findFirst({
      where: {
        tenantId,
        platform: RidePlatform.UBER,
        externalDriverId: group.uberExternalDriverId,
      },
      select: { driverId: true },
    });
    if (byUber) {
      const d = await tx.driver.findFirst({
        where: { id: byUber.driverId, tenantId },
        select: { id: true, companyId: true },
      });
      if (d) return d;
    }
  }

  if (group.freenowExternalDriverId) {
    const byFn = await tx.driverPlatformAccount.findFirst({
      where: {
        tenantId,
        platform: RidePlatform.FREENOW,
        externalDriverId: group.freenowExternalDriverId,
      },
      select: { driverId: true },
    });
    if (byFn) {
      const d = await tx.driver.findFirst({
        where: { id: byFn.driverId, tenantId },
        select: { id: true, companyId: true },
      });
      if (d) return d;
    }
  }

  if (group.dni) {
    const byDni = await tx.driver.findFirst({
      where: { tenantId, dni: group.dni },
      select: { id: true, companyId: true },
    });
    if (byDni) return byDni;
  }

  const byName = await tx.driver.findFirst({
    where: {
      tenantId,
      fullName: { equals: group.fullName, mode: "insensitive" },
    },
    select: { id: true, companyId: true },
  });
  return byName;
}

async function upsertPlatformAccount(
  tx: DbTx,
  tenantId: string,
  driverId: string,
  platform: RidePlatform,
  externalId: string,
  meta: Record<string, unknown>,
): Promise<boolean> {
  const existing = await tx.driverPlatformAccount.findFirst({
    where: { tenantId, driverId, platform },
  });

  if (existing) {
    const currentId = existing.externalDriverId;
    let nextId = externalId;
    if (platform === RidePlatform.FREENOW && isLikelyFreenowPublicId(currentId) && !isLikelyFreenowPublicId(externalId)) {
      nextId = currentId;
      meta = { ...meta, freenowSpreadsheetCode: externalId };
    }
    if (platform === RidePlatform.UBER && isUuidLike(currentId) && !isUuidLike(externalId)) {
      return false;
    }

    await tx.driverPlatformAccount.update({
      where: { id: existing.id },
      data: {
        externalDriverId: nextId,
        isActive: true,
        metadata: {
          ...(typeof existing.metadata === "object" && existing.metadata
            ? (existing.metadata as Record<string, unknown>)
            : {}),
          ...meta,
          linkedAt: new Date().toISOString(),
        },
      },
    });
    return true;
  }

  const conflict = await tx.driverPlatformAccount.findFirst({
    where: { tenantId, platform, externalDriverId: externalId },
  });
  if (conflict && conflict.driverId !== driverId) return false;

  await tx.driverPlatformAccount.create({
    data: {
      tenantId,
      driverId,
      platform,
      externalDriverId: externalId,
      isActive: true,
      metadata: { ...meta, linkedAt: new Date().toISOString() },
    },
  });
  return true;
}

export async function importGroupDriverSpreadsheet(params: {
  tenantId: string;
  rows: GroupDriverSpreadsheetRow[];
  dryRun?: boolean;
}): Promise<GroupDriverImportStats> {
  const stats: GroupDriverImportStats = {
    rowsRead: params.rows.length,
    groups: 0,
    created: 0,
    updated: 0,
    reassigned: 0,
    platformLinks: 0,
    skipped: 0,
    errors: [],
  };

  const groups = mergeRows(params.rows);
  stats.groups = groups.length;

  const companies = await prisma.company.findMany({
    where: { tenantId: params.tenantId },
    select: { id: true, legalName: true, taxId: true },
  });
  const companyByTax = new Map<string, string>();
  for (const c of companies) {
    if (c.taxId) companyByTax.set(normalizeTaxId(c.taxId), c.id);
  }

  if (params.dryRun) {
    for (const g of groups) {
      if (!companyByTax.has(g.companyTaxId)) {
        stats.errors.push(`Sin empresa CIF ${g.companyTaxId}: ${g.fullName}`);
        stats.skipped += 1;
      }
    }
    return stats;
  }

  await withTenant(params.tenantId, async (tx) => {
    for (const group of groups) {
      const companyId = companyByTax.get(group.companyTaxId);
      if (!companyId) {
        stats.errors.push(`Sin empresa CIF ${group.companyTaxId}: ${group.fullName}`);
        stats.skipped += 1;
        continue;
      }

      let driver = await findDriverInTenant(tx, params.tenantId, group);
      const isNew = !driver;

      if (!driver) {
        driver = await tx.driver.create({
          data: {
            tenantId: params.tenantId,
            companyId,
            fullName: group.fullName,
            dni: group.dni,
            email: group.email,
            isActive: true,
            driverSharePct: 40,
            driverBonusSharePct: 50,
            driverPlatformFeeSharePct: 0,
            dailyFixedCents: BigInt(0),
          },
        });
        await ensureInitialVehicleAssignment(
          tx,
          params.tenantId,
          driver.id,
          null,
          null,
          new Date(),
        );
        stats.created += 1;
      } else {
        const needsMove = driver.companyId !== companyId;
        await tx.driver.update({
          where: { id: driver.id },
          data: {
            companyId,
            ...(group.dni ? { dni: group.dni } : {}),
            ...(group.email ? { email: group.email } : {}),
            isActive: true,
          },
        });
        if (needsMove) stats.reassigned += 1;
        else stats.updated += 1;
      }

      if (group.uberExternalDriverId) {
        const linked = await upsertPlatformAccount(
          tx,
          params.tenantId,
          driver.id,
          RidePlatform.UBER,
          group.uberExternalDriverId,
          { source: "group_spreadsheet", spreadsheetImport: true },
        );
        if (linked) stats.platformLinks += 1;
      }

      if (group.freenowExternalDriverId) {
        const linked = await upsertPlatformAccount(
          tx,
          params.tenantId,
          driver.id,
          RidePlatform.FREENOW,
          group.freenowExternalDriverId,
          {
            source: "group_spreadsheet",
            spreadsheetImport: true,
            ...(group.freenowSpreadsheetCode
              ? { freenowSpreadsheetCode: group.freenowSpreadsheetCode }
              : {}),
          },
        );
        if (linked) stats.platformLinks += 1;
      }

      if (!isNew && !group.uberExternalDriverId && !group.freenowExternalDriverId) {
        stats.skipped += 1;
      }
    }
  });

  return stats;
}

export async function importGroupDriverSpreadsheetFromFile(params: {
  tenantSlug: string;
  csvPath: string;
  dryRun?: boolean;
}): Promise<GroupDriverImportStats | { error: string }> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: params.tenantSlug },
    select: { id: true, slug: true },
  });
  if (!tenant) return { error: `Tenant not found: ${params.tenantSlug}` };

  const content = await readFile(params.csvPath, "utf8");
  const rows = parseGroupDriverCsv(content);
  if (rows.length === 0) return { error: "No rows parsed from CSV" };

  return importGroupDriverSpreadsheet({
    tenantId: tenant.id,
    rows,
    dryRun: params.dryRun,
  });
}
