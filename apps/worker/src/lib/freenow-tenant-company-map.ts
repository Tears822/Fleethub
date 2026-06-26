/** Default FreeNow public company id per group tenant (override in tenant settings). */
export const DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG: Record<string, string> = {
  cosculluela: "GEYTMOBQGE",
  "trade-taxi-sl": "GEYDMNJUG4",
  trevino: "HEYTIMZR",
};

export function defaultFreenowPublicCompanyForTenantSlug(slug: string): string | undefined {
  return DEFAULT_FREENOW_PUBLIC_COMPANY_BY_TENANT_SLUG[slug];
}
