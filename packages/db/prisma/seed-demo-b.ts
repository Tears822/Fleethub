import { PrismaClient, TenantRole } from "@prisma/client";
import { writeDemoCompanyLogo } from "./seed-helpers.js";
import { seedSyntheticFleet } from "./seed-demo-synthetic.js";

/**
 * demo-b = synthetic fleet (former demo-a seed): fake drivers, trips, sync runs for UI demos.
 */
export async function seedDemoB(prisma: PrismaClient, passwordHash: string): Promise<void> {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 30);

  const tenantB = await prisma.tenant.upsert({
    where: { slug: "demo-b" },
    update: {
      name: "Fleet Demo B (synthetic)",
      commercialStatus: "TRIAL",
      trialEndsAt: trialEnd,
      settings: {
        productivity: {
          eurPerHourMin: 12,
          tripsPerHourMin: 1.5,
          acceptanceRateMin: 85,
        },
        analytics: { sectorBenchmarkOptIn: true },
        dataSource: "synthetic",
      },
    },
    create: {
      name: "Fleet Demo B (synthetic)",
      slug: "demo-b",
      commercialStatus: "TRIAL",
      trialEndsAt: trialEnd,
      settings: {
        productivity: {
          eurPerHourMin: 12,
          tripsPerHourMin: 1.5,
          acceptanceRateMin: 85,
        },
        analytics: { sectorBenchmarkOptIn: true },
        dataSource: "synthetic",
      },
      companies: {
        create: {
          legalName: "Fleet Demo B SL",
          taxId: "B00000002",
        },
      },
      users: {
        create: {
          email: "admin-demob@example.com",
          passwordHash,
          role: TenantRole.ADMIN_TENANT,
          firstName: "Admin",
          lastName: "Demo B",
          emailVerifiedAt: new Date(),
        },
      },
    },
    include: { companies: true },
  });

  const companyB =
    tenantB.companies[0] ??
    (await prisma.company.findFirstOrThrow({
      where: { tenantId: tenantB.id },
    }));

  await prisma.company.update({
    where: { id: companyB.id },
    data: {
      legalName: "Fleet Demo B SL",
      taxId: "B00000002",
      profile: {
        addressLine: "Carrer Demo 1",
        postalCode: "08001",
        city: "Barcelona",
        province: "Barcelona",
        country: "España",
        contactName: "Demo Gestor",
        phone: "+34 93 000 00 00",
        email: "contacto@demob.demo",
      },
    },
  });

  const logoUrl = await writeDemoCompanyLogo(tenantB.id, companyB.id);
  await prisma.company.update({
    where: { id: companyB.id },
    data: { logoUrl },
  });

  await seedSyntheticFleet(prisma, tenantB.id, companyB.id);

  const adminB = await prisma.user.findFirst({
    where: { tenantId: tenantB.id, email: "admin-demob@example.com" },
  });
  if (adminB) {
    await prisma.userCompany.upsert({
      where: { userId_companyId: { userId: adminB.id, companyId: companyB.id } },
      create: { userId: adminB.id, companyId: companyB.id },
      update: {},
    });
  }

  const gestorB = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenantB.id, email: "gestor-demob@example.com" } },
    update: {
      passwordHash,
      role: TenantRole.GESTOR,
      isActive: true,
      emailVerifiedAt: new Date(),
    },
    create: {
      tenantId: tenantB.id,
      email: "gestor-demob@example.com",
      passwordHash,
      role: TenantRole.GESTOR,
      firstName: "Gestor",
      lastName: "Demo B",
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.userCompany.upsert({
    where: { userId_companyId: { userId: gestorB.id, companyId: companyB.id } },
    create: { userId: gestorB.id, companyId: companyB.id },
    update: {},
  });
}
