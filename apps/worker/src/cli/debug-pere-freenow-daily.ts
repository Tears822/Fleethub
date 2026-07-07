import "../load-env.js";
import { tenantDayEndFromIso, tenantDayStartFromIso } from "@fleethub/auth/display-timezone";
import { getFreenowDriverEarnings } from "../lib/freenow-client.js";
import { extractFreenowEarningsTotals } from "../lib/freenow-earnings-mapper.js";

const company = "GIYTMMZV";
const driver = "GYZTANJXGM3TA";

for (const day of ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"]) {
  const from = tenantDayStartFromIso(day);
  const to = tenantDayEndFromIso(day);
  const res = await getFreenowDriverEarnings({ publicCompanyId: company, publicDriverId: driver, from, to });
  if (!res.ok) {
    console.log(day, "FAIL", res.message);
    continue;
  }
  const t = extractFreenowEarningsTotals(res.data);
  console.log(
    day,
    "tours",
    t.numberOfTours,
    "before",
    Number(t.totalBeforeCommissionCents) / 100,
    "commission",
    Number(t.commissionCents) / 100,
  );
}
