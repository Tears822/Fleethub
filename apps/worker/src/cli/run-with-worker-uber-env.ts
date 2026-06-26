#!/usr/bin/env node
/** Run a tsx CLI with Uber env inherited from the running fleethub worker. */
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const workerRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function fleetEnvSourcePid(): number | null {
  for (const pid of readdirSync("/proc").filter((n) => /^\d+$/.test(n))) {
    try {
      const cmd = readFileSync(`/proc/${pid}/cmdline`, "utf8");
      const hasUberEnv = readFileSync(`/proc/${pid}/environ`)
        .toString("binary")
        .includes("UBER_CLIENT_ID=");
      if (!hasUberEnv) continue;

      if (
        (cmd.includes("npm run fleet") || cmd.includes("@fleethub/worker")) &&
        cmd.includes("main.ts")
      ) {
        return Number(pid);
      }
      if (cmd.includes("tsx") && cmd.includes("src/main.ts")) {
        return Number(pid);
      }
      if (cmd.includes("fleethub-api") || cmd.includes("apps/server")) {
        return Number(pid);
      }
      if (cmd.includes("npm run start:server") || cmd.includes("@fleethub/server")) {
        return Number(pid);
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

const pid = fleetEnvSourcePid();
if (!pid) {
  console.error("No fleethub worker or API process with UBER_* env found");
  process.exit(1);
}

const envBuf = readFileSync(`/proc/${pid}/environ`);
const extra: Record<string, string> = {};
for (const part of envBuf.toString("binary").split("\0")) {
  const i = part.indexOf("=");
  if (i > 0) extra[part.slice(0, i)] = part.slice(i + 1);
}

// Keep repo DATABASE_URL (fleethub_app); only inherit platform credentials from the running process.
try {
  const rootEnv = readFileSync(path.join(workerRoot, "..", "..", ".env"), "utf8");
  for (const line of rootEnv.split("\n")) {
    const m = line.match(/^DATABASE_URL=(.+)$/);
    if (m) {
      extra.DATABASE_URL = m[1]!.replace(/^["']|["']$/g, "");
      break;
    }
  }
} catch {
  /* use inherited DATABASE_URL if .env missing */
}
for (const key of Object.keys(extra)) {
  if (!/^(UBER_|FREENOW_|REDIS_|SMTP_|WEBHOOK_)/.test(key)) {
    delete extra[key];
  }
}

const script = process.argv[2];
const args = process.argv.slice(3);
if (!script) {
  console.error("Usage: run-with-worker-uber-env.ts <tsx-script> [args…]");
  process.exit(1);
}

const res = spawnSync("npx", ["tsx", script, ...args], {
  cwd: workerRoot,
  env: { ...process.env, ...extra },
  stdio: "inherit",
});
process.exit(res.status ?? 1);
