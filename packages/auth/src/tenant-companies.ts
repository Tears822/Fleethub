import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { TenantRole, prisma, withTenant, withoutTenant, writeAuditLog } from "@fleethub/db";
import type { Prisma } from "@prisma/client";
import { parseOptionalSharePct } from "./company-economic-defaults";
import type { AppSession } from "./types";

type CompanyProfileBody = {
  addressLine?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  country?: string;
  contactName?: string;
  phone?: string;
  contactPhone?: string;
  email?: string;
  iban?: string;
  sepaNote?: string;
  licensedDrivers?: number | string | null;
  defaultDriverSharePct?: number | string | null;
  defaultDriverBonusSharePct?: number | string | null;
  defaultDriverPlatformFeeSharePct?: number | string | null;
};

function parseLicensedDriversInput(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const t = value.trim();
    if (t === "") return null;
    const n = Number(t.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

export type CompanyBody = {
  legalName?: string;
  taxId?: string | null;
  isActive?: boolean;
  profile?: CompanyProfileBody;
};

export function normalizeProfile(
  body: CompanyProfileBody | undefined,
): Record<string, unknown> | undefined {
  if (!body || typeof body !== "object") return undefined;
  const pick = (key: keyof CompanyProfileBody) => {
    const v = body[key];
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    addressLine: pick("addressLine"),
    postalCode: pick("postalCode"),
    city: pick("city"),
    province: pick("province"),
    country: pick("country") || "España",
    contactName: pick("contactName"),
    phone: pick("phone"),
    contactPhone: pick("contactPhone"),
    email: pick("email"),
    iban: pick("iban"),
    sepaNote: pick("sepaNote"),
    licensedDrivers: parseLicensedDriversInput(body.licensedDrivers),
    defaultDriverSharePct: parseOptionalSharePct(body.defaultDriverSharePct),
    defaultDriverBonusSharePct: parseOptionalSharePct(body.defaultDriverBonusSharePct),
    defaultDriverPlatformFeeSharePct: parseOptionalSharePct(
      body.defaultDriverPlatformFeeSharePct,
    ),
  };
}

function requireAdmin(session: AppSession): Result<true, { message: string }> {
  if (session.kind !== "tenant" || !session.tid) {
    return err({ message: "No autorizado." });
  }
  if (session.role !== TenantRole.ADMIN_TENANT) {
    return err({ message: "Solo el administrador puede gestionar empresas." });
  }
  return ok(true);
}

function normalizeTaxId(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function isUniqueTaxIdError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  );
}

export type ParsedCompanyCreate = {
  legalName: string;
  taxId: string | null;
  isActive: boolean;
  profile: Record<string, unknown> | undefined;
};

export type CompanyDuplicateMatch = {
  companyId: string;
  legalName: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
};

/** Finds companies with the same razón social or CIF (any tenant). */
export async function findCompanyDuplicates(
  legalName: string,
  taxId: string | null,
): Promise<CompanyDuplicateMatch[]> {
  return withoutTenant(async (tx) => {
    const matches: CompanyDuplicateMatch[] = [];
    const seen = new Set<string>();

    const byName = await tx.company.findMany({
      where: { legalName: { equals: legalName, mode: "insensitive" } },
      select: {
        id: true,
        legalName: true,
        tenantId: true,
        tenant: { select: { name: true, slug: true } },
      },
    });
    for (const row of byName) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      matches.push({
        companyId: row.id,
        legalName: row.legalName,
        tenantId: row.tenantId,
        tenantName: row.tenant.name,
        tenantSlug: row.tenant.slug,
      });
    }

    if (taxId) {
      const byTax = await tx.company.findMany({
        where: { taxId },
        select: {
          id: true,
          legalName: true,
          tenantId: true,
          tenant: { select: { name: true, slug: true } },
        },
      });
      for (const row of byTax) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        matches.push({
          companyId: row.id,
          legalName: row.legalName,
          tenantId: row.tenantId,
          tenantName: row.tenant.name,
          tenantSlug: row.tenant.slug,
        });
      }
    }

    return matches;
  });
}

export function formatDuplicateError(
  matches: CompanyDuplicateMatch[],
  targetTenantId: string,
): string {
  const sameTenant = matches.filter((m) => m.tenantId === targetTenantId);
  if (sameTenant.length > 0) {
    return `Ya existe la empresa «${sameTenant[0]!.legalName}» en este operador.`;
  }
  const others = matches
    .map((m) => `«${m.legalName}» en ${m.tenantName} (${m.tenantSlug})`)
    .join("; ");
  return `Ya existe una empresa con ese nombre o CIF: ${others}. Asígnala al operador correcto en lugar de crear un duplicado.`;
}

