/**
 * Enqueue a BullMQ platform-sync job for a tenant (by slug) and platform.
 *
 * Usage (from apps/worker): npm run enqueue-sync -- demo-a UBER
 */
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { Queue } from "bullmq";
import { prisma, RidePlatform } from "@fleethub/db";
import { createRedisConnection } from "../config/redis";
import { FLEET_SYNC_QUEUE_NAME } from "../queues/constants";

loadEnv({ path: path.resolve(process.cwd(), "../../.env") });
loadEnv({ path: path.resolve(process.cwd(), ".env"), override: true });

function parsePlatform(arg: string): RidePlatform {
  const u = arg.trim().toUpperCase();
  if (u === "UBER") {
    return RidePlatform.UBER;
  }
  if (u === "FREENOW") {
    return RidePlatform.FREENOW;
  }
  throw new Error(`Unknown platform "${arg}". Use UBER or FREENOW.`);
}

async function main() {
  const [, , slug, platformArg] = process.argv;
  if (!slug || !platformArg) {
    console.error("Usage: enqueue-sync <tenant-slug> <UBER|FREENOW>");
    process.exit(1);
  }
  const platform = parsePlatform(platformArg);
  const tenant = await prisma.tenant.findUnique({
    where: { slug: slug.trim() },
    select: { id: true },
  });
  if (!tenant) {
    console.error(`Tenant not found: ${slug}`);
    process.exit(1);
  }

  const connection = createRedisConnection();
  const queue = new Queue(FLEET_SYNC_QUEUE_NAME, { connection });
  try {
    const job = await queue.add(
      "platform-sync",
      { tenantId: tenant.id, platform, trigger: "manual" },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );
    console.log(`Enqueued platform-sync job ${job.id} for tenant "${slug}" (${platform}).`);
  } finally {
    await queue.close();
    await connection.quit();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
