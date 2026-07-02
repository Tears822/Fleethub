import "../load-env.js";
import { getFreenowDriverEarnings } from "../lib/freenow-client.js";
import { extractFreenowEarningsTotals } from "../lib/freenow-earnings-mapper.js";

async function probe(label: string, from: Date, to: Date) {
  const res = await getFreenowDriverEarnings({
    publicCompanyId: "GIYTMMZV",
    publicDriverId: "GEZDQNBVHEZDC",
    from,
    to,
  });
  if (!res.ok) {
    console.log(label, "FAIL", res.message);
    return;
  }
  const t = extractFreenowEarningsTotals(res.data);
  console.log(label, {
    incentives: Number(t.incentivesCents) / 100,
    commission: Number(t.commissionCents) / 100,
    tours: t.numberOfTours,
    gross: Number(t.totalBeforeCommissionCents) / 100,
  });
}

async function main() {
  await probe("day 01/07", new Date("2026-07-01T00:00:00+02:00"), new Date("2026-07-01T23:59:59.999+02:00"));
  await probe("week 25/06-01/07", new Date("2026-06-25T00:00:00+02:00"), new Date("2026-07-01T23:59:59.999+02:00"));
  await probe("week 01/07-07/07", new Date("2026-07-01T00:00:00+02:00"), new Date("2026-07-07T23:59:59.999+02:00"));
}

main().catch(console.error);
