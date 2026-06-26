import type { Prisma } from "@prisma/client";
import { TenantCommercialStatus } from "@fleethub/db";

export const TENANT_BILLING_PLANS = ["Starter", "Pro", "Enterprise"] as const;
export type TenantBillingPlan = (typeof TENANT_BILLING_PLANS)[number];

export type SuperAdminTenantFormPayload = {
  name?: string;
  taxId?: string | null;
  active?: boolean;
  commercialStatus?: TenantCommercialStatus;
  trialEndsAt?: string | null;
  billingPlan?: string;
  phone?: string;
  email?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  province?: string;
  /** @deprecated Legacy combined field; split on read if city/postal empty */
  cityPostal?: string;
  country?: string;
  contactPerson?: string;
  contactPhone?: string;
  iban?: string;
  manager?: string;
};

export function parseBillingPlan(value: unknown): TenantBillingPlan {
  if (value === "Pro" || value === "Enterprise" || value === "Starter") return value;
  return "Starter";
}

export function billingPlanFromTenantSettings(settings: unknown): TenantBillingPlan {
  if (!settings || typeof settings !== "object") return "Starter";
  return parseBillingPlan((settings as Record<string, unknown>).billingPlan);
}

export function managerFromTenantSettings(settings: unknown): string {
  if (!settings || typeof settings !== "object") return "";
  const m = (settings as Record<string, unknown>).manager;
  return typeof m === "string" ? m : "";
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Split "Barcelona 08027" into city + postal code for company.profile (tenant Empresas UI). */
export function parseCityPostalField(cityPostal: string): { city: string; postalCode: string } {
  const t = cityPostal.trim();
  const match = t.match(/^(.+?)\s+(\d{5})\s*$/);
  if (match) {
    return { city: match[1]!.trim(), postalCode: match[2]! };
  }
  return { city: t, postalCode: "" };
}

export function companyProfileFromSuperAdminForm(
  body: SuperAdminTenantFormPayload,
): Record<string, unknown> {
  let city = str(body.city);
  let postalCode = str(body.postalCode);
  if (!city && !postalCode && body.cityPostal) {
    const parsed = parseCityPostalField(str(body.cityPostal));
    city = parsed.city;
    postalCode = parsed.postalCode;
  }
  return {
    addressLine: str(body.address),
    city,
    postalCode,
    province: str(body.province),
    country: str(body.country) || "España",
    contactName: str(body.contactPerson),
    phone: str(body.phone),
    contactPhone: str(body.contactPhone),
    email: str(body.email),
    iban: str(body.iban),
    sepaNote: "",
  };
}

/** Contact email shown in SA lists — profile first, then tenant admin login email. */
export function contactEmailFromCompanyProfile(
  profile: unknown,
  fallbackLoginEmail?: string | null,
): string | null {
  const fromProfile = readCompanyProfileForSuperAdminForm(profile).email;
  if (fromProfile) return fromProfile;
  return fallbackLoginEmail?.trim() || null;
}

export function readCompanyProfileForSuperAdminForm(profile: unknown): {
  phone: string;
  contactPhone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  contactPerson: string;
  iban: string;
} {
  if (!profile || typeof profile !== "object") {
    return {
      phone: "",
      contactPhone: "",
      email: "",
      address: "",
      postalCode: "",
      city: "",
      province: "",
      country: "España",
      contactPerson: "",
      iban: "",
    };
  }
  const o = profile as Record<string, unknown>;
  let city = str(o.city);
  let postalCode = str(o.postalCode);
  if (!postalCode) {
    const legacy = str(o.cityPostal) || city;
    if (legacy) {
      const parsed = parseCityPostalField(legacy);
      if (parsed.postalCode) {
        city = parsed.city;
        postalCode = parsed.postalCode;
      }
    }
  }

  return {
    phone: str(o.phone),
    contactPhone: str(o.contactPhone),
    email: str(o.email),
    address: str(o.addressLine),
    postalCode,
    city,
    province: str(o.province),
    country: str(o.country) || "España",
    contactPerson: str(o.contactName),
    iban: str(o.iban),
  };
}

export function mergeTenantSettingsForSuperAdmin(
  current: unknown,
  billingPlan: TenantBillingPlan,
  manager: string,
): Prisma.InputJsonValue {
  const base =
    current && typeof current === "object" ? { ...(current as Record<string, unknown>) } : {};
  return {
    ...base,
    billingPlan,
    manager: manager.trim(),
  };
}

export function mergeCompanyProfileForSuperAdmin(
  existing: unknown,
  nextFields: Record<string, unknown>,
): Prisma.InputJsonValue {
  const existingProfile =
    existing && typeof existing === "object" ? { ...(existing as Record<string, unknown>) } : {};
  const { documents, licensedDrivers, ...rest } = existingProfile;
  return {
    ...rest,
    ...nextFields,
    ...(documents !== undefined ? { documents } : {}),
    ...(licensedDrivers !== undefined ? { licensedDrivers } : {}),
  };
}
