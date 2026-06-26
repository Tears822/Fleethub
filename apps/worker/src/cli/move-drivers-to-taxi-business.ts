/**
 * Move mis-assigned sync junk drivers from cosculluela/BADAVI → trevino/TAXI BUSINESS.
 *
 *   npm run move:taxi-business-drivers -w @fleethub/worker -- --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import { prisma, withoutTenant } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });

const DRIVER_NAMES = [
  "ABRAHAM GILBERTO CHAVEZ LIZARRAGA",
  "ANDRES FRONTIÑAN GARCIA",
  "Carlos Crespo Castillo",
  "FRANCISCO JOSE IGLESIAS",
  "GHEORGHE SORIN CRACIUN",
  "IRFAN ALI ASHRAF BEGUM",
  "JOAQUIN PALAU LOPEZ",
  "JOSE ANDRE CUBA CARRASCO",
  "MIGUEL ANGEL PASTORA VILLA",
  "MUHAMMAD RIZWAN YOUSAF",
  "NAOUFAL EL ASSASI BEN EL HASSANE",
  "NASIR MEHMOOD FAZAL AZIZ",
  "NORBERTO JOSE GOMEZ ORTEGA",
  "OSAMA BOUCHRAIT SALAH",
  "QAISAR MUNIR",
  "RAIHAN MOMIN KHALENQUE",
  "VICTOR JULIO CARVAJAL GAMBOA",
  "Younas Mughal",
  "YOUNES RIFI CHAOUI",
  "YOUSSEF DOKKALI",
  "YOUSSEF EL ASSADI",
];

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const trevino = await withoutTenant((tx) =>
    tx.tenant.findUnique({
      where: { slug: "trevino" },
      select: { id: true, name: true },
    }),
  );
  if (!trevino) throw new Error("trevino tenant missing");

  const taxiBusiness = await withoutTenant((tx) =>
    tx.company.findFirst({
      where: { tenantId: trevino.id, taxId: "B63310759" },
      select: { id: true, legalName: true },
    }),
  );
  if (!taxiBusiness) throw new Error("TAXI BUSINESS company missing on trevino");

  const drivers = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: { fullName: { in: DRIVER_NAMES } },
      select: {
        id: true,
        fullName: true,
        tenantId: true,
        isActive: true,
        company: { select: { legalName: true } },
        _count: { select: { trips: true } },
      },
    }),
  );

  console.log("=== Move drivers to TAXI BUSINESS (trevino) ===");
  console.log("Dry run:", dryRun);
  console.log("Target:", taxiBusiness.legalName);

  let moved = 0;
  for (const d of drivers) {
    if (d.tenantId === trevino.id && d.company.legalName.includes("TAXI BUSINESS")) {
      console.log("SKIP already on target:", d.fullName);
      continue;
    }
    console.log(
      `MOVE ${d.isActive ? "active" : "inactive"} | ${d._count.trips} trips | ${d.company.legalName} → TAXI BUSINESS | ${d.fullName}`,
    );
    if (!dryRun) {
      await prisma.$transaction(async (tx) => {
        await tx.driver.update({
          where: { id: d.id },
          data: {
            tenantId: trevino.id,
            companyId: taxiBusiness.id,
            isActive: false,
          },
        });
        await tx.driverPlatformAccount.updateMany({
          where: { driverId: d.id },
          data: { tenantId: trevino.id },
        });
      });
    }
    moved += 1;
  }

  const notFound = DRIVER_NAMES.filter(
    (n) => !drivers.some((d) => d.fullName === n),
  );
  if (notFound.length) console.log("Not found:", notFound);

  console.log("Moved:", moved);
  if (dryRun) console.log("(dry-run — no writes)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
