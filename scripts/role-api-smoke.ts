/**
 * API RBAC smoke test — requires @fleethub/server running and seed data.
 *
 *   FLEETHUB_API_URL=http://127.0.0.1:4000 npm run test:smoke
 */
import { FH_SESSION_COOKIE } from "@fleethub/auth/constants";

const API = (process.env.FLEETHUB_API_URL ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const PASSWORD = process.env.FLEETHUB_DEMO_PASSWORD ?? "Demo1234!";
const TENANT = "demo-a";

type RoleCase = {
  label: string;
  email: string;
};

const CASES: RoleCase[] = [
  { label: "admin", email: "admin-demoa@example.com" },
  { label: "gestor", email: "gestor-demoa@example.com" },
  { label: "solo_lectura", email: "lectura-demoa@example.com" },
];

function parseSessionCookie(res: Response): string | null {
  const list =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const line of list) {
    const m = line.match(new RegExp(`^${FH_SESSION_COOKIE}=([^;]+)`));
    if (m?.[1]) return m[1];
  }
  const raw = res.headers.get("set-cookie");
  if (!raw) return null;
  const m = raw.match(new RegExp(`${FH_SESSION_COOKIE}=([^;]+)`));
  return m?.[1] ?? null;
}

async function healthOk(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function login(email: string): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`login ${email} → ${res.status}: ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { requires2fa?: boolean };
  if (json.requires2fa) {
    throw new Error(`login ${email}: 2FA required — disable TOTP on seed users for smoke test`);
  }
  const cookie = parseSessionCookie(res);
  if (!cookie) throw new Error(`login ${email}: no ${FH_SESSION_COOKIE} cookie`);
  return cookie;
}

async function api(
  cookie: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<number> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Cookie: `${FH_SESSION_COOKIE}=${cookie}`,
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  return res.status;
}

function check(label: string, ok: boolean, detail: string): boolean {
  console.log(`  ${ok ? "✔" : "✘"} ${detail}`);
  if (!ok) console.error(`    → failed for ${label}`);
  return ok;
}

async function main() {
  if (!(await healthOk())) {
    console.error(
      `API not reachable at ${API}/health — start with: npm run dev  (or set FLEETHUB_API_URL)`,
    );
    process.exit(1);
  }

  let failed = 0;

  for (const c of CASES) {
    console.log(`\n>> ${c.label} (${c.email})`);
    const cookie = await login(c.email);

    const invite = await api(cookie, "POST", "/api/tenant/users/invite", {
      email: `smoke-${Date.now()}@example.com`,
      role: "GESTOR",
      companyIds: [],
      firstName: "Smoke",
      lastName: "Test",
    });
    const exportStatus = await api(cookie, "GET", "/api/tenant/export/conductores.csv");
    const createDriver = await api(cookie, "POST", "/api/tenant/drivers", {
      fullName: "Smoke Driver",
      companyId: "00000000-0000-0000-0000-000000000000",
    });
    const closeShifts = await api(cookie, "POST", "/api/tenant/shifts/close", { tripIds: [] });
    const createCompany = await api(cookie, "POST", "/api/tenant/companies", {
      legalName: `Smoke Co ${Date.now()}`,
      taxId: null,
    });

    if (c.label === "admin") {
      if (!check(c.label, invite !== 403, `invite users: ${invite} (not 403)`)) failed++;
      if (!check(c.label, exportStatus === 200, `export conductores: ${exportStatus} (200)`)) failed++;
      if (!check(c.label, createDriver !== 403, `create driver: ${createDriver} (not 403)`)) failed++;
      if (!check(c.label, closeShifts !== 403, `close shifts: ${closeShifts} (not 403)`)) failed++;
      if (!check(c.label, createCompany === 200, `create company: ${createCompany} (200)`)) failed++;
    } else if (c.label === "gestor") {
      if (!check(c.label, invite === 403, `invite users: ${invite} (403)`)) failed++;
      if (!check(c.label, exportStatus === 200, `export conductores: ${exportStatus} (200)`)) failed++;
      if (!check(c.label, createDriver !== 403, `create driver: ${createDriver} (not 403)`)) failed++;
      if (!check(c.label, closeShifts !== 403, `close shifts: ${closeShifts} (not 403)`)) failed++;
      if (!check(c.label, createCompany === 403, `create company: ${createCompany} (403)`)) failed++;
    } else {
      if (!check(c.label, invite === 403, `invite users: ${invite} (403)`)) failed++;
      if (!check(c.label, exportStatus === 200, `export conductores: ${exportStatus} (200)`)) failed++;
      if (!check(c.label, createDriver === 403, `create driver: ${createDriver} (403)`)) failed++;
      if (!check(c.label, closeShifts === 403, `close shifts: ${closeShifts} (403)`)) failed++;
      if (!check(c.label, createCompany === 403, `create company: ${createCompany} (403)`)) failed++;
    }
  }

  if (failed > 0) {
    console.error(`\nRBAC API smoke FAILED (${failed} assertion(s)).`);
    process.exit(1);
  }
  console.log("\nRBAC API smoke OK (admin / gestor / solo lectura).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
