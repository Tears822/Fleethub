/**
 * Align trade-taxi-sl Uber drivers with Tradetaxi portal list (client screenshots).
 * Usage: npx tsx src/cli/fix-tradetaxi-uber-portal.ts [--dry-run]
 */
import path from "node:path";
import { config } from "dotenv";
import { PrismaClient, RidePlatform } from "@prisma/client";
import {
  listAllUberDrivers,
  resolveUberOrgForTenantSlug,
  uberDriverDisplayName,
  uberDriverExternalId,
} from "../lib/uber-fleet-client.js";

config({ path: path.resolve(process.cwd(), "../../.env") });
config({ path: path.resolve(process.cwd(), ".env"), override: true });
config({ path: path.resolve(process.cwd(), "../../packages/db/.env"), override: true });

const prisma = new PrismaClient();
const TRADE_TAXI_CIF = "B63558043";
const TENANT_SLUG = "trade-taxi-sl";

/** Wrong Uber rows (BADAVI overlap — not in Tradetaxi Uber portal). */
const WRONG_UBER_UUIDS = [
  "c12b9f5b-f953-4977-a898-8d800d79e602",
  "4547eb07-70f6-4fae-80ea-f953960b0ca9",
  "341e8f04-32fe-4349-a8de-5d8a49d55fea",
  "4ab7a8fb-2855-4e4b-9389-b5066ea84e44",
  "16fddace-7c56-4268-9533-0b78602bac07",
  "538b60a6-d4d1-4df7-9c20-6dacd9bb6956",
  "4b09d22c-9624-4f36-a46c-7bc4226868fb",
  "81d4541c-7fa2-46e0-ae1b-6c95f75639a3",
  "b34df57a-e76d-47f1-8305-408d0ecd08bb",
];

type PortalDriver = {
  fullName: string;
  dni: string | null;
  email: string | null;
  phone: string | null;
  uberPending: boolean;
  aliases: string[];
};

const PORTAL_DRIVERS: PortalDriver[] = [
  {
    fullName: "EDWAR HOME CHAVARRO",
    dni: null,
    email: "homechavarro24@gmail.com",
    phone: "+34603401090",
    uberPending: false,
    aliases: [],
  },
  {
    fullName: "FIDELIA COPAJIRA NAMANI",
    dni: null,
    email: "fide1977copajira@gmail.com",
    phone: "+34631316572",
    uberPending: false,
    aliases: ["Fidelia Copajira Mamani"],
  },
  {
    fullName: "MUSHTAQ AHMED",
    dni: "Y5265492R",
    email: "ahmedchoudhry510@gmail.com",
    phone: "+34631801479",
    uberPending: false,
    aliases: ["Mushtaq Ahmed"],
  },
  {
    fullName: "Jordi Martínez Dosdad",
    dni: "46963221G",
    email: "jordidosdad@hotmail.com",
    phone: "+34618051190",
    uberPending: false,
    aliases: ["Jordi Martínez dosdad"],
  },
  {
    fullName: "GERARDO GAGO PEDREROL",
    dni: null,
    email: "gerardogagopedrerol@gmail.com",
    phone: "+34653774367",
    uberPending: false,
    aliases: ["Gerardo Gago Pedrerol"],
  },
  {
    fullName: "Miguel Angel Buenaventura Micharet",
    dni: null,
    email: "micharet361975@gmail.com",
    phone: "+34672477246",
    uberPending: false,
    aliases: [],
  },
  {
    fullName: "Armando Perez Toquica",
    dni: null,
    email: "arpeto49@yahoo.es",
    phone: "+34639022624",
    uberPending: false,
    aliases: [],
  },
  {
    fullName: "Daniel Lucas Fuentes",
    dni: null,
    email: "corto_lucas@hotmail.com",
    phone: "+34639019060",
    uberPending: false,
    aliases: [],
  },
  {
    fullName: "FRANCISCO JAVIER CARDENAS VALVERDE",
    dni: null,
    email: "cardenasvalverdefj@gmail.com",
    phone: "+34693539701",
    uberPending: false,
    aliases: ["Francisco Javier Cardenas Valverde"],
  },
  {
    fullName: "Carlos Mario Varela Sossa",
    dni: null,
    email: "carlosmariovarelasossa@gmail.com",
    phone: "+34667827169",
    uberPending: true,
    aliases: [],
  },
];

