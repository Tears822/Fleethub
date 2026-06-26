/**
 * Pre-deploy / staging checklist — validates env files (no server required).
 * Exit 0 = all required checks pass; exit 1 = blocking issues.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

type Issue = { level: "error" | "warn"; message: string };

function readEnvFile(relPath: string): Record<string, string> {
  const full = path.join(root, relPath);
  if (!fs.existsSync(full)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function checkAuthSecret(env: Record<string, string>, label: string, issues: Issue[]) {
  const secret = env.AUTH_SECRET?.trim();
  if (!secret) {
    issues.push({ level: "error", message: `${label}: missing AUTH_SECRET` });
    return;
  }
  if (secret.length < 32) {
    issues.push({
      level: "error",
      message: `${label}: AUTH_SECRET must be at least 32 characters`,
    });
  }
  if (secret === "change-me-use-openssl-rand-base64-32-in-production") {
    issues.push({ level: "warn", message: `${label}: AUTH_SECRET is still the example placeholder` });
  }
}

function main() {
  const issues: Issue[] = [];
  const rootEnv = readEnvFile(".env");
  const webEnv = readEnvFile("apps/web/.env.local");
  const serverEnv = readEnvFile("apps/server/.env");

  checkAuthSecret(rootEnv, "fleethub/.env", issues);
  checkAuthSecret(webEnv, "apps/web/.env.local", issues);

  const rootDb = rootEnv.DATABASE_URL ?? "";
  const webDb = webEnv.DATABASE_URL ?? "";

  if (!rootDb) {
    issues.push({ level: "error", message: "fleethub/.env: missing DATABASE_URL" });
  } else if (rootDb.includes("fleethub_app@")) {
    issues.push({
      level: "error",
      message:
        "fleethub/.env: DATABASE_URL should use owner `fleethub` for migrations/RLS SQL, not fleethub_app",
    });
  } else if (!rootDb.includes("fleethub@") && !rootDb.includes("fleethub:")) {
    issues.push({
      level: "warn",
      message: "fleethub/.env: DATABASE_URL does not look like the default fleethub owner user",
    });
  }

  if (!webDb) {
    issues.push({
      level: "warn",
      message: "apps/web/.env.local: missing DATABASE_URL (Next server components need fleethub_app)",
    });
  } else if (!webDb.includes("fleethub_app@")) {
    issues.push({
      level: "error",
      message:
        "apps/web/.env.local: DATABASE_URL should use `fleethub_app` so runtime queries enforce RLS",
    });
  }

  const serverUrl = webEnv.NEXT_PUBLIC_SERVER_URL?.trim();
  if (!serverUrl) {
    issues.push({
      level: "error",
      message: "apps/web/.env.local: missing NEXT_PUBLIC_SERVER_URL",
    });
  }

  const appUrl = webEnv.NEXT_PUBLIC_APP_URL?.trim();
  if (!appUrl) {
    issues.push({ level: "warn", message: "apps/web/.env.local: missing NEXT_PUBLIC_APP_URL" });
  }

  const webOrigin = serverEnv.WEB_ORIGIN?.trim() || rootEnv.WEB_ORIGIN?.trim();
  if (!webOrigin) {
    issues.push({
      level: "warn",
      message: "apps/server/.env: missing WEB_ORIGIN (CORS for browser login)",
    });
  } else if (appUrl && !webOrigin.split(",").some((o) => o.trim() === appUrl)) {
    issues.push({
      level: "warn",
      message: `WEB_ORIGIN should include NEXT_PUBLIC_APP_URL (${appUrl}) for credentialed requests`,
    });
  }

  const smtpUser = rootEnv.SMTP_USER?.trim();
  const smtpPass = rootEnv.SMTP_PASS?.trim();
  if (!smtpUser || !smtpPass) {
    issues.push({
      level: "warn",
      message:
        "fleethub/.env: missing SMTP_USER/SMTP_PASS — invites, password reset, and digest will log to console only",
    });
  } else {
    console.log("[ok] SMTP_USER/SMTP_PASS present in fleethub/.env (run npm run test:smtp to verify delivery)");
  }

  const errors = issues.filter((i) => i.level === "error");
  const warns = issues.filter((i) => i.level === "warn");

  for (const w of warns) console.warn(`[warn] ${w.message}`);
  for (const e of errors) console.error(`[error] ${e.message}`);

  if (errors.length === 0 && warns.length === 0) {
    console.log("Deploy env check OK.");
  } else if (errors.length === 0) {
    console.log(`Deploy env check OK with ${warns.length} warning(s).`);
  } else {
    console.error(`Deploy env check FAILED (${errors.length} error(s), ${warns.length} warning(s)).`);
    process.exit(1);
  }
}

main();
