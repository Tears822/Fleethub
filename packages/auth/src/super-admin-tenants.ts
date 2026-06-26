import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { Prisma } from "@prisma/client";
import { TenantCommercialStatus, TenantRole, withoutTenant, writeAuditLog } from "@fleethub/db";
import { emailConflictMessage, findEmailAccountConflict } from "./email-uniqueness";
import { hashPassword, validatePasswordStrength } from "./password-policy";
import {
  billingPlanFromTenantSettings,
  companyProfileFromSuperAdminForm,
  managerFromTenantSettings,
  mergeCompanyProfileForSuperAdmin,
  mergeTenantSettingsForSuperAdmin,
  parseBillingPlan,
  readCompanyProfileForSuperAdminForm,
  type SuperAdminTenantFormPayload,
} from "./super-admin-tenant-form-persist";
import { findCompanyDuplicates, formatDuplicateError, parseCompanyCreateBody } from "./tenant-companies";
import type { AppSession } from "./types";

type CreateTenantBody = SuperAdminTenantFormPayload & {
  slug: string;
  companyLegalName?: string;
  companyTaxId?: string;
  adminEmail: string;
  adminPassword: string;
  adminFirstName?: string;
  adminLastName?: string;
};

export async function createTenantWithAdmin(
  session: AppSession,
  body: unknown,
): Promise<Result<{ tenantId: string; slug: string }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }

  const b = body as Partial<CreateTenantBody>;
  const name = b.name?.trim() ?? "";
  const slug = b.slug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-") ?? "";
  const adminEmail = b.adminEmail?.trim().toLowerCase() ?? "";
  const adminPassword = b.adminPassword ?? "";

  if (!name || !slug || !adminEmail) {
    return err({ message: "Completa nombre del operador, slug y email del administrador." });
  }

  const policyErr = validatePasswordStrength(adminPassword);
  if (policyErr) return err({ message: policyErr });

  const emailConflict = await findEmailAccountConflict(adminEmail);
  if (emailConflict) {
    return err({ message: emailConflictMessage(emailConflict) });
  }

  const existing = await withoutTenant((tx) => tx.tenant.findUnique({ where: { slug } }));
  if (existing) {
    return err({ message: "Ese slug ya está en uso." });
  }

  const nameTaken = await withoutTenant((tx) =>
    tx.tenant.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
    }),
  );
  if (nameTaken) {
    return err({ message: "Ya existe un operador con ese nombre." });
  }

  const passwordHash = hashPassword(adminPassword);
  const billingPlan = parseBillingPlan(b.billingPlan);
  const commercialStatus =
    b.commercialStatus && Object.values(TenantCommercialStatus).includes(b.commercialStatus)
      ? b.commercialStatus
      : TenantCommercialStatus.TRIAL;

  let trialEndsAt: Date | null = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (b.trialEndsAt === null || b.trialEndsAt === "") {
    trialEndsAt = commercialStatus === "TRIAL" ? trialEndsAt : null;
  } else if (b.trialEndsAt) {
    const parsed = new Date(b.trialEndsAt);
    if (!Number.isNaN(parsed.getTime())) trialEndsAt = parsed;
  }

  const tenant = await withoutTenant((tx) =>
    tx.tenant.create({
      data: {
        name,
        slug,
        commercialStatus,
        trialEndsAt,
        settings: mergeTenantSettingsForSuperAdmin({}, billingPlan, b.manager ?? ""),
      },
    }),
  );

  await withoutTenant(
    (tx) =>
      tx.user.create({
        data: {
          tenantId: tenant.id,
          email: adminEmail,
          passwordHash,
          role: TenantRole.ADMIN_TENANT,
          firstName: b.adminFirstName?.trim() || null,
          lastName: b.adminLastName?.trim() || null,
          emailVerifiedAt: new Date(),
          isActive: true,
        },
      }),
    undefined,
    tenant.id,
  );

  await writeAuditLog({
    actorUserId: session.sub,
    action: "tenant.create",
    entityType: "tenant",
    entityId: tenant.id,
    payload: { slug, adminEmail, billingPlan },
  });

  return ok({ tenantId: tenant.id, slug: tenant.slug });
}