function normalizeName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameTokens(value: string): Set<string> {
  return new Set(
    normalizeName(value)
      .split(" ")
      .filter((t) => t.length > 1),
  );
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const need = Math.min(ta.size, tb.size) - 1;
  return shared >= Math.max(2, need);
}

function matchesPortal(driverName: string, portal: PortalDriver): boolean {
  if (namesMatch(driverName, portal.fullName)) return true;
  return portal.aliases.some((a) => namesMatch(driverName, a));
}


async function fetchUberOrgDrivers(): Promise<
  Array<{ uuid: string; name: string; email?: string }>
> {
  const org = await resolveUberOrgForTenantSlug(TENANT_SLUG);
  if (!org.ok) return [];
  const api = await listAllUberDrivers(org.data.orgId);
  if (!api.ok) return [];
  return api.data
    .map((d) => ({
      uuid: uberDriverExternalId(d) ?? "",
      name: uberDriverDisplayName(d),
      email: typeof d.email === "string" ? d.email : undefined,
    }))
    .filter((d) => d.uuid);
}

function matchUberUuid(
  portal: PortalDriver,
  uberDrivers: Array<{ uuid: string; name: string; email?: string }>,
): string | null {
  for (const u of uberDrivers) {
    if (portal.email && u.email && portal.email.toLowerCase() === u.email.toLowerCase()) {
      return u.uuid;
    }
    if (namesMatch(portal.fullName, u.name)) return u.uuid;
    for (const a of portal.aliases) {
      if (namesMatch(a, u.name)) return u.uuid;
    }
  }
  return null;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  console.log(dryRun ? "=== DRY RUN fix tradetaxi uber portal ===" : "=== Fix tradetaxi uber portal ===");

  const tenant = await prisma.tenant.findUnique({
    where: { slug: TENANT_SLUG },
    select: { id: true },
  });
  if (!tenant) throw new Error("Tenant trade-taxi-sl not found");

  const company = await prisma.company.findFirst({
    where: { tenantId: tenant.id, taxId: TRADE_TAXI_CIF, isActive: true },
    select: { id: true, legalName: true },
  });
  if (!company) throw new Error("TRADE TAXI company not found");

  const tenantDrivers = await prisma.driver.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      fullName: true,
      email: true,
      phone: true,
      dni: true,
      isActive: true,
      driverPlatformAccounts: {
        where: { platform: { in: [RidePlatform.UBER, RidePlatform.FREENOW] } },
        select: { id: true, platform: true, isActive: true, externalDriverId: true },
      },
    },
  });

  let deactivatedWrong = 0;
  let deletedPending = 0;

  for (const ext of WRONG_UBER_UUIDS) {
    const dpa = await prisma.driverPlatformAccount.findFirst({
      where: {
        tenantId: tenant.id,
        platform: RidePlatform.UBER,
        externalDriverId: { equals: ext, mode: "insensitive" },
        isActive: true,
      },
      select: { id: true, driverId: true, driver: { select: { fullName: true } } },
    });
    if (!dpa) continue;
    const pending = await prisma.trip.count({
      where: { tenantId: tenant.id, driverId: dpa.driverId, liquidationStatus: "pending" },
    });
    console.log(`  deactivate wrong uber: ${dpa.driver.fullName} (${ext.slice(0, 8)}…) pending=${pending}`);
    if (dryRun) {
      deactivatedWrong += 1;
      deletedPending += pending;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      await tx.trip.deleteMany({
        where: { tenantId: tenant.id, driverId: dpa.driverId, liquidationStatus: "pending" },
      });
      await tx.driverPlatformAccount.update({ where: { id: dpa.id }, data: { isActive: false } });
      const otherActive = await tx.driverPlatformAccount.count({
        where: { driverId: dpa.driverId, isActive: true },
      });
      if (otherActive === 0) {
        await tx.driver.update({ where: { id: dpa.driverId }, data: { isActive: false } });
      }
    });
    deactivatedWrong += 1;
    deletedPending += pending;
  }

  const uberOrgDrivers = dryRun ? [] : await fetchUberOrgDrivers();
  if (uberOrgDrivers.length > 0) {
    console.log(`\nUber org drivers fetched: ${uberOrgDrivers.length}`);
  } else {
    console.log("\nUber API: skipped (no credentials or fetch failed) — UUID link pending prod sync");
  }

  let created = 0;
  let updated = 0;
  let uberLinked = 0;
  let uberSkippedPending = 0;

  for (const portal of PORTAL_DRIVERS) {
    let driver = tenantDrivers.find((d) => matchesPortal(d.fullName, portal));
    const uberUuid = matchUberUuid(portal, uberOrgDrivers);

    if (!driver) {
      console.log(`  create: ${portal.fullName}${uberUuid ? ` uber=${uberUuid.slice(0, 8)}…` : ""}`);
      if (dryRun) {
        created += 1;
        if (uberUuid) uberLinked += 1;
        if (portal.uberPending) uberSkippedPending += 1;
        continue;
      }
      driver = await prisma.driver.create({
        data: {
          tenantId: tenant.id,
          companyId: company.id,
          fullName: portal.fullName,
          dni: portal.dni,
          email: portal.email,
          phone: portal.phone,
          isActive: true,
          driverSharePct: 40,
          driverBonusSharePct: 50,
          driverPlatformFeeSharePct: 0,
          dailyFixedCents: BigInt(0),
        },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          dni: true,
          isActive: true,
          driverPlatformAccounts: {
            where: { platform: { in: [RidePlatform.UBER, RidePlatform.FREENOW] } },
            select: { id: true, platform: true, isActive: true, externalDriverId: true },
          },
        },
      });
      tenantDrivers.push(driver);
      created += 1;
    } else {
      console.log(`  update: ${driver.fullName} → ${portal.fullName}${uberUuid ? ` uber=${uberUuid.slice(0, 8)}…` : ""}`);
      if (!dryRun) {
        await prisma.driver.update({
          where: { id: driver.id },
          data: {
            fullName: portal.fullName,
            companyId: company.id,
            dni: portal.dni ?? driver.dni,
            email: portal.email ?? driver.email,
            phone: portal.phone ?? driver.phone,
            isActive: true,
          },
        });
      }
      updated += 1;
    }

    if (portal.uberPending && uberUuid) {
      console.log(`    (Uber activation pending in portal — linking UUID anyway)`);
    }

    if (!uberUuid) continue;

    const existingUber = driver!.driverPlatformAccounts.find((a) => a.platform === RidePlatform.UBER);
    if (existingUber?.isActive && existingUber.externalDriverId.toLowerCase() === uberUuid.toLowerCase()) {
      continue;
    }

    if (dryRun) {
      uberLinked += 1;
      continue;
    }

    if (existingUber) {
      await prisma.driverPlatformAccount.update({
        where: { id: existingUber.id },
        data: {
          externalDriverId: uberUuid,
          isActive: true,
          metadata: {
            source: "portal_fix",
            linkedAt: new Date().toISOString(),
          },
        },
      });
    } else {
      await prisma.driverPlatformAccount.create({
        data: {
          tenantId: tenant.id,
          driverId: driver!.id,
          platform: RidePlatform.UBER,
          externalDriverId: uberUuid,
          isActive: true,
          metadata: { source: "portal_fix", linkedAt: new Date().toISOString() },
        },
      });
    }
    uberLinked += 1;
  }

  console.log(
    `\nDone: wrong uber deactivated=${deactivatedWrong}, pending trips deleted=${deletedPending}, ` +
      `drivers created=${created}, updated=${updated}, uber linked=${uberLinked}, uber pending=${uberSkippedPending}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
