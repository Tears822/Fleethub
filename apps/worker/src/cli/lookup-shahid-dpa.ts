#!/usr/bin/env node
import { config } from "dotenv";
import { resolve } from "node:path";
import { RidePlatform, withoutTenant } from "@fleethub/db";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const DRIVER_ID = "5c141e50-4fb2-4768-a9a1-47d7b802f91c";

async function main() {
  const all = await withoutTenant((tx) =>
    tx.driverPlatformAccount.findMany({
      where: { driverId: DRIVER_ID },
      include: { tenant: { select: { slug: true } } },
    }),
  );
  console.log("All DPAs for driver:", all.length);
  for (const r of all) console.log(r.platform, r.externalDriverId, r.isActive, r.tenant.slug, r.id);

  const fn = await withoutTenant((tx) =>
    tx.driverPlatformAccount.findMany({
      where: {
        tenant: { slug: "cosculluela" },
        platform: RidePlatform.FREENOW,
        externalDriverId: { contains: "GYYT" },
      },
      include: { driver: { select: { fullName: true, id: true } } },
    }),
  );
  console.log("\nCosculluela FN GYYT* accounts:", fn.length);
  for (const r of fn) console.log(r.externalDriverId, r.driver.fullName, r.driver.id, r.isActive);
}

main();
