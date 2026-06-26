import type { Result } from "@fleethub/contracts";
import { err, ok } from "@fleethub/contracts";
import { TenantCommercialStatus, TenantRole, prisma, writeAuditLog } from "@fleethub/db";
import { emailConflictMessage, findEmailAccountConflict } from "./email-uniqueness";
import { sendTenantUserVerificationEmail } from "./email-verification";
import { hashPassword, validatePasswordStrength } from "./password-policy";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isPublicSignupEnabled(): boolean {
  const raw = process.env.PUBLIC_SIGNUP_ENABLED?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "yes") return true;
  if (raw === "0" || raw === "false" || raw === "no") return false;
  return process.env.NODE_ENV !== "production";
}

function slugifyBase(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "flota"
  );
}

async function allocateUniqueSlug(baseName: string): Promise<string> {
  const base = slugifyBase(baseName);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const taken = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

type SignupBody = {
  operatorName?: string;
  companyLegalName?: string;
  companyTaxId?: string;
  adminEmail?: string;
  adminPassword?: string;
  adminFirstName?: string;
  adminLastName?: string;
};

export async function registerPublicTenant(
  body: unknown,
): Promise<
  Result<
    { ok: true; slug: string; verifyEmailSent: true },
    { message: string; code?: "disabled" | "conflict" }
  >
> {
  if (!isPublicSignupEnabled()) {
    return err({
      message: "El registro público no está disponible. Contacta con FleetHub.",
      code: "disabled",
    });
  }

  const b = (body ?? {}) as SignupBody;
  const operatorName = b.operatorName?.trim() ?? "";
  const companyLegalName = b.companyLegalName?.trim() || operatorName;
  const companyTaxId = b.companyTaxId?.trim() || null;
  const adminEmail = b.adminEmail?.trim().toLowerCase() ?? "";
  const adminPassword = b.adminPassword ?? "";
  const adminFirstName = b.adminFirstName?.trim() || null;
  const adminLastName = b.adminLastName?.trim() || null;

  if (!operatorName || !companyLegalName || !adminEmail) {
    return err({ message: "Completa nombre del operador, empresa y email." });
  }
  if (!isValidEmail(adminEmail)) {
    return err({ message: "Email no válido." });
  }

  const policyErr = validatePasswordStrength(adminPassword);
  if (policyErr) return err({ message: policyErr });

  const emailConflict = await findEmailAccountConflict(adminEmail);
  if (emailConflict) {
    return err({ message: emailConflictMessage(emailConflict), code: "conflict" });
  }

  const nameTaken = await prisma.tenant.findFirst({
    where: { name: { equals: operatorName, mode: "insensitive" } },
    select: { id: true },
  });
  if (nameTaken) {
    return err({ message: "Ya existe un operador con ese nombre.", code: "conflict" });
  }

  const slug = await allocateUniqueSlug(operatorName);
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const passwordHash = hashPassword(adminPassword);

  const tenant = await prisma.tenant.create({
    data: {
      name: operatorName,
      slug,
      commercialStatus: TenantCommercialStatus.TRIAL,
      trialEndsAt,
      settings: { signupSource: "public" },
    },
  });

  const company = await prisma.company.create({
    data: {
      tenantId: tenant.id,
      legalName: companyLegalName,
      taxId: companyTaxId,
      isActive: true,
    },
  });

  const user = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: adminEmail,
      passwordHash,
      role: TenantRole.ADMIN_TENANT,
      firstName: adminFirstName,
      lastName: adminLastName,
      isActive: true,
      emailVerifiedAt: null,
    },
  });

  await prisma.userCompany.create({
    data: { userId: user.id, companyId: company.id },
  });

  await sendTenantUserVerificationEmail({
    userId: user.id,
    email: user.email,
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
  });

  await writeAuditLog({
    tenantId: tenant.id,
    actorUserId: user.id,
    action: "tenant.signup.public",
    entityType: "tenant",
    entityId: tenant.id,
    payload: { slug, adminEmail },
  });

  return ok({ ok: true, slug: tenant.slug, verifyEmailSent: true });
}