export async function updateTenantForSuperAdmin(
  session: AppSession,
  tenantId: string,
  body: unknown,
): Promise<Result<{ id: string }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }

  const b = body as SuperAdminTenantFormPayload;
  const name = b.name?.trim();
  const commercialStatus = b.commercialStatus;
  let trialEndsAt: Date | null | undefined;

  if (b.trialEndsAt === null || b.trialEndsAt === "") {
    trialEndsAt = null;
  } else if (b.trialEndsAt !== undefined) {
    const parsed = new Date(b.trialEndsAt);
    if (Number.isNaN(parsed.getTime())) {
      return err({ message: "Fecha de fin de prueba no válida." });
    }
    trialEndsAt = parsed;
  }

  if (name !== undefined && !name) {
    return err({ message: "El nombre del tenant es obligatorio." });
  }

  if (name) {
    const nameTaken = await withoutTenant((tx) =>
      tx.tenant.findFirst({
        where: {
          name: { equals: name, mode: "insensitive" },
          NOT: { id: tenantId },
        },
      }),
    );
    if (nameTaken) {
      return err({ message: "Ya existe otro operador con ese nombre." });
    }
  }

  if (
    commercialStatus !== undefined &&
    !Object.values(TenantCommercialStatus).includes(commercialStatus)
  ) {
    return err({ message: "Estado comercial no válido." });
  }

  const tenant = await withoutTenant(
    (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, settings: true },
      }),
    undefined,
    tenantId,
  );
  if (!tenant) {
    return err({ message: "Tenant no encontrado." });
  }

  const billingPlan =
    b.billingPlan !== undefined ? parseBillingPlan(b.billingPlan) : undefined;
  const manager = b.manager !== undefined ? b.manager.trim() : undefined;

  const tenantData: {
    name?: string;
    commercialStatus?: TenantCommercialStatus;
    trialEndsAt?: Date | null;
    settings?: ReturnType<typeof mergeTenantSettingsForSuperAdmin>;
  } = {};

  if (name) tenantData.name = name;
  if (commercialStatus !== undefined) tenantData.commercialStatus = commercialStatus;
  if (trialEndsAt !== undefined) tenantData.trialEndsAt = trialEndsAt;

  if (billingPlan !== undefined || manager !== undefined) {
    tenantData.settings = mergeTenantSettingsForSuperAdmin(
      tenant.settings,
      billingPlan ?? billingPlanFromTenantSettings(tenant.settings),
      manager ?? managerFromTenantSettings(tenant.settings),
    );
  }

  if (Object.keys(tenantData).length === 0) {
    return err({ message: "No hay cambios que guardar." });
  }

  await withoutTenant(
    (tx) => tx.tenant.update({ where: { id: tenantId }, data: tenantData }),
    undefined,
    tenantId,
  );

  await writeAuditLog({
    actorUserId: session.sub,
    action: "tenant.update",
    entityType: "tenant",
    entityId: tenantId,
    payload: {
      name,
      commercialStatus,
      trialEndsAt,
      billingPlan,
      manager,
    },
  });

  return ok({ id: tenantId });
}

export async function deleteTenantForSuperAdmin(
  session: AppSession,
  tenantId: string,
): Promise<Result<{ ok: true }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }

  const tenant = await withoutTenant(
    (tx) =>
      tx.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, name: true, slug: true },
      }),
    undefined,
    tenantId,
  );
  if (!tenant) {
    return err({ message: "Tenant no encontrado." });
  }

  try {
    await withoutTenant(
      (tx) => tx.tenant.delete({ where: { id: tenantId } }),
      undefined,
      tenantId,
    );
  } catch (e: unknown) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      (e.code === "P2025" || e.code === "P2003")
    ) {
      if (e.code === "P2025") {
        return err({ message: "Tenant no encontrado." });
      }
      return err({
        message: "No se puede eliminar el tenant: hay datos vinculados. Contacta con soporte.",
      });
    }
    throw e;
  }

  await writeAuditLog({
    actorUserId: session.sub,
    action: "tenant.delete",
    entityType: "tenant",
    entityId: tenantId,
    payload: { slug: tenant.slug, name: tenant.name },
  });

  return ok({ ok: true });
}

