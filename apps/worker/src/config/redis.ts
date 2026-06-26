import IORedis from "ioredis";
import { getRedisUrl } from "./env";

export function createRedisConnection(): IORedis {
  return new IORedis(getRedisUrl(), { maxRetriesPerRequest: null });
}
