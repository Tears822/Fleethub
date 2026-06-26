import {
  PrismaClient,
  RidePlatform,
  type Driver,
  type DriverPlatformAccount,
} from "@prisma/client";
import {
  atHour,
  atUtcHour,
  localDayStart,
  netFromIndex,
  paymentFromIndex,
  type SeedTripInput,
  upsertSeedTrip,
  utcDayStart,
} from "./seed-helpers.js";
import { seedDriverPlatformDayMetrics } from "./seed-driver-day-metrics.js";

type DriverSeed = {
  fullName: string;
  dni: string;
  phone: string;
  email: string;
  licenseNumber: string;
  vehiclePlate: string;
  vehicleModel: string;
  driverSharePct: number;
  platforms: RidePlatform[];
  isActive: boolean;
};

const DRIVER_SEEDS: DriverSeed[] = [
  {
    fullName: "Carlos García López",
    dni: "12345678A",
    phone: "+34 600 111 001",
    email: "carlos.garcia@demob.demo",
    licenseNumber: "1234-MNF",
    vehiclePlate: "1234-MNF",
    vehicleModel: "Toyota Prius",
    driverSharePct: 40,
    platforms: [RidePlatform.UBER, RidePlatform.FREENOW],
    isActive: true,
  },
  {
    fullName: "María Sánchez Ruiz",
    dni: "23456789B",
    phone: "+34 600 111 002",
    email: "maria.sanchez@demob.demo",
    licenseNumber: "2211-KLC",
    vehiclePlate: "2211-KLC",
    vehicleModel: "Toyota Corolla",
    driverSharePct: 40,
    platforms: [RidePlatform.UBER, RidePlatform.FREENOW],
    isActive: true,
  },
  {
    fullName: "Ana López Vega",
    dni: "34567890C",
    phone: "+34 600 111 003",
    email: "ana.lopez@demob.demo",
    licenseNumber: "8890-BBR",
    vehiclePlate: "8890-BBR",
    vehicleModel: "Hyundai Ioniq",
    driverSharePct: 42,
    platforms: [RidePlatform.UBER],
    isActive: true,
  },
  {
    fullName: "Eloi Martínez",
    dni: "45678901D",
    phone: "+34 600 111 004",
    email: "eloi.martinez@demob.demo",
    licenseNumber: "4455-XXZ",
    vehiclePlate: "4455-XXZ",
    vehicleModel: "Skoda Octavia",
    driverSharePct: 38,
    platforms: [RidePlatform.FREENOW],
    isActive: false,
  },
  {
    fullName: "Pau Ribas Soler",
    dni: "56789012E",
    phone: "+34 600 111 005",
    email: "pau.ribas@demob.demo",
    licenseNumber: "7788-GHT",
    vehiclePlate: "7788-GHT",
    vehicleModel: "Volkswagen ID.4",
    driverSharePct: 40,
    platforms: [RidePlatform.BOLT, RidePlatform.CABIFY],
    isActive: true,
  },
];

type VehicleHistoryEntry = {
  vehiclePlate: string;
  vehicleModel: string | null;
  assignedAt: Date;
  unassignedAt: Date | null;
  note?: string;
};

async function seedDriverVehicleHistory(
  prisma: PrismaClient,
  tenantId: string,
  driver: Driver,
  seed: DriverSeed,
): Promise<void> {
  const entries: VehicleHistoryEntry[] =
    seed.fullName === "Carlos García López"
      ? [
          {
            vehiclePlate: "5678-ABC",
            vehicleModel: "Seat León",
            assignedAt: new Date("2025-06-01T08:00:00"),
            unassignedAt: new Date("2026-03-15T18:00:00"),
            note: "Vehículo anterior",
          },
          {
            vehiclePlate: seed.vehiclePlate,
            vehicleModel: seed.vehicleModel,
            assignedAt: new Date("2026-03-15T18:00:00"),
            unassignedAt: null,
          },
        ]
      : seed.vehiclePlate
        ? [
            {
              vehiclePlate: seed.vehiclePlate,
              vehicleModel: seed.vehicleModel,
              assignedAt: driver.createdAt,
              unassignedAt: null,
            },
          ]
        : [];

  await prisma.driverVehicleAssignment.deleteMany({
    where: { tenantId, driverId: driver.id },
  });

  for (const entry of entries) {
    await prisma.driverVehicleAssignment.create({
      data: {
        tenantId,
        driverId: driver.id,
        vehiclePlate: entry.vehiclePlate,
        vehicleModel: entry.vehicleModel,
        assignedAt: entry.assignedAt,
        unassignedAt: entry.unassignedAt,
        note: entry.note ?? null,
      },
    });
  }
}

