#!/usr/bin/env node
import { config } from "dotenv";
import { resolve } from "node:path";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { listFreenowCompanyDrivers } from "../lib/freenow-client.js";

config({ path: resolve(process.cwd(), "../../.env") });
config({ path: resolve(process.cwd(), ".env"), override: true });

const from = new Date("2026-06-01T00:00:00Z");
const to = new Date("2026-06-26T23:59:59Z");
const bookingIds = ["HAZDSMZYGEZTSMQ", "HAZDSNBRGIZTSNY"];

async function main() {
  for (const company of ["GEYTMOBQGE", "GIYTMMZV"]) {
    const b = await listFreenowCompanyBookings({ publicCompanyId: company, from, to });
    if (!b.ok) {
      console.log(company, b.message);
      continue;
    }
    const hits = b.bookings.filter((x) => bookingIds.includes(x.id));
    console.log("\n===", company, "bookings", b.bookings.length, "hits", hits.length);
    for (const h of hits) {
      console.log({
        id: h.id,
        driverId: h.driver?.id,
        driverName: h.driver?.name,
        pickup: h.pickupDate,
        state: h.state,
      });
    }

    const d = await listFreenowCompanyDrivers(company, { size: 100 });
    if (d.ok) {
      const shahid = d.page.drivers.filter((x) => (x.name ?? "").toLowerCase().includes("shahid"));
      console.log("Shahid drivers in", company + ":", shahid.length);
      for (const s of shahid) {
        console.log(" ", s.id, s.name, "numeric?", (s as { numericId?: number }).numericId);
      }
    }
  }
}

main();