function isUniqueTaxIdError(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    "code" in e &&
    (e as { code: string }).code === "P2002"
  );
}

/** Add another company (razón social) under an existing tenant — Super Admin only. */
export async function createCompanyForSuperAdmin(
  session: AppSession,
  tenantId: string,
  body: unknown,
): Promise<Result<{ companyId: string }, { message: string }>> {
  if (session.kind !== "platform") {
    return err({ message: "No autorizado." });
  }

  const parsed = parseCompanyCreateBody(body);
  if (!parsed.ok) return parsed;

  const { legalName, taxId, isActive, profile } = parsed.value;

  const duplicates = await findCompanyDuplicates(legalName, taxId);
  if (duplicates.length > 0) {
    return err({ message: formatDuplicateError(duplicates, tenantId) });
  }

  const tenant = await withoutTenant(
    (tx) => tx.tenant.findUnique({ where: { id: tenantId }, select: { id: true } }),
    undefined,
    tenantId,
  );
  if (!tenant) {
    return err({ message: "Tenant no encontrado." });
  }

  try {
    const company = await withoutTenant(async (tx) => {
      const created = await tx.company.create({
        data: {
          tenantId,
          legalName,
          taxId,
          isActive,
          ...(profile ? { profile: profile as Prisma.InputJsonValue } : {}),
        },
      });

      const admins = await tx.user.findMany({
        where: { tenantId, role: TenantRole.ADMIN_TENANT, isActive: true },
        select: { id: true },
      });
      if (admins.length > 0) {
        await tx.userCompany.createMany({
          data: admins.map((u) => ({ userId: u.id, companyId: created.id })),
          skipDuplicates: true,
        });
      }
      return created;
    }, undefined, tenantId);

    await writeAuditLog({
      actorUserId: session.sub,
      action: "company.create",
      entityType: "company",
      entityId: company.id,
      payload: { tenantId, legalName, taxId, asSuperAdmin: true },
    });

    return ok({ companyId: company.id });
  } catch (e) {
    if (isUniqueTaxIdError(e)) {
      return err({ message: "Ya existe una empresa con ese NIF/CIF en el operador." });
    }
    throw e;
  }
}

/** Build form defaults for Super Admin edit UI. */
export function superAdminTenantToFormSnapshot(tenant: {
  id: string;
  name: string;
  slug: string;
  commercialStatus: TenantCommercialStatus;
  trialEndsAt: Date | null;
  settings: unknown;
  company: {
    taxId: string | null;
    isActive: boolean;
    profile: unknown;
  } | null;
  contactEmail: string | null;
}): {
  id: string;
  name: string;
  slug: string;
  taxId: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  contactPerson: string;
  contactPhone: string;
  iban: string;
  manager: string;
  plan: ReturnType<typeof billingPlanFromTenantSettings>;
  active: boolean;
  commercialStatus: TenantCommercialStatus;
  trialEndsAt: string;
  /** Login email of the first tenant admin — not the company contact email. */
  adminLoginEmail: string;
} {
  const profile = readCompanyProfileForSuperAdminForm(tenant.company?.profile);

  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    taxId: tenant.company?.taxId ?? "",
    phone: profile.phone,
    email: profile.email,
    address: profile.address,
    postalCode: profile.postalCode,
    city: profile.city,
    province: profile.province,
    country: profile.country,
    contactPerson: profile.contactPerson,
    contactPhone: profile.contactPhone,
    iban: profile.iban,
    manager: managerFromTenantSettings(tenant.settings),
    plan: billingPlanFromTenantSettings(tenant.settings),
    active: tenant.company?.isActive ?? tenant.commercialStatus === "ACTIVE",
    commercialStatus: tenant.commercialStatus,
    trialEndsAt: tenant.trialEndsAt
      ? tenant.trialEndsAt.toISOString().slice(0, 10)
      : "",
    adminLoginEmail: tenant.contactEmail ?? "",
  };
}