async function ensureDriver(
  prisma: PrismaClient,
  tenantId: string,
  companyId: string,
  seed: DriverSeed,
): Promise<Driver> {
  const existing = await prisma.driver.findFirst({
    where: { tenantId, fullName: seed.fullName },
  });
  if (existing) {
    return prisma.driver.update({
      where: { id: existing.id },
      data: {
        dni: seed.dni,
        phone: seed.phone,
        email: seed.email,
        licenseNumber: seed.licenseNumber,
        vehiclePlate: seed.vehiclePlate,
        vehicleModel: seed.vehicleModel,
        driverSharePct: seed.driverSharePct,
        driverBonusSharePct: 50,
        driverPlatformFeeSharePct: 0,
        dailyFixedCents: BigInt(0),
        isActive: seed.isActive,
      },
    });
  }
  return prisma.driver.create({
    data: {
      tenantId,
      companyId,
      fullName: seed.fullName,
      dni: seed.dni,
      phone: seed.phone,
      email: seed.email,
      licenseNumber: seed.licenseNumber,
      vehiclePlate: seed.vehiclePlate,
      vehicleModel: seed.vehicleModel,
      driverSharePct: seed.driverSharePct,
      driverBonusSharePct: 50,
      driverPlatformFeeSharePct: 0,
      dailyFixedCents: BigInt(0),
      isActive: seed.isActive,
    },
  });
}

async function ensurePlatformAccounts(
  prisma: PrismaClient,
  tenantId: string,
  driver: Driver,
  platforms: RidePlatform[],
): Promise<Map<RidePlatform, DriverPlatformAccount>> {
  const map = new Map<RidePlatform, DriverPlatformAccount>();
  const slug = driver.fullName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 24);

  for (const platform of platforms) {
    const ext = `seed-${slug}-${platform.toLowerCase()}`;
    const account = await prisma.driverPlatformAccount.upsert({
      where: {
        tenantId_platform_externalDriverId: {
          tenantId,
          platform,
          externalDriverId: ext,
        },
      },
      create: {
        tenantId,
        driverId: driver.id,
        platform,
        externalDriverId: ext,
        metadata: { source: "seed" },
      },
      update: { driverId: driver.id, isActive: true },
    });
    map.set(platform, account);
  }
  return map;
}

function buildMonthTrips(
  year: number,
  month: number,
  driverIndex: number,
  driverId: string,
  accounts: Map<RidePlatform, DriverPlatformAccount>,
  platforms: RidePlatform[],
  liquidationStatus: "pending" | "closed",
  tripsPerDay: number,
  tripIdStart: number,
): { trips: SeedTripInput[]; nextId: number } {
  const trips: SeedTripInput[] = [];
  let tripId = tripIdStart;
  const daysInMonth = new Date(year, month, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    for (let t = 0; t < tripsPerDay; t++) {
      const platform = platforms[(day + t + driverIndex) % platforms.length]!;
      const account = accounts.get(platform);
      if (!account) continue;

      const hour = 7 + ((day * 3 + t * 2 + driverIndex) % 12);
      const startedAt = new Date(Date.UTC(year, month - 1, day, hour, (t * 17) % 60));
      const net = netFromIndex(tripId);
      trips.push({
        platform,
        externalTripId: `seed-${year}${String(month).padStart(2, "0")}-d${driverIndex}-t${tripId}`,
        startedAt,
        durationMin: 22 + (tripId % 35),
        netAmountCents: net,
        paymentMethod: paymentFromIndex(tripId),
        fareType: tripId % 3 === 0 ? "Precio cerrado" : "Taximetro",
        paymentValidated: liquidationStatus === "closed" || tripId % 5 !== 0,
        platformBonusCents: tripId % 6 === 0 ? BigInt(320) : BigInt(0),
        liquidationStatus,
        tipCents: tripId % 4 === 0 ? BigInt(150) : BigInt(0),
        tollCents: tripId % 7 === 0 ? BigInt(200) : BigInt(0),
      });
      tripId += 1;
    }
  }
  return { trips, nextId: tripId };
}

export async function clearTenantOperativaData(
  prisma: PrismaClient,
  tenantId: string,
): Promise<void> {
  await prisma.shiftLiquidation.deleteMany({ where: { tenantId } });
  await prisma.trip.deleteMany({ where: { tenantId } });
  await prisma.syncRun.deleteMany({ where: { tenantId } });
  await prisma.driverPlatformDayMetric.deleteMany({ where: { tenantId } });
  await prisma.driverVehicleAssignment.deleteMany({ where: { tenantId } });
  await prisma.driverPlatformAccount.deleteMany({ where: { tenantId } });
  await prisma.driver.deleteMany({ where: { tenantId } });
}

