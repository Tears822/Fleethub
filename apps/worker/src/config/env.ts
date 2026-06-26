/**
 * Worker process environment (see repo root `.env.example`).
 */
export function getRedisUrl(): string {
  return process.env.REDIS_URL?.trim() || "redis://127.0.0.1:6379";
}
