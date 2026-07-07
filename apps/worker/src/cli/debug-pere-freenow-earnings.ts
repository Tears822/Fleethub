import "../load-env.js";
import { getFreenowDriverEarnings } from "../lib/freenow-client.js";
import { extractFreenowEarningsTotals } from "../lib/freenow-earnings-mapper.js";

const from = new Date("2026-07-01T00:00:00+02:00");
const to = new Date("2026-07-05T23:59:59.999+02:00");
const res = await getFreenowDriverEarnings({
  publicCompanyId: "GIYTMMZV",
  publicDriverId: "GYZTANJXGM3TA",
  from,
  to,
});
if (!res.ok) {
  console.error(res);
  process.exit(1);
}
console.log(JSON.stringify(res.data.grossValues, null, 2));
console.log("extracted", extractFreenowEarningsTotals(res.data));
