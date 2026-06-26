/**
 * Smoke test: pending shift trip detail loads by driverId (no huge tripIds URL).
 *   npx tsx scripts/test-shift-detail-api.ts
 */
import { listShiftTripsForDetail } from "@fleethub/auth";
import { withoutTenant } from "@fleethub/db";

const API = (process.env.FLEETHUB_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");

async function main() {
  const tenant = await withoutTenant((tx) =>
    tx.tenant.findFirst({
      where: { slug: { in: ["cosculluela", "demo-a"] } },
      orderBy: { slug: "asc" },
      select: { id: true, slug: true },
    }),
  );
  if (!tenant) throw new Error("No tenant cosculluela/demo-a");

  const admin = await withoutTenant((tx) =>
    tx.user.findFirst({
      where: { tenantId: tenant.id, role: "ADMIN_TENANT", isActive: true },
      select: { id: true, email: true, role: true },
    }),
  );
  if (!admin) throw new Error(`No admin for ${tenant.slug}`);

  console.log(`Tenant: ${tenant.slug}, admin: ${admin.email}`);

  const session = {
    kind: "tenant" as const,
    tid: tenant.id,
    uid: admin.id,
    role: admin.role,
    email: admin.email,
  };

  const pendingByDriver = await withoutTenant(async (tx) => {
    const rows = await tx.trip.groupBy({
      by: ["driverId", "platform"],
      where: { tenantId: tenant.id, liquidationStatus: "pending" },
      _count: { id: true },
    });
    return rows.sort((a, b) => b._count.id - a._count.id);
  });

  if (pendingByDriver.length === 0) {
    console.log("No pending trips — nothing to test.");
    return;
  }

  const top = pendingByDriver[0]!;
  const driver = await withoutTenant((tx) =>
    tx.driver.findUnique({
      where: { id: top.driverId },
      select: { fullName: true },
    }),
  );
  console.log(
    `Top driver: ${driver?.fullName ?? top.driverId} — ${top._count.id} pending ${top.platform} trips`,
  );

  const allIds = await withoutTenant((tx) =>
    tx.trip.findMany({
      where: {
        tenantId: tenant.id,
        driverId: top.driverId,
        platform: top.platform,
        liquidationStatus: "pending",
      },
      select: { id: true },
    }),
  );

  const params = new URLSearchParams({
    status: "pending",
    driverId: top.driverId,
    platform: top.platform,
  });
  const url = `${API}/api/tenant/shifts/trips?${params}`;
  console.log(`Query URL length: ${url.length} chars (driverId only, ${allIds.length} trips)`);

  const result = await listShiftTripsForDetail(session, {
    driverId: top.driverId,
    liquidationStatus: "pending",
    platform: top.platform,
  });
  if (!result.ok) {
    console.error("FAIL listShiftTripsForDetail", result.error.message);
    process.exit(1);
  }

  const data = result.value;
  const n = data.trips?.length ?? 0;
  if (n === 0) {
    console.error("FAIL: empty trips array");
    process.exit(1);
  }

  console.log(`OK: ${n} trips loaded via listShiftTripsForDetail`);
  console.log(
    `Activity: ${data.activity?.viajesRealizados ?? "?"} viajes, ${data.activity?.horasConectado ?? "?"} conectado`,
  );

  const oldParams = new URLSearchParams({
    status: "pending",
    driverId: top.driverId,
    tripIds: allIds.map((t) => t.id).join(","),
  });
  const oldLen = `${API}/api/tenant/shifts/trips?${oldParams}`.length;
  console.log(`Legacy URL would be ${oldLen} chars with ${allIds.length} tripIds in query`);

  if (url.length < oldLen / 2) {
    console.log("OK: new query is much shorter than legacy tripIds URL");
  }

  // Named drivers from user report
  for (const needle of ["Rachid", "Alfredo"]) {
    const named = await withoutTenant((tx) =>
      tx.driver.findMany({
        where: {
          tenantId: tenant.id,
          fullName: { contains: needle, mode: "insensitive" },
        },
        select: { id: true, fullName: true },
      }),
    );
    for (const d of named) {
      const r = await listShiftTripsForDetail(session, {
        driverId: d.id,
        liquidationStatus: "pending",
        platform: "UBER",
      });
      const count = r.ok ? r.value.trips.length : 0;
      const act = r.ok ? r.value.activity?.horasConectado : "?";
      console.log(`${d.fullName}: ${count} Uber trips, horas ${act ?? "?"}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
