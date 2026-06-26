import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PrismaClient, RidePlatform } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Small PNG for demo company logo (10×10). */
const DEMO_LOGO_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBhVgAHJiAH6nKQ8KAAAAABJRU5ErkJggg==",
  "base64",
);

export async function writeDemoCompanyLogo(
  tenantId: string,
  companyId: string,
): Promise<string> {
  const repoRoot = path.resolve(__dirname, "../../..");
  const uploadsRoot = process.env.UPLOADS_DIR?.trim() || path.join(repoRoot, "data", "uploads");
  const dir = path.join(uploadsRoot, "logos", tenantId);
  await fs.mkdir(dir, { recursive: true });
  const filename = `${companyId}.png`;
  await fs.writeFile(path.join(dir, filename), DEMO_LOGO_PNG);
  return `/api/uploads/logos/${tenantId}/${filename}`;
}

export const DEMO_PASSWORD = "Demo1234!";

/** Disable public demo logins (login page no longer exposes them). */
export async function deactivateDemoLoginAccounts(prisma: PrismaClient): Promise<void> {
  await prisma.user.updateMany({
    where: { email: { endsWith: "@example.com" } },
    data: { isActive: false },
  });
  await prisma.platformUser.updateMany({
    where: { email: "superadmin@fleethub.local" },
    data: { isActive: false },
  });
}

export type SeedTripInput = {
  platform: RidePlatform;
  externalTripId: string;
  startedAt: Date;
  durationMin: number;
  netAmountCents: bigint;
  paymentMethod: string;
  liquidationStatus: "pending" | "closed";
  fareType?: string;
  paymentValidated?: boolean;
  platformBonusCents?: bigint;
  tipCents?: bigint;
  tollCents?: bigint;
};

export function tripAmounts(net: bigint, feePct = 18): {
  grossAmountCents: bigint;
  platformFeeCents: bigint;
  netAmountCents: bigint;
} {
  const fee = (net * BigInt(feePct)) / BigInt(100);
  const gross = net + fee;
  return { grossAmountCents: gross, platformFeeCents: fee, netAmountCents: net };
}

export async function upsertSeedTrip(
  prisma: PrismaClient,
  tenantId: string,
  driverId: string,
  accountId: string,
  trip: SeedTripInput,
): Promise<void> {
  const amounts = tripAmounts(trip.netAmountCents);
  const endedAt = new Date(trip.startedAt.getTime() + trip.durationMin * 60_000);

  await prisma.trip.upsert({
    where: {
      tenantId_platform_externalTripId: {
        tenantId,
        platform: trip.platform,
        externalTripId: trip.externalTripId,
      },
    },
    create: {
      tenantId,
      driverId,
      driverPlatformAccountId: accountId,
      platform: trip.platform,
      externalTripId: trip.externalTripId,
      startedAt: trip.startedAt,
      endedAt,
      grossAmountCents: amounts.grossAmountCents,
      platformFeeCents: amounts.platformFeeCents,
      netAmountCents: amounts.netAmountCents,
      tipCents: trip.tipCents ?? BigInt(0),
      platformBonusCents: trip.platformBonusCents ?? BigInt(0),
      tollCents: trip.tollCents ?? BigInt(0),
      paymentMethod: trip.paymentMethod,
      fareType: trip.fareType ?? (trip.externalTripId.length % 3 === 0 ? "Precio cerrado" : "Taximetro"),
      paymentValidated: trip.paymentValidated ?? true,
      liquidationStatus: trip.liquidationStatus,
    },
    update: {
      driverId,
      driverPlatformAccountId: accountId,
      startedAt: trip.startedAt,
      endedAt,
      grossAmountCents: amounts.grossAmountCents,
      platformFeeCents: amounts.platformFeeCents,
      netAmountCents: amounts.netAmountCents,
      tipCents: trip.tipCents ?? BigInt(0),
      platformBonusCents: trip.platformBonusCents ?? BigInt(0),
      tollCents: trip.tollCents ?? BigInt(0),
      paymentMethod: trip.paymentMethod,
      fareType: trip.fareType ?? (trip.externalTripId.length % 3 === 0 ? "Precio cerrado" : "Taximetro"),
      paymentValidated: trip.paymentValidated ?? true,
      liquidationStatus: trip.liquidationStatus,
    },
  });
}

export function localDayStart(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function utcDayStart(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function atHour(base: Date, hour: number, minute = 0): Date {
  const x = new Date(base);
  x.setHours(hour, minute, 0, 0);
  return x;
}

export function atUtcHour(base: Date, hour: number, minute = 0): Date {
  const x = new Date(base);
  x.setUTCHours(hour, minute, 0, 0);
  return x;
}

/** Deterministic net cents from seed index (€12–€45). */
export function netFromIndex(i: number): bigint {
  const euros = 12 + (i % 34);
  return BigInt(euros * 100);
}

export function paymentFromIndex(i: number): string {
  const methods = ["app", "card", "cash", "app", "card"];
  return methods[i % methods.length]!;
}
