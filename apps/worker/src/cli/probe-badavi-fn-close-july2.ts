/** Probe liquidation preview path for Taoseef/Kelvin FreeNow 02/07/2026 */
import "../load-env.js";
import { previewShiftLiquidation } from "@fleethub/auth";
import { RidePlatform, withTenant } from "@fleethub/db";
import { runLiquidationDriverSync } from "../sync/run-liquidation-driver-sync.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";

async function probe(name: string) {
  const drivers = await withTenant(TENANT_ID, (tx) =>
    tx.driver.findMany({
      where: {
        tenantId: TENANT_ID,
        fullName: { contains: name, mode: "insensitive" },
      },
      select: { id: true, fullName: true, company: { select: { legalName: true } } },
    }),
  );
  if (drivers.length === 0) {
    console.log(name, "NOT FOUND");
    return;
  }
  for (const driver of drivers) {
    console.log("\n===", driver.fullName, `(${driver.company.legalName})`, "===");

    const body = {
      driverId: driver.id,
      platform: "FREENOW",
      timeFrom: "2026-07-02T00:00:00.000Z",
      timeTo: "2026-07-02T23:59:59.999Z",
    };
    console.log("skip sync (historical)?", new Date(body.timeTo) < new Date(Date.now() - 86400000));

    const t0 = Date.now();
    const sync = await runLiquidationDriverSync(TENANT_ID, driver.id, {
      platform: RidePlatform.FREENOW,
    });
    console.log("FN-only sync:", sync, "ms:", Date.now() - t0);

    const pending = await withTenant(TENANT_ID, (tx) =>
      tx.trip.count({
        where: {
          tenantId: TENANT_ID,
          driverId: driver.id,
          platform: RidePlatform.FREENOW,
          liquidationStatus: "pending",
          startedAt: { gte: new Date("2026-07-02"), lt: new Date("2026-07-03") },
        },
      }),
    );
    const unvalidated = await withTenant(TENANT_ID, (tx) =>
      tx.trip.count({
        where: {
          tenantId: TENANT_ID,
          driverId: driver.id,
          platform: RidePlatform.FREENOW,
          liquidationStatus: "pending",
          paymentValidated: false,
          startedAt: { gte: new Date("2026-07-02"), lt: new Date("2026-07-03") },
        },
      }),
    );
    console.log("pending FN trips 02/07:", pending, "unvalidated:", unvalidated);
  }
}

async function main() {
  for (const n of ["TAOSEEF", "KELVIN"]) await probe(n);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
