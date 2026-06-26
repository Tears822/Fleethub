/**
 * One Uber external_driver_id must be active in only one group tenant.
 * When cosculluela holds the BADAVI spreadsheet link, deactivate trade-taxi clones.
 *
 * Usage:
 *   npm run fix:group-uber-dedup -w @fleethub/worker -- --dry-run
 */
import path from "node:path";
import { config } from "dotenv";
import { normalizeTaxId } from "@fleethub/auth/group-tenant-company-map";
import { prisma, RidePlatform } from "@fleethub/db";

config({ path: path.resolve(process.cwd(), "../../.env") });

const BADAVI_TAX_ID = normalizeTaxId("B60508603");

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cosculluela = await prisma.tenant.findUnique({
    where: { slug: "cosculluela" },
    select: { id: true },
  });
  const tradeTaxi = await prisma.tenant.findUnique({
    where: { slug: "trade-taxi-sl" },
    select: { id: true },
  });
  if (!cosculluela || !tradeTaxi) throw new Error("Missing tenants");

  const cosDpas = await prisma.driverPlatformAccount.findMany({
    where: {
      tenantId: cosculluela.id,
      platform: RidePlatform.UBER,
      isActive: true,
      driver: { company: { taxId: BADAVI_TAX_ID } },
    },
    select: {
      externalDriverId: true,
      driverId: true,
      driver: { select: { fullName: true } },
    },
  });

  console.log(dryRun ? "=== DRY RUN fix group uber dedup ===" : "=== Fix group uber dedup ===");
  let deactivated = 0;
  let deletedPending = 0;

  for (const cos of cosDpas) {
    const ext = cos.externalDriverId.trim().toLowerCase();
    const tradeDpa = await prisma.driverPlatformAccount.findFirst({
      where: {
        tenantId: tradeTaxi.id,
        platform: RidePlatform.UBER,
        isActive: true,
        externalDriverId: { equals: cos.externalDriverId, mode: "insensitive" },
      },
      select: { id: true, driverId: true },
    });
    if (!tradeDpa) continue;

    const tradeDriver = await prisma.driver.findUnique({
      where: { id: tradeDpa.driverId },
      select: { fullName: true },
    });
    const pending = await prisma.trip.count({
      where: {
        tenantId: tradeTaxi.id,
        driverId: tradeDpa.driverId,
        liquidationStatus: "pending",
      },
    });
    console.log(
      `  trade-taxi-sl: deactivate ${tradeDriver?.fullName} (${ext.slice(0, 8)}…) — canonical BADAVI in cosculluela, pending ${pending}`,
    );

    if (dryRun) {
      deactivated += 1;
      deletedPending += pending;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const del = await tx.trip.deleteMany({
        where: {
          tenantId: tradeTaxi.id,
          driverId: tradeDpa.driverId,
          liquidationStatus: "pending",
        },
      });
      deletedPending += del.count;
      await tx.driverPlatformAccount.update({
        where: { id: tradeDpa.id },
        data: { isActive: false },
      });
      await tx.driver.update({
        where: { id: tradeDpa.driverId },
        data: { isActive: false },
      });
    });
    deactivated += 1;
  }

  console.log(
    `\nDone: trade-taxi uber deactivated=${deactivated}, pending trips deleted=${deletedPending}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
