import { PrismaClient } from "@prisma/client";
import { writeDemoCompanyLogo } from "./seed-helpers.js";
import { clearTenantOperativaData } from "./seed-demo-synthetic.js";

/** BADAVI S.L. — encrypted org id from GET /v1/vehicle-suppliers/orgs */
const BADAVI_UBER_ORG_ID =
  "8MKpeq-qtAElQy366IG6HoAN9_z0kDaIJh6fTpvN1v8Imfei3JYCNnCbgsIt2Ta4JB0pgpclsFfqP1Uhca5bguqnlXr9ADz-sU0hV6uXHuiT05pa8pmS5Vapf4bPOGoemw==";

const DEMO_A_SETTINGS = {
  productivity: {
    eurPerHourMin: 12,
    tripsPerHourMin: 1.5,
    acceptanceRateMin: 85,
  },
  analytics: { sectorBenchmarkOptIn: true },
  integrations: {
    pollingMinutesUber: 15,
    pollingMinutesFreeNow: 15,
    freenowPublicCompanyId: "GEYTMOBQGE",
    uberOrgId: BADAVI_UBER_ORG_ID,
    uberSyncDays: 7,
    freenowSyncDays: 7,
  },
  /** No synthetic trips/drivers — populate via platform sync (Uber, FreeNow, …). */
  dataSource: "live",
} as const;

/**
 * demo-a = BADAVI live sandbox: tenant shell + users only.
 * Drivers and trips come from connector sync, not seed data.
 */
export async function seedDemoA(prisma: PrismaClient, _passwordHash: string): Promise<void> {
  const tenantA = await prisma.tenant.upsert({
    where: { slug: "demo-a" },
    update: {
      name: "BADAVI SL",
      commercialStatus: "ACTIVE",
      trialEndsAt: null,
      settings: DEMO_A_SETTINGS,
    },
    create: {
      name: "BADAVI SL",
      slug: "demo-a",
      commercialStatus: "ACTIVE",
      settings: DEMO_A_SETTINGS,
      companies: {
        create: {
          legalName: "BADAVI SL",
          taxId: "B11223344",
        },
      },
    },
    include: { companies: true },
  });

  const companyA =
    tenantA.companies[0] ??
    (await prisma.company.findFirstOrThrow({
      where: { tenantId: tenantA.id },
    }));

  const extraCompanies = await prisma.company.findMany({
    where: { tenantId: tenantA.id, id: { not: companyA.id } },
  });
  for (const c of extraCompanies) {
    await prisma.driver.updateMany({ where: { companyId: c.id }, data: { companyId: companyA.id } });
    await prisma.company.delete({ where: { id: c.id } });
  }

  await prisma.company.update({
    where: { id: companyA.id },
    data: {
      legalName: "BADAVI SL",
      taxId: "B11223344",
      profile: {
        addressLine: "Av. Diagonal 100, 4º 2ª",
        postalCode: "08019",
        city: "Barcelona",
        province: "Barcelona",
        country: "España",
        contactName: "Noemí García",
        phone: "+34 93 123 45 67",
        email: "contacto@badavi.demo",
        iban: "ES12 2100 0813 6101 2345 6789",
        sepaNote: "Mandato SEPA firmado — Referencia: FH-BADAVI-001",
        documents: [
          { id: "nda", status: "signed" },
          { id: "auth", status: "signed" },
          { id: "sepa", status: "pending" },
        ],
      },
    },
  });

  const demoLogoUrl = await writeDemoCompanyLogo(tenantA.id, companyA.id);
  await prisma.company.update({
    where: { id: companyA.id },
    data: { logoUrl: demoLogoUrl },
  });

  await clearTenantOperativaData(prisma, tenantA.id);
}
