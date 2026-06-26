import type { CompanyProfile } from "@/features/companies/lib/company-profile";

function field(form: FormData, name: string): string {
  return String(form.get(name) ?? "").trim();
}

function licensedDriversFromForm(form: FormData): number | null {
  const raw = field(form, "licensedDrivers");
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function optionalSharePct(form: FormData, name: string): number | null {
  const raw = String(form.get(name) ?? "").trim();
  if (!raw) return null;
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function empresaPayloadFromForm(form: FormData) {
  const isActive = form.get("isActive") === "on" || form.get("isActive") === "true";
  const profile: CompanyProfile = {
    addressLine: field(form, "addressLine"),
    postalCode: field(form, "postalCode"),
    city: field(form, "city"),
    province: field(form, "province"),
    country: field(form, "country") || "España",
    contactName: field(form, "contactName"),
    phone: field(form, "phone"),
    contactPhone: field(form, "contactPhone"),
    email: field(form, "email"),
    iban: field(form, "iban"),
    sepaNote: field(form, "sepaNote"),
    licensedDrivers: licensedDriversFromForm(form),
    defaultDriverSharePct: optionalSharePct(form, "defaultDriverSharePct"),
    defaultDriverBonusSharePct: optionalSharePct(form, "defaultDriverBonusSharePct"),
    defaultDriverPlatformFeeSharePct: optionalSharePct(form, "defaultDriverPlatformFeeSharePct"),
  };

  return {
    legalName: field(form, "legalName"),
    taxId: field(form, "taxId") || null,
    isActive,
    profile,
  };
}
