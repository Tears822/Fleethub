/**
 * Authoritative tenant ↔ empresa mapping (Super Admin tenants table / client Excel).
 * CIF is the stable key — legal names may vary slightly (TRADE TAXI vs TRADETAXIS).
 */
export type GroupTenantCompanySpec = {
  tenantSlug: string;
  tenantName: string;
  legalName: string;
};

/** Normalize CIF/NIF for lookup. */
export function normalizeTaxId(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase().replace(/[\s.-]/g, "");
}

export const GROUP_TENANT_COMPANY_BY_TAX_ID: Record<string, GroupTenantCompanySpec> = {
  // Cosculluela — BADAVI + Galera group + autónomos
  B60508603: {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "BADAVI, S.L.",
  },
  B60888120: {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "TAXIS GALERA, S.L.",
  },
  B63303861: {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "TAXIS BLANCO, SL",
  },
  B67086777: {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "TAXI BANUS, SL",
  },
  B60867942: {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "SANTACOLOMA TAXI, S.L.",
  },
  "72530387W": {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "JOAQUIN GARCIA LOPEZ",
  },
  "53652559E": {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "JAVIER DOMINGUEZ QUINTAS",
  },
  "46964321T": {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "VICTOR BALMONT SORITA",
  },
  "40998662N": {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "CRISTINA RIVAS MOREDA",
  },
  "40976521C": {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "RAFAEL BERMEJO",
  },
  "46528490L": {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "BARTOLOME SERRANO VIDAL",
  },
  "40979105M": {
    tenantSlug: "cosculluela",
    tenantName: "COSCULLUELA",
    legalName: "JOSE MIGUEL VICENTE ESCUDERO",
  },

  // Treviño — Taxi Business group
  B63310759: {
    tenantSlug: "trevino",
    tenantName: "Treviño",
    legalName: "TAXI BUSINESS, S.L.",
  },
  B65036527: {
    tenantSlug: "trevino",
    tenantName: "Treviño",
    legalName: "GOLDEN TAXI BCN S.L.",
  },

  // Tradetaxis
  B63558043: {
    tenantSlug: "trade-taxi-sl",
    tenantName: "TRADETAXIS, S.L.",
    legalName: "TRADE TAXI, S.L.",
  },
  "38147589L": {
    tenantSlug: "trade-taxi-sl",
    tenantName: "TRADETAXIS, S.L.",
    legalName: "DANIEL PIÑOL OVEJAS",
  },
};

export function tenantSlugForTaxId(taxId: string | null | undefined): string | null {
  const key = normalizeTaxId(taxId);
  return GROUP_TENANT_COMPANY_BY_TAX_ID[key]?.tenantSlug ?? null;
}

/** Companies assigned to a tenant slug in the authoritative structure. */
export function companiesForTenantSlug(slug: string): GroupTenantCompanySpec[] {
  return Object.values(GROUP_TENANT_COMPANY_BY_TAX_ID).filter((c) => c.tenantSlug === slug);
}
