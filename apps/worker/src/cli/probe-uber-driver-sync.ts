#!/usr/bin/env node
/** Probe syncUberTripsViaReports for one BADAVI driver. */
import "../load-env.js";
import { syncUberTripsViaReports } from "../lib/uber-reports.js";

const TENANT_ID = "442462fa-ee23-4009-bb5f-919032762333";
const DRIVER = process.argv[2] ?? "c12b9f5b-f953-4977-a898-8d800d79e602"; // Eduard
const days = Number(process.argv[3] ?? 7) || 7;

async function main() {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const res = await syncUberTripsViaReports({
    tenantId: TENANT_ID,
    driverId: DRIVER,
    from,
    to,
  });
  if (!res.ok) {
    console.error(res.message);
    process.exit(1);
  }
  console.log("Trips returned:", res.data.length);
  console.log("Sample:", res.data.slice(0, 3).map((t) => ({
    id: t.externalTripId.slice(0, 8),
    startedAt: t.startedAt,
    gross: String(t.grossAmountCents),
  })));
}

main();
