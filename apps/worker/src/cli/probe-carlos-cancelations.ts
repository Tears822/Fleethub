import "../load-env.js";
import { withoutTenant } from "@fleethub/db";
import {
  freenowDriverDisplayName,
  freenowPublicDriverId,
  listAllFreenowCompanyDrivers,
} from "../lib/freenow-client.js";
import { listFreenowCompanyBookings } from "../lib/freenow-bookings.js";
import { freenowBookingToUpsert } from "../lib/freenow-booking-mapper.js";
import { extractFreenowEarningsTotals } from "../lib/freenow-earnings-mapper.js";
import { getFreenowDriverEarnings } from "../lib/freenow-client.js";

const COMPANIES = ["GEYTMOBQGE", "GIYTMMZV", "GI2TGOJS", "GEYDMNJUG4"];

console.log("=== FleetHub DB: Carlos Martinez ===");
for (const slug of ["cosculluela", "trevino", "trade-taxi-sl"]) {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({ where: { slug }, select: { id: true, slug: true } }),
  );
  if (!tenant) continue;
  const drivers = await withoutTenant((tx) =>
    tx.driver.findMany({
      where: {
        tenantId: tenant.id,
        OR: [
          { fullName: { contains: "Bertran", mode: "insensitive" } },
          {
            AND: [
              { fullName: { contains: "Carlos", mode: "insensitive" } },
              { fullName: { contains: "Martinez", mode: "insensitive" } },
            ],
          },
        ],
      },
      select: {
        id: true,
        fullName: true,
        driverPlatformAccounts: {
          where: { platform: "FREENOW", isActive: true },
          select: { externalDriverId: true },
        },
      },
    }),
  );
  for (const d of drivers) {
    const fnId = d.driverPlatformAccounts[0]?.externalDriverId;
    console.log(tenant.slug, d.fullName, "driverId:", d.id, "fn:", fnId);
    if (!fnId) continue;
    const trips = await withoutTenant((tx) =>
      tx.trip.findMany({
        where: {
          tenantId: tenant.id,
          driverId: d.id,
          platform: "FREENOW",
          startedAt: {
            gte: new Date("2026-06-27T22:00:00.000Z"),
            lt: new Date("2026-06-29T22:00:00.000Z"),
          },
        },
        orderBy: { startedAt: "asc" },
        select: {
          externalTripId: true,
          startedAt: true,
          grossAmountCents: true,
          netAmountCents: true,
          paymentMethod: true,
          fareType: true,
        },
      }),
    );
    console.log("  trips 28/06 window:", trips.length);
    for (const t of trips) {
      console.log(
        "   ",
        t.startedAt.toISOString().slice(0, 16),
        Number(t.grossAmountCents ?? 0n) / 100,
        t.paymentMethod,
        t.fareType,
        t.externalTripId.slice(0, 12),
      );
    }
  }
}

console.log("\n=== FreeNow API drivers matching Carlos ===");
const fnDrivers: Array<{ company: string; id: string; name: string }> = [];
for (const company of COMPANIES) {
  const res = await listAllFreenowCompanyDrivers(company);
  if (!res.ok) continue;
  for (const d of res.drivers) {
    const name = freenowDriverDisplayName(d);
    if (/carlos/i.test(name) && /martinez|bertran/i.test(name)) {
      const id = freenowPublicDriverId(d);
      fnDrivers.push({ company, id, name });
      console.log(company, id, name);
    }
  }
}

const from = new Date("2026-06-27T00:00:00+02:00");
const to = new Date("2026-06-29T00:00:00+02:00");

console.log("\n=== FreeNow bookings 27-28 Jun (Carlos / 5€ / CANCELED) ===");
for (const company of COMPANIES) {
  const bookings = await listFreenowCompanyBookings({ publicCompanyId: company, from, to });
  if (!bookings.ok) {
    console.log(company, "FAIL", bookings.message);
    continue;
  }
  const states: Record<string, number> = {};
  for (const b of bookings.bookings) states[b.state ?? "?"] = (states[b.state ?? "?"] ?? 0) + 1;

  for (const b of bookings.bookings) {
    const name = (b.driver?.name ?? `${b.driver?.firstName ?? ""} ${b.driver?.lastName ?? ""}`).trim();
    const isCarlos = /carlos/i.test(name) && /martinez|bertran/i.test(name);
    const isFive = b.tourValue?.amount === 5 || b.tourValue?.amount === 5.0;
    const isCanceled = b.state === "CANCELED";
    if (!isCarlos && !isFive && !isCanceled) continue;
    if (!isCarlos && isCanceled) continue;

    const mapped = freenowBookingToUpsert(b);
    console.log("\n", company, b.id, b.state, b.pickupDate);
    console.log("  driver:", name, b.driver?.id);
    console.log("  payment:", b.paymentMethod, "hailing:", b.hailingType, "subFleet:", b.subFleetTypeLabel);
    console.log("  tourValue:", JSON.stringify(b.tourValue));
    console.log("  mapper imports?", mapped ? `yes net=${mapped.netAmountCents}` : "NO (ignored)");
    const extra = b as Record<string, unknown>;
    for (const k of Object.keys(extra)) {
      if (/cancel|reason|problem|pickup/i.test(k)) console.log(" ", k, extra[k]);
    }
  }
}

