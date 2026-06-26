import type { LiquidationDriverEconomics } from "./shift-liquidation";

/** Fallbacks when neither driver nor company defines a split (matches liquidation engine). */
export const SYSTEM_ECONOMIC_DEFAULTS = {
  driverSharePct: 50,
  driverBonusSharePct: 50,
  driverPlatformFeeSharePct: 0,
} as const;

export type CompanyEconomicDefaults = {
  defaultDriverSharePct: number | null;
  defaultDriverBonusSharePct: number | null;
  defaultDriverPlatformFeeSharePct: number | null;
};

export type DriverEconomicOverrides = {
  driverSharePct?: number | null;
  driverBonusSharePct?: number | null;
  driverPlatformFeeSharePct?: number | null;
  dailyFixedCents?: number | bigint | null;
};

export function parseOptionalSharePct(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value.replace(",", "."))
        : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

export function readCompanyEconomicDefaults(profile: unknown): CompanyEconomicDefaults {
  if (!profile || typeof profile !== "object") {
    return {
      defaultDriverSharePct: null,
      defaultDriverBonusSharePct: null,
      defaultDriverPlatformFeeSharePct: null,
    };
  }
  const o = profile as Record<string, unknown>;
  return {
    defaultDriverSharePct: parseOptionalSharePct(o.defaultDriverSharePct),
    defaultDriverBonusSharePct: parseOptionalSharePct(o.defaultDriverBonusSharePct),
    defaultDriverPlatformFeeSharePct: parseOptionalSharePct(o.defaultDriverPlatformFeeSharePct),
  };
}

function resolvePct(
  driverValue: number | null | undefined,
  companyDefault: number | null,
  systemDefault: number,
): number {
  if (driverValue != null && Number.isFinite(driverValue)) {
    return Math.min(100, Math.max(0, Math.round(driverValue)));
  }
  if (companyDefault != null && Number.isFinite(companyDefault)) {
    return Math.min(100, Math.max(0, Math.round(companyDefault)));
  }
  return systemDefault;
}

/** Driver overrides win; otherwise company defaults; otherwise system fallbacks. */
export function resolveDriverEconomics(
  driver: DriverEconomicOverrides,
  companyProfile: unknown,
): LiquidationDriverEconomics {
  const company = readCompanyEconomicDefaults(companyProfile);
  return {
    driverSharePct: resolvePct(
      driver.driverSharePct,
      company.defaultDriverSharePct,
      SYSTEM_ECONOMIC_DEFAULTS.driverSharePct,
    ),
    driverBonusSharePct: resolvePct(
      driver.driverBonusSharePct,
      company.defaultDriverBonusSharePct,
      SYSTEM_ECONOMIC_DEFAULTS.driverBonusSharePct,
    ),
    driverPlatformFeeSharePct: resolvePct(
      driver.driverPlatformFeeSharePct,
      company.defaultDriverPlatformFeeSharePct,
      SYSTEM_ECONOMIC_DEFAULTS.driverPlatformFeeSharePct,
    ),
    dailyFixedCents:
      driver.dailyFixedCents != null ? Math.max(0, Math.round(Number(driver.dailyFixedCents))) : null,
  };
}
