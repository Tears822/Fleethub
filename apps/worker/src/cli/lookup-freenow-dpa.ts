#!/usr/bin/env node
import { config } from "dotenv";
import { resolve } from "node:path";
import { RidePlatform, withoutTenant } from "@fleethub/db";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const FN_PUBLIC = process.argv[2]?.trim() ?? "GYYTSMBWG4ZDG";

async function main() {
  const rows = await withoutTenant((tx) =>
    tx.driverPlatformAccount.findMany({
      where: { platform: RidePlatform.FREENOW, externalDriverId: FN_PUBLIC },
      include: {
        driver: { select: { id: true, fullName: true, isActive: true } },
        tenant: { select: { slug: true } },
      },
    }),
  );
  console.log("DPA rows for", FN_PUBLIC + ":", rows.length);
  for (const r of rows) {
    console.log({
      dpaId: r.id,
      tenant: r.tenant.slug,
      driverId: r.driver.id,
      driverName: r.driver.fullName,
      isActive: r.isActive,
      driverActive: r.driver.isActive,
      metadata: r.metadata,
    });
  }
}

main();