if (fnDrivers[0]) {
  const { company, id } = fnDrivers[0];
  const dayFrom = new Date("2026-06-28T00:00:00+02:00");
  const dayTo = new Date("2026-06-28T23:59:59.999+02:00");
  const earnings = await getFreenowDriverEarnings({
    publicCompanyId: company,
    publicDriverId: id,
    from: dayFrom,
    to: dayTo,
  });
  console.log("\n=== Driver earnings 28/06 ===", id);
  if (earnings.ok) {
    const t = extractFreenowEarningsTotals(earnings.data);
    console.log({
      incentives: Number(t.incentivesCents) / 100,
      commission: Number(t.commissionCents) / 100,
      cancellations: (earnings.data.grossValues as { cancellations?: number })?.cancellations,
      gross: Number(t.totalBeforeCommissionCents) / 100,
      tours: t.numberOfTours,
    });
  } else {
    console.log("FAIL", earnings.message);
  }
}

const tradeTenant = await withoutTenant((tx) =>
  tx.tenant.findFirst({ where: { slug: "trade-taxi-sl" }, select: { id: true } }),
);
const carlosDb = await withoutTenant((tx) =>
  tx.driver.findFirst({
    where: {
      tenantId: tradeTenant!.id,
      fullName: { contains: "Carlos Martinez", mode: "insensitive" },
    },
    select: {
      id: true,
      fullName: true,
      driverPlatformAccounts: {
        select: { platform: true, externalDriverId: true, isActive: true },
      },
    },
  }),
);
console.log("\n=== Carlos in FleetHub (trade-taxi-sl) ===");
console.log(carlosDb?.fullName, carlosDb?.id);
console.log("DPAs:", carlosDb?.driverPlatformAccounts);

if (carlosDb && tradeTenant) {
  const trips = await withoutTenant((tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tradeTenant.id,
        driverId: carlosDb.id,
        platform: "FREENOW",
        startedAt: {
          gte: new Date("2026-06-27T22:00:00.000Z"),
          lt: new Date("2026-06-29T22:00:00.000Z"),
        },
      },
      orderBy: { startedAt: "asc" },
      select: { startedAt: true, grossAmountCents: true, externalTripId: true, fareType: true },
    }),
  );
  console.log("Trips in DB (28 Jun window):", trips.length);
  for (const t of trips) {
    console.log(
      " ",
      t.startedAt.toISOString(),
      Number(t.grossAmountCents ?? 0n) / 100,
      t.fareType,
    );
  }
  const totalFn = await withoutTenant((tx) =>
    tx.trip.count({
      where: {
        tenantId: tradeTenant.id,
        driverId: carlosDb.id,
        platform: "FREENOW",
      },
    }),
  );
  const pendingFn = await withoutTenant((tx) =>
    tx.trip.count({
      where: {
        tenantId: tradeTenant.id,
        driverId: carlosDb.id,
        platform: "FREENOW",
        liquidationStatus: "pending",
      },
    }),
  );
  console.log("Total FN trips:", totalFn, "| pending:", pendingFn);
}

const allBookings = await listFreenowCompanyBookings({
  publicCompanyId: "GEYDMNJUG4",
  from: new Date("2026-06-27T00:00:00+02:00"),
  to: new Date("2026-06-29T00:00:00+02:00"),
});
if (allBookings.ok) {
  const canceled = allBookings.bookings.filter((b) => b.state === "CANCELED");
  console.log("\n=== All CANCELED bookings GEYDMNJUG4 ===", canceled.length);
  for (const b of canceled) {
    console.log(
      b.pickupDate,
      b.driver?.name,
      b.tourValue?.amount,
      "mapped?",
      !!freenowBookingToUpsert(b),
    );
  }
}
