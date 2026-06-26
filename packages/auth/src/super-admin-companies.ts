import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { Prisma } from "@prisma/client";
import { withoutTenant, writeAuditLog } from "@fleethub/db";
import type { AppSession } from "./types";
import {
  findCompanyDuplicates,
  formatDuplicateError,
  isUniqueTaxIdError,
  normalizeProfile,
  type CompanyBody,
} from "./tenant-companies";

function requirePlatform(session: AppSession): Result<true, { message: string }> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }
  return ok(true);
}

/** Reuse tenant company body shape (legalName, taxId, isActive, profile). */
function parseCompanyUpdateBody(body: unknown): CompanyBody {
  return body as CompanyBody;
}

export async function updateCompanyForSuperAdmin(
  session: AppSession,
  companyId: string,
  body: unknown,
): Promise<Result<{ ok: true }, { message: string }>> {
  const auth = requirePlatform(session);
  if (!auth.ok) return auth;

  const id = companyId.trim();
  if (!id) return err({ message: "Empresa no válida." });

  const b = parseCompanyUpdateBody(body);

  const existing = await withoutTenant((tx) =>
    tx.company.findUnique({
      where: { id },
      select: { id: true, tenantId: true, legalName: true, taxId: true, profile: true },
    }),
  );
  if (!existing) {
    return err({ message: "Empresa no encontrada." });
  }

  const nextLegalName = b.legalName !== undefined ? b.legalName.trim() : existing.legalName;
  const nextTaxId =
    b.taxId !== undefined
      ? b.taxId === null || String(b.taxId).trim() === ""
        ? null
        : String(b.taxId).trim()
      : existing.taxId;

  if (b.legalName !== undefined && !nextLegalName) {
    return err({ message: "La razón social es obligatoria." });
  }

  if (b.legalName !== undefined || b.taxId !== undefined) {
    const duplicates = await findCompanyDuplicates(nextLegalName, nextTaxId);
    const others = duplicates.filter((d) => d.companyId !== id);
    if (others.length > 0) {
      return err({ message: formatDuplicateError(others, existing.tenantId) });
    }
  }

  const data: {
    legalName?: string;
    taxId?: string | null;
    isActive?: boolean;
    profile?: Prisma.InputJsonValue;
  } = {};

  if (b.legalName !== undefined) data.legalName = nextLegalName;
  if (b.taxId !== undefined) data.taxId = nextTaxId;
  if (b.isActive !== undefined) data.isActive = b.isActive;

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
    return err({ message: "No hay cambios que guardar." });
  }

  try {
    await withoutTenant(async (tx) => {
      await tx.company.update({ where: { id }, data });
    }, undefined, existing.tenantId);
  } catch (e) {
    if (isUniqueTaxIdError(e)) {
      return err({ message: "Ya existe una empresa con ese NIF/CIF en el operador." });
    }
    throw e;
  }

  await writeAuditLog({
    actorUserId: session.sub,
    action: "company.update",
    entityType: "company",
    entityId: id,
    payload: { tenantId: existing.tenantId, asSuperAdmin: true, ...data },
  });

  return ok({ ok: true });
}

export async function deleteCompanyForSuperAdmin(
  session: AppSession,
  companyId: string,
): Promise<Result<{ ok: true }, { message: string }>> {
  const auth = requirePlatform(session);
  if (!auth.ok) return auth;

  const id = companyId.trim();
  if (!id) return err({ message: "Empresa no válida." });

  const company = await withoutTenant((tx) =>
    tx.company.findUnique({
      where: { id },
      select: {
        id: true,
        legalName: true,
        tenantId: true,
        tenant: { select: { name: true, slug: true } },
        _count: { select: { drivers: true } },
      },
    }),
  );
  if (!company) {
    return err({ message: "Empresa no encontrada." });
  }

  if (company._count.drivers > 0) {
    return err({
      message:
        "No se puede eliminar: tiene conductores asociados. Desactívela o traslade los conductores a otra empresa antes.",
    });
  }

  const companyCount = await withoutTenant(
    (tx) => tx.company.count({ where: { tenantId: company.tenantId } }),
    undefined,
    company.tenantId,
  );
  if (companyCount <= 1) {
    return err({
      message:
        "No se puede eliminar la única empresa del operador. Cree otra empresa antes o elimine el operador completo.",
    });
  }

  await withoutTenant(async (tx) => {
    await tx.userCompany.deleteMany({ where: { companyId: id } });
    await tx.company.delete({ where: { id } });
  }, undefined, company.tenantId);

  await writeAuditLog({
    actorUserId: session.sub,
    action: "company.delete",
    entityType: "company",
    entityId: id,
    payload: {
      tenantId: company.tenantId,
      legalName: company.legalName,
      asSuperAdmin: true,
    },
  });

  return ok({ ok: true });
}
