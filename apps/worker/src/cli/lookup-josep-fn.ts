import "../load-env.js";
import {
  freenowDriverDisplayName,
  freenowPublicDriverId,
  listAllFreenowCompanyDrivers,
} from "../lib/freenow-client.js";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";

const company = "GEYTMOBQGE";
const drivers = await listAllFreenowCompanyDrivers(company);
if (!drivers.ok) {
  console.error(drivers.message);
  process.exit(1);
}
for (const d of drivers.drivers) {
  const name = freenowDriverDisplayName(d);
  const id = freenowPublicDriverId(d);
  if (name.toUpperCase().includes("JOSEP") || name.toUpperCase().includes("GARCIA") || id === "9142OQ" || id === "GYZTANRZGAZTO") {
    console.log(id, name);
  }
}

const from = new Date("2026-06-28T00:00:00+02:00");
const to = new Date("2026-06-30T00:00:00+02:00");
const bookings = await listFreenowCompanyBookings({ publicCompanyId: company, from, to });
if (!bookings.ok) {
  console.error(bookings.message);
  process.exit(1);
}
const hit = bookings.bookings.find(
  (b) =>
    b.tourValue?.amount != null &&
    Math.round(b.tourValue.amount * 100) === 1760 &&
    b.pickupDate?.startsWith("2026-06-28T22:48"),
);
if (hit) {
  console.log("\n17.60 trip driver:", hit.driver?.id, hit.driver?.firstName, hit.driver?.lastName);
  console.log("payment:", hit.paymentMethod, "hailing:", hit.hailingType, "fixed:", (hit as { fixedFare?: boolean }).fixedFare);
}
