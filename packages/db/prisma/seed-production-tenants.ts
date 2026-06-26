import { PrismaClient, TenantRole } from "@prisma/client";

type CompanySeed = {
  legalName: string;
  taxId: string;
  licensedDrivers: number;
};

type TenantSeed = {
  slug: string;
  name: string;
  managerName: string;
  companies: CompanySeed[];
};

/**
 * Production tenant skeleton (Super Admin tenants table).
 * Operational CIFs live in `@fleethub/auth/group-tenant-company-map` for umbrella groups.
 */
export const PRODUCTION_TENANT_SEEDS: TenantSeed[] = [
  {
    slug: "noemi",
    name: "ALQUILAUTO",
    managerName: "Noemí",
    companies: [{ legalName: "ALQUILAUTO, S.L.", taxId: "B60318094", licensedDrivers: 20 }],
  },
  {
    slug: "cazcarra",
    name: "CAZCARRA",
    managerName: "Cazcarra",
    companies: [
      { legalName: "TAXIS ALSETO, S.L.", taxId: "B60888112", licensedDrivers: 21 },
      { legalName: "TAXIS PALLAS, S.L.", taxId: "B60907078", licensedDrivers: 5 },
      { legalName: "AUTOTAXIS BUIL, S.L.", taxId: "B60900123", licensedDrivers: 11 },
    ],
  },
  {
    slug: "jobroco-s-l",
    name: "GRUPO QUINO",
    managerName: "María",
    companies: [
      { legalName: "JOBROCO, S.L.", taxId: "B60888179", licensedDrivers: 35 },
      { legalName: "JORORO, S.L.", taxId: "B60888138", licensedDrivers: 7 },
      { legalName: "TAXIFLORES SL", taxId: "B64254501", licensedDrivers: 5 },
    ],
  },
  {
    slug: "trevino",
    name: "Treviño",
    managerName: "Treviño",
    companies: [
      { legalName: "TAXI BUSINESS, S.L.", taxId: "B63310759", licensedDrivers: 22 },
      { legalName: "GOLDEN TAXI BCN S.L.", taxId: "B65036527", licensedDrivers: 0 },
    ],
  },
  {
    slug: "trade-taxi-sl",
    name: "TRADETAXIS, S.L.",
    managerName: "Tradetaxis",
    companies: [
      { legalName: "TRADE TAXI, S.L.", taxId: "B63558043", licensedDrivers: 9 },
      { legalName: "DANIEL PIÑOL OVEJAS", taxId: "38147589L", licensedDrivers: 0 },
    ],
  },
  {
    slug: "cosculluela",
    name: "COSCULLUELA",
    managerName: "Cosculluela",
    companies: [
      { legalName: "BADAVI, S.L.", taxId: "B60508603", licensedDrivers: 22 },
      { legalName: "TAXIS GALERA, S.L.", taxId: "B60888120", licensedDrivers: 22 },
      { legalName: "SANTACOLOMA TAXI, S.L.", taxId: "B60867942", licensedDrivers: 2 },
    ],
  },
];

function companyProfile(managerName: string, licensedDrivers: number) {
  return {
    contactName: managerName,
    licensedDrivers,
    country: "España",
  };
}

function adminEmail(slug: string): string {
  return `admin-${slug}@fleethub.local`;
}

export async function seedProductionTenants(
  prisma: PrismaClient,
  passwordHash: string,
): Promise<void> {
  for (const spec of PRODUCTION_TENANT_SEEDS) {
    const tenant = await prisma.tenant.upsert({
      where: { slug: spec.slug },
      update: {
        name: spec.name,
        commercialStatus: "ACTIVE",
        trialEndsAt: null,
      },
      create: {
        name: spec.name,
        slug: spec.slug,
        commercialStatus: "ACTIVE",
      },
    });

    const companyIds: string[] = [];

    for (const c of spec.companies) {
      const company = await prisma.company.upsert({
        where: {
          tenantId_taxId: { tenantId: tenant.id, taxId: c.taxId },
        },
        update: {
          legalName: c.legalName,
          isActive: true,
          profile: companyProfile(spec.managerName, c.licensedDrivers),
        },
        create: {
          tenantId: tenant.id,
          legalName: c.legalName,
          taxId: c.taxId,
          isActive: true,
          profile: companyProfile(spec.managerName, c.licensedDrivers),
        },
      });
      companyIds.push(company.id);
    }

    const email = adminEmail(spec.slug);
    const admin = await prisma.user.upsert({
      where: {
        tenantId_email: { tenantId: tenant.id, email },
      },
      update: {
        passwordHash,
        role: TenantRole.ADMIN_TENANT,
        firstName: "Admin",
        lastName: spec.managerName,
        isActive: true,
        emailVerifiedAt: new Date(),
        totpEnabled: false,
        totpSecret: null,
        totpBackupHashes: null,
      },
      create: {
        tenantId: tenant.id,
        email,
        passwordHash,
        role: TenantRole.ADMIN_TENANT,
        firstName: "Admin",
        lastName: spec.managerName,
        emailVerifiedAt: new Date(),
      },
    });

    for (const companyId of companyIds) {
      await prisma.userCompany.upsert({
        where: { userId_companyId: { userId: admin.id, companyId } },
        create: { userId: admin.id, companyId },
        update: {},
      });
    }
  }
}

export function productionTenantsSeedSummary(): string {
  const lines = PRODUCTION_TENANT_SEEDS.flatMap((t) => {
    const lic = t.companies.reduce((s, c) => s + c.licensedDrivers, 0);
    const cos = t.companies.map((c) => `${c.legalName} (${c.licensedDrivers})`).join(", ");
    return [
      `  ${t.slug.padEnd(14)} / ${adminEmail(t.slug).padEnd(28)} · ${t.companies.length} empresa(s) · ${lic} lic.`,
      `    ${cos}`,
    ];
  });
  return [
    "",
    "Production tenants:",
    ...lines,
    "",
    "  Total: 6 umbrella tenants · see group-tenant-company-map for full CIF list",
  ].join("\n");
}