/** Shared payload parsing for tenant and Super Admin company create. */
export function parseCompanyCreateBody(
  body: unknown,
): Result<ParsedCompanyCreate, { message: string }> {
  const b = body as CompanyBody;
  const legalName = b.legalName?.trim() ?? "";
  if (!legalName) {
    return err({ message: "La razón social es obligatoria." });
  }
  const taxId = normalizeTaxId(b.taxId);
  if (!taxId) {
    return err({ message: "El NIF / CIF es obligatorio." });
  }
  return ok({
    legalName,
    taxId,
    isActive: b.isActive !== false,
    profile: normalizeProfile(b.profile),
  });
}

export async function createTenantCompany(
  session: AppSession,
  body: unknown,
): Promise<Result<{ companyId: string }, { message: string }>> {
  const auth = requireAdmin(session);
  if (!auth.ok) return auth;

  const parsed = parseCompanyCreateBody(body);
  if (!parsed.ok) return parsed;

  const { legalName, taxId, isActive, profile } = parsed.value;
  const tenantId = session.tid!;

  const duplicates = await findCompanyDuplicates(legalName, taxId);
  if (duplicates.length > 0) {
    return err({ message: formatDuplicateError(duplicates, tenantId) });
  }

  try {
    const company = await withTenant(tenantId, (tx) =>
      tx.company.create({
        data: {
          tenantId,
          legalName,
          taxId,
          isActive,
          ...(profile ? { profile: profile as Prisma.InputJsonValue } : {}),
        },
      }),
    );

    await writeAuditLog({
      tenantId,
      actorUserId: session.sub,
      action: "company.create",
      entityType: "company",
      entityId: company.id,
      payload: { legalName, taxId, isActive },
    });

    return ok({ companyId: company.id });
  } catch (e) {
    if (isUniqueTaxIdError(e)) {
      return err({ message: "Ya existe una empresa con ese NIF/CIF en el tenant." });
    }
    throw e;
  }
}

export async function updateTenantCompany(
  session: AppSession,
  companyId: string,
  body: unknown,
): Promise<Result<{ ok: true }, { message: string }>> {
  const auth = requireAdmin(session);
  if (!auth.ok) return auth;

  const id = companyId.trim();
  if (!id) return err({ message: "Empresa no válida." });

  const b = body as CompanyBody;
  const tenantId = session.tid!;

  try {
    await withTenant(tenantId, async (tx) => {
      const existing = await tx.company.findFirst({
        where: { id, tenantId },
      });
      if (!existing) {
        throw new Error("NOT_FOUND");
      }

      const data: {
        legalName?: string;
        taxId?: string | null;
        isActive?: boolean;
        profile?: Prisma.InputJsonValue;
      } = {};

      if (b.legalName !== undefined) {
        const legalName = b.legalName.trim();
        if (!legalName) throw new Error("INVALID_NAME");
        data.legalName = legalName;
      }
      if (b.taxId !== undefined) {
        data.taxId = normalizeTaxId(b.taxId);
      }
      if (b.isActive !== undefined) {
        data.isActive = b.isActive;
      }
      if (b.profile !== undefined) {
        const nextProfile = normalizeProfile(b.profile);
        if (nextProfile) {
          const existingProfile =
            existing.profile && typeof existing.profile === "object"
              ? (existing.profile as Record<string, unknown>)
              : {};
          const { documents: existingDocuments, ...existingRest } = existingProfile;
          data.profile = {
            ...existingRest,
            ...nextProfile,
            ...(existingDocuments !== undefined ? { documents: existingDocuments } : {}),
          } as Prisma.InputJsonValue;
        }
      }

      if (Object.keys(data).length === 0) {
        throw new Error("EMPTY_UPDATE");
      }

      await tx.company.update({ where: { id }, data });
    });
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "NOT_FOUND") {
        return err({ message: "Empresa no encontrada." });
      }
      if (e.message === "INVALID_NAME") {
        return err({ message: "La razón social es obligatoria." });
      }
      if (e.message === "EMPTY_UPDATE") {
        return err({ message: "No hay cambios que guardar." });
      }
    }
    if (isUniqueTaxIdError(e)) {
      return err({ message: "Ya existe una empresa con ese NIF/CIF en el tenant." });
    }
    throw e;
  }

  await writeAuditLog({
    tenantId,
    actorUserId: session.sub,
    action: "company.update",
    entityType: "company",
    entityId: id,
    payload: {
      ...(b.legalName !== undefined ? { legalName: b.legalName.trim() } : {}),
      ...(b.taxId !== undefined ? { taxId: normalizeTaxId(b.taxId) } : {}),
      ...(b.isActive !== undefined ? { isActive: b.isActive } : {}),
    },
  });

  return ok({ ok: true });
}
