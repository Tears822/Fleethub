export type CompanyProfile = {
  addressLine: string;
  postalCode: string;
  city: string;
  province: string;
  country: string;
  contactName: string;
  phone: string;
  contactPhone: string;
  email: string;
  iban: string;
  sepaNote: string;
  /** Contracted driver slots (from seed / manual profile JSON). */
  licensedDrivers: number | null;
  /** Default % conductor en recaudación (heredado por conductores sin override). */
  defaultDriverSharePct: number | null;
  defaultDriverBonusSharePct: number | null;
  defaultDriverPlatformFeeSharePct: number | null;
};

export const EMPTY_COMPANY_PROFILE: CompanyProfile = {
  addressLine: "",
  postalCode: "",
  city: "",
  province: "",
  country: "España",
  contactName: "",
  phone: "",
  contactPhone: "",
  email: "",
  iban: "",
  sepaNote: "",
  licensedDrivers: null,
  defaultDriverSharePct: null,
  defaultDriverBonusSharePct: null,
  defaultDriverPlatformFeeSharePct: null,
};

function parseLicensedDrivers(raw: Record<string, unknown>): number | null {
  const v = raw.licensedDrivers;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return Math.floor(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  return null;
}

function parseOptionalSharePct(raw: Record<string, unknown>, key: string): number | null {
  const v = raw[key];
  if (typeof v === "number" && Number.isFinite(v)) {
    return Math.min(100, Math.max(0, Math.round(v)));
  }
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    if (Number.isFinite(n)) return Math.min(100, Math.max(0, Math.round(n)));
  }
  return null;
}

export function parseCompanyProfile(raw: unknown): CompanyProfile {
  if (!raw || typeof raw !== "object") return { ...EMPTY_COMPANY_PROFILE };
  const o = raw as Record<string, unknown>;
  const str = (k: keyof CompanyProfile, fallback = "") => {
    const v = o[k];
    return typeof v === "string" ? v : fallback;
  };
  return {
    addressLine: str("addressLine"),
    postalCode: str("postalCode"),
    city: str("city"),
    province: str("province"),
    country: str("country", "España"),
    contactName: str("contactName"),
    phone: str("phone"),
    contactPhone: str("contactPhone"),
    email: str("email"),
    iban: str("iban"),
    sepaNote: str("sepaNote"),
    licensedDrivers: parseLicensedDrivers(o),
    defaultDriverSharePct: parseOptionalSharePct(o, "defaultDriverSharePct"),
    defaultDriverBonusSharePct: parseOptionalSharePct(o, "defaultDriverBonusSharePct"),
    defaultDriverPlatformFeeSharePct: parseOptionalSharePct(o, "defaultDriverPlatformFeeSharePct"),
  };
}

export type LicenseUsageDisplay = {
  text: string;
  hasQuota: boolean;
  overCapacity: boolean;
};

/** Active drivers vs contracted license slots. */
export function formatLicenseUsage(
  activeDrivers: number,
  licensedDrivers: number | null,
): LicenseUsageDisplay {
  if (licensedDrivers == null || licensedDrivers <= 0) {
    return { text: "—", hasQuota: false, overCapacity: false };
  }
  const overCapacity = activeDrivers > licensedDrivers;
  return {
    text: `${activeDrivers} / ${licensedDrivers}`,
    hasQuota: true,
    overCapacity,
  };
}

export function companyProfileToJson(
  profile: CompanyProfile,
): Record<string, string | number | null> {
  const { licensedDrivers, ...rest } = profile;
  return {
    ...rest,
    ...(licensedDrivers != null ? { licensedDrivers } : {}),
    ...(profile.defaultDriverSharePct != null
      ? { defaultDriverSharePct: profile.defaultDriverSharePct }
      : {}),
    ...(profile.defaultDriverBonusSharePct != null
      ? { defaultDriverBonusSharePct: profile.defaultDriverBonusSharePct }
      : {}),
    ...(profile.defaultDriverPlatformFeeSharePct != null
      ? { defaultDriverPlatformFeeSharePct: profile.defaultDriverPlatformFeeSharePct }
      : {}),
  };
}

export function formatListAddress(profile: CompanyProfile): string {
  const parts = [profile.addressLine, profile.city, profile.country].filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : "—";
}

export function hasCompanyProfileData(profile: CompanyProfile): boolean {
  return Boolean(
    profile.addressLine.trim() ||
      profile.contactName.trim() ||
      profile.phone.trim() ||
      profile.contactPhone.trim() ||
      profile.email.trim() ||
      profile.iban.trim(),
  );
}

export type CompanyDocumentView = {
  id: string;
  title: string;
  status: "signed" | "pending";
  statusLabel: string;
  detail: string;
  fileUrl: string | null;
  fileName: string | null;
  uploadedAt: string | null;
  canDeleteUpload: boolean;
};

export type CompanyDocumentMaintenanceView = CompanyDocumentView & {
  pendingFleetHubPurge: boolean;
  deletedByTenantAt: string | null;
  retainedFileName: string | null;
  retainedDownloadUrl: string | null;
};

export function platformLabels(platforms: string[]): string[] {
  const labels: Record<string, string> = {
    UBER: "Uber",
    FREENOW: "FreeNow",
    BOLT: "Bolt",
    CABIFY: "Cabify",
  };
  return platforms.map((p) => labels[p] ?? p);
}