export async function seedSyntheticFleet(
  prisma: PrismaClient,
  tenantId: string,
  companyId: string,
): Promise<void> {
  await clearTenantOperativaData(prisma, tenantId);

  const drivers: Array<{
    driver: Driver;
    seed: DriverSeed;
    accounts: Map<RidePlatform, DriverPlatformAccount>;
  }> = [];

  const legacyDriver = await prisma.driver.findFirst({
    where: { tenantId, fullName: "Conductor Demo B" },
  });
  if (legacyDriver) {
    await prisma.trip.deleteMany({ where: { driverId: legacyDriver.id } });
    await prisma.driverPlatformAccount.deleteMany({ where: { driverId: legacyDriver.id } });
    await prisma.driver.delete({ where: { id: legacyDriver.id } });
  }

  for (const seed of DRIVER_SEEDS) {
    const driver = await ensureDriver(prisma, tenantId, companyId, seed);
    await seedDriverVehicleHistory(prisma, tenantId, driver, seed);
    const accounts = await ensurePlatformAccounts(prisma, tenantId, driver, seed.platforms);
    drivers.push({ driver, seed, accounts });
  }

  // Remove legacy single-driver seed trips (optional cleanup)
  await prisma.trip.deleteMany({
    where: {
      tenantId,
      externalTripId: {
        in: [
          "seed-trip-uber-1",
          "seed-trip-uber-2",
          "seed-trip-fn-1",
          "seed-trip-uber-closed-1",
          "seed-trip-fn-closed-1",
        ],
      },
    },
  });

  let globalTripId = 1;

  // Closed trips: April + May 2026 (billing / analytics default range)
  for (let m = 0; m < drivers.length; m++) {
    const { driver, seed, accounts } = drivers[m]!;
    if (!seed.isActive) continue;

    for (const month of [4, 5]) {
      const { trips, nextId } = buildMonthTrips(
        2026,
        month,
        m,
        driver.id,
        accounts,
        seed.platforms,
        "closed",
        month === 4 ? 2 : 3,
        globalTripId,
      );
      globalTripId = nextId;
      for (const trip of trips) {
        const account = accounts.get(trip.platform)!;
        await upsertSeedTrip(prisma, tenantId, driver.id, account.id, trip);
      }
    }
  }

  // Pending shifts (last 2 days) for active drivers
  const pendingBase = localDayStart();
  pendingBase.setDate(pendingBase.getDate() - 1);
  for (const { driver, seed, accounts } of drivers) {
    if (!seed.isActive) continue;
    for (let t = 0; t < 4; t++) {
      const platform = seed.platforms[t % seed.platforms.length]!;
      const account = accounts.get(platform)!;
      const startedAt = atHour(pendingBase, 8 + t * 2, t * 10);
      await upsertSeedTrip(prisma, tenantId, driver.id, account.id, {
        platform,
        externalTripId: `seed-pending-${driver.id.slice(0, 8)}-t${t}`,
        startedAt,
        durationMin: 28,
        netAmountCents: netFromIndex(globalTripId++),
        paymentMethod: paymentFromIndex(t),
        liquidationStatus: "pending",
      });
    }
  }

  // Today: local + UTC (Apps page uses UTC day; dashboard uses local day)
  const todayLocal = localDayStart();
  const todayUtc = utcDayStart();
  for (let m = 0; m < 3; m++) {
    const { driver, seed, accounts } = drivers[m]!;
    for (let t = 0; t < 6; t++) {
      const platform = seed.platforms[t % seed.platforms.length]!;
      const account = accounts.get(platform)!;
      const startedLocal = atHour(todayLocal, 7 + t, 5 + t * 7);
      await upsertSeedTrip(prisma, tenantId, driver.id, account.id, {
        platform,
        externalTripId: `seed-today-local-d${m}-t${t}`,
        startedAt: startedLocal,
        durationMin: 25 + (t % 20),
        netAmountCents: netFromIndex(globalTripId++),
        paymentMethod: paymentFromIndex(t + m),
        liquidationStatus: t < 2 ? "pending" : "closed",
        tipCents: t % 3 === 0 ? BigInt(200) : BigInt(0),
      });
      const startedUtc = atUtcHour(todayUtc, 8 + t, 10 + t * 5);
      await upsertSeedTrip(prisma, tenantId, driver.id, account.id, {
        platform,
        externalTripId: `seed-today-utc-d${m}-t${t}`,
        startedAt: startedUtc,
        durationMin: 30,
        netAmountCents: netFromIndex(globalTripId++),
        paymentMethod: paymentFromIndex(t),
        liquidationStatus: "closed",
      });
    }
  }

  // Demo sync runs (UI only — no live connector)
  await prisma.syncRun.deleteMany({ where: { tenantId } });
  const syncNow = new Date();
  for (const [platform, minutesAgo] of [
    [RidePlatform.UBER, 3],
    [RidePlatform.FREENOW, 8],
    [RidePlatform.BOLT, 12],
    [RidePlatform.CABIFY, 18],
  ] as const) {
    const startedAt = new Date(syncNow.getTime() - minutesAgo * 60_000);
    const finishedAt = new Date(startedAt.getTime() + 45_000);
    await prisma.syncRun.create({
      data: {
        tenantId,
        platform,
        status: "SUCCESS",
        startedAt,
        finishedAt,
      },
    });
  }

  await prisma.syncRun.create({
    data: {
      tenantId,
      platform: RidePlatform.FREENOW,
      status: "FAILED",
      startedAt: new Date(syncNow.getTime() - 20 * 60_000),
      finishedAt: new Date(syncNow.getTime() - 19 * 60_000),
      errorMessage: "Demo: timeout simulado del conector",
    },
  });

  await seedDriverPlatformDayMetrics(prisma, tenantId);
}
