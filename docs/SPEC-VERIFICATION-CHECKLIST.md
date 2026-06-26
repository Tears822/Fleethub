# FleetHub — Spec Verification Checklist (English)

**Internal / QA use.** For client-facing summary of what is implemented, see **[CLIENT-DEMO.md](./CLIENT-DEMO.md)** (section *Funciones de la especificación acordada — implementadas*).

Use this checklist to verify the **agreed technical specification** (2FA, roles, multi-tenant, integrations model, sessions/email) against the running FleetHub app.

**Related docs**

- [IMPLEMENTATION-CHECKLIST.md](./IMPLEMENTATION-CHECKLIST.md) — full feature inventory (all modules)
- [CLIENT-DEMO.md](./CLIENT-DEMO.md) — demo walkthrough (Spanish)

**Legend**

| Status | Meaning |
|--------|---------|
| ✅ | Implemented — you can verify now |
| ⚠️ | Partial or environment-dependent |
| ❌ | Not implemented yet |
| 🚫 | Out of current phase (live Uber/FreeNow sync) |

**Setup**

```bash
cd fleethub
npm run db:setup
npm run dev              # web + API
npm run demo:verify      # typecheck + RBAC + RLS + API smoke
```

**Password after seed:** `Demo1234!`

---

## 1. Two-factor authentication (2FA)

**Spec summary:** Google Authenticator–style TOTP. Super Admin **mandatory in production**. Staging/dev: no extra restriction. Tenant Admin and other roles: **optional** in all environments.

| # | Requirement | Status | How to verify |
|---|-------------|--------|----------------|
| 1.1 | TOTP compatible with authenticator apps (6-digit codes) | ✅ | Log in → **Ajustes** → enable 2FA → scan QR → confirm with code |
| 1.2 | Login asks for 2FA code when TOTP is enabled | ✅ | Enable TOTP on a user → log out → log in → second step appears |
| 1.3 | API: `POST /api/auth/totp/begin` and `POST /api/auth/totp/confirm` | ✅ | Browser network tab while setting up 2FA |
| 1.4 | API: `POST /api/auth/login/2fa` completes login after TOTP | ✅ | Login flow with `requires2fa` + `pendingToken` |
| 1.5 | Super Admin: 2FA **mandatory in production** (`NODE_ENV=production`) | ✅ | Set `NODE_ENV=production` on API, SA without TOTP → password login succeeds, redirect to `/super-admin/seguridad` (`requiresMfaSetup`) |
| 1.6 | Super Admin: no mandatory 2FA in staging/dev | ✅ | Default `NODE_ENV=development` — SA can log in without TOTP |
| 1.7 | Tenant Admin / Gestor / Read-only: 2FA **optional** | ✅ | Tenant users can use app without TOTP; optional in **Ajustes** |
| 1.8 | Backup codes for TOTP recovery | ✅ | Returned on `totp/confirm` (stored hashed in DB) |
| 1.9 | User can **disable** 2FA (with TOTP/backup code) | ✅ | **Ajustes** → **Desactivar 2FA** → `POST /api/auth/totp/disable` |
| 1.10 | Super Admin cannot disable 2FA in production | ✅ | API returns 403 when `NODE_ENV=production` |
| 1.11 | 2FA mandatory for Tenant Admin in production | ✅ | Prod: login → `/ajustes` until TOTP enabled; cannot disable |

**Manual test — enable 2FA (tenant or SA)**

- [ ] Log in as `admin-demoa@example.com` / `demo-a`
- [ ] Open **Ajustes** → TOTP panel → **Begin** → scan QR in Google Authenticator (or similar)
- [ ] Enter code → **Confirm** → save backup codes
- [ ] Log out and log in again → must pass 2FA step
- [ ] **Ajustes** → **Desactivar 2FA** → enter authenticator code → 2FA off; login no longer asks for code

**Manual test — Super Admin production rule (local simulation)**

- [ ] Run API with `NODE_ENV=production`
- [ ] Log in as `superadmin@fleethub.local` / `platform` **without** TOTP enabled
- [ ] Expect redirect to **Seguridad (2FA)** (`/super-admin/seguridad`) to configure TOTP
- [ ] Enable TOTP, log out, log in again → 2FA verification step appears

**Automated**

- [ ] `npm run test:smoke` — if seed users have TOTP off, smoke still passes (documented in script)

---

## 2. User roles and permissions

**Spec summary:** Super Admin creates tenants and first Admin; global access. Tenant Admin manages own tenant only. Gestor = daily ops only. Read-only = view + export. Same email can belong to **multiple companies in one tenant**, never across tenants.

| # | Requirement | Status | How to verify |
|---|-------------|--------|----------------|
| 2.1 | **Super Admin** — create tenants | ✅ | `/super-admin/tenants/nuevo` → `POST /api/super-admin/tenants` |
| 2.2 | **Super Admin** — designate first Admin per tenant | ✅ | Included in tenant creation flow |
| 2.3 | **Super Admin** — global platform access | ✅ | Login `platform` / `superadmin@fleethub.local` |
| 2.4 | **Super Admin** — login by email only (no tenant slug field) | ✅ | Same `/login` form; platform user resolved by email |
| 2.5 | **Tenant Admin** — full tenant management (users, settings, companies) | ✅ | Login `admin-demoa@example.com` |
| 2.6 | **Tenant Admin** — create Gestor and Read-only users | ✅ | **Configuración** → Usuarios → invite |
| 2.7 | **Tenant Admin** — cannot see other tenants | ✅ | RLS + session `tid`; try `demo-b` data while logged into `demo-a` |
| 2.8 | **Gestor** — close shifts, drivers, export; **no** settings/users | ✅ | Login `gestor-demoa@example.com` — no **Configuración** in sidebar |
| 2.9 | **Gestor** — cannot invite users | ✅ | `POST /api/tenant/users/invite` → **403** (`npm run test:smoke`) |
| 2.10 | **Gestor** — cannot create companies | ✅ | `POST /api/tenant/companies` → **403** |
| 2.11 | **Read-only** — view + export only | ✅ | Login `lectura-demoa@example.com` |
| 2.12 | **Read-only** — no writes (drivers, shifts, companies) | ✅ | Write buttons hidden/disabled; API → **403** |
| 2.13 | **Read-only** — CSV export allowed | ✅ | `GET /api/tenant/export/conductores.csv` → **200** |
| 2.14 | User assigned to **multiple companies** (same tenant) | ✅ | Invite user with several companies in **Configuración**; `user_companies` table |
| 2.15 | Restricted user sees only assigned companies’ data | ✅ | Log in as user with subset of companies — drivers/trips scoped |
| 2.16 | Same email in **two different tenants** | ⚠️ | Schema: unique `(tenantId, email)` — same email **can** exist once per tenant, not globally blocked |

**Role walkthrough (check each)**

| Step | Action | Expected |
|------|--------|----------|
| [ ] 1 | Admin: open **Configuración**, invite a Gestor | Success email / user row |
| [ ] 2 | Gestor: open **Cerrar turnos**, try **Configuración** URL | Redirect or blocked |
| [ ] 3 | Lectura: export conductores CSV | OK |
| [ ] 4 | Lectura: try create driver | Blocked (403 or UI) |
| [ ] 5 | SA: list tenants, open `demo-a` is not tenant impersonation | SA sees platform UI only |

**Automated**

- [ ] `npm run test:rbac` — 6 unit tests
- [ ] `npm run test:smoke` — admin / gestor / lectura HTTP checks
- [ ] `npm run test:tenant:rls` — tenant B cannot read tenant A data

---

## 3. Multi-tenant structure

**Spec summary:** Each tenant = isolated client. Multiple companies (legal entities) per tenant. Each driver belongs to **one** company. New tenants only via FleetHub (no public self-registration).

| # | Requirement | Status | How to verify |
|---|-------------|--------|----------------|
| 3.1 | Tenant = isolated data boundary | ✅ | `tenants` table + `tenant_id` on all rows |
| 3.2 | RLS enforces isolation at DB level | ✅ | `npm run test:tenant:rls` |
| 3.3 | API validates tenant on every request | ✅ | Session JWT includes `tid`; `withTenant()` in queries |
| 3.4 | One tenant → many companies | ✅ | **Empresas** list; seed `demo-a` → BADAVI SL |
| 3.5 | One driver → one company | ✅ | `drivers.company_id` required |
| 3.6 | Public tenant signup (optional SaaS) | ✅ | `/registro` when `PUBLIC_SIGNUP_ENABLED`; SA path unchanged |
| 3.7 | Login with **email + password** (tenant inferred from user) | ✅ | `/login` — no slug field; email unique platform-wide |
| 3.8 | Cross-tenant API access blocked | ✅ | RLS test + wrong slug at login |

**Manual isolation test**

- [ ] Seed: `demo-a` and `demo-b` exist
- [ ] Login `demo-a` → note driver names (e.g. Carlos García)
- [ ] Login `demo-b` → different data (e.g. “Conductor Demo B”)
- [ ] Confirm no shared drivers between tenants

---

## 4. Integration with external platforms

**Spec summary:** FleetHub holds **one umbrella account** with Uber and FreeNow. Settlements arrive centrally and are distributed internally by company/driver. **Tenants do not** connect their own Uber/FreeNow credentials.

| # | Requirement | Status | How to verify |
|---|-------------|--------|----------------|
| 4.1 | Single umbrella model (central FleetHub account) | 🚫 | Architecture/docs only — **no live sync** in demo |
| 4.2 | Tenants do **not** enter Uber/FreeNow API keys in UI | ✅ | **Configuración** → Integraciones shows status only, no credential form |
| 4.3 | Trip data in app from **seed** (not live API) | ✅ | After `db:seed`, Facturación/Apps have data |
| 4.4 | Worker + connectors (Uber/FreeNow stubs) | ⚠️ | `apps/worker` — stub trips if env credentials set |
| 4.5 | Distribute trips to correct tenant/company/driver | 🚫 | Needs live ingestion pipeline |
| 4.6 | Bolt / Cabify | ❌ | UI: “coming soon” |
| 4.7 | Sync history visible to Admin | ✅ | **Configuración** — last sync messages from `sync_runs` (seed) |

**What you can demo without live APIs**

- [ ] Show **Configuración** integrations panel (Uber/FreeNow “active” from seed sync runs)
- [ ] Explain: operational data today = **database seed**, not Uber/FreeNow pull
- [ ] Do **not** claim live platform sync unless worker + credentials are configured

---

## 5. Session and communications

**Spec summary:** Session duration **24 hours**. Email via provisional Gmail SMTP account.

| # | Requirement | Status | How to verify |
|---|-------------|--------|----------------|
| 5.1 | Session duration **24 hours** | ✅ | `SESSION_MAX_AGE_SECONDS = 86400` (`packages/auth/src/session-duration.ts`) |
| 5.2 | Session stored in HTTP-only cookie | ✅ | Cookie name from `@fleethub/auth/constants` |
| 5.3 | Logout clears session | ✅ | **Ajustes** → logout → `POST /api/auth/logout` |
| 5.4 | Forgot password sends email | ⚠️ | `/olvide-contrasena` — requires SMTP in `apps/server/.env` |
| 5.5 | User invite sends activation email | ⚠️ | **Configuración** invite — requires SMTP |
| 5.6 | Gmail SMTP (`smtp.gmail.com`) supported | ✅ | `packages/auth/src/email.ts` defaults to Gmail SMTP |
| 5.7 | Emails skipped if SMTP not configured | ⚠️ | Dev: logged warning only; link may still be in API response |
| 5.8 | Use spec Gmail account in production | ⚠️ | **You** set `SMTP_USER` / `SMTP_PASS` in server `.env` (do not commit secrets) |

**Configure email (optional manual test)**

In `apps/server/.env` (or root `.env` loaded by server):

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-gmail@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=FleetHub <your-gmail@gmail.com>
APP_PUBLIC_URL=http://localhost:3000
```

| Step | Check |
|------|-------|
| [ ] Restart API (`npm run dev:server`) |
| [ ] **Olvidé contraseña** with a real mailbox you control |
| [ ] Receive reset email and open link |
| [ ] Invite user from **Configuración** and check activation email |

**Session test**

- [ ] Log in → inspect cookie `max-age` ≈ 86400 seconds (browser dev tools → Application → Cookies)
- [ ] After logout, protected routes redirect to login

---

## 6. Quick reference — demo logins

| Role | Tenant slug | Email |
|------|-------------|-------|
| Tenant Admin | `demo-a` | `admin-demoa@example.com` |
| Gestor | `demo-a` | `gestor-demoa@example.com` |
| Read-only | `demo-a` | `lectura-demoa@example.com` |
| Super Admin | `platform` | `superadmin@fleethub.local` |

Password (all): `Demo1234!`

---

## 7. Automated verification matrix

Run before a spec review meeting:

| Command | Covers |
|---------|--------|
| `npm run typecheck` | Type safety |
| `npm run test:rbac` | §2 role rules (unit) |
| `npm run test:tenant:rls` | §3 tenant isolation |
| `npm run test:smoke` | §2 API permissions (needs API on :4000) |
| `npm run demo:verify` | All of the above + smoke if API up |
| `npm run build` | Production build (web + server) |

---

## 8. Spec vs implementation — at a glance

| Spec area | Meets spec today? | Notes |
|-----------|-------------------|-------|
| 2FA TOTP | ✅ | SA mandatory only when `NODE_ENV=production` |
| Roles & permissions | ✅ | Use three demo users + smoke tests |
| Multi-tenant | ✅ | RLS + login slug + no public tenant signup |
| Umbrella Uber/FreeNow | 🚫 | Model agreed; **live sync not in demo** |
| 24h session | ✅ | Code constant 24h |
| Gmail email | ⚠️ | Code ready; **you must configure SMTP** |

---

## 9. Sign-off template

Copy for your own tracking:

```
Date: ___________
Reviewer: ___________

§1 2FA                          [ ] Pass  [ ] Fail  Notes: ___________
§2 Roles                        [ ] Pass  [ ] Fail  Notes: ___________
§3 Multi-tenant                 [ ] Pass  [ ] Fail  Notes: ___________
§4 Integrations (scope agreed)  [ ] N/A   [ ] Demo  Notes: ___________
§5 Session & email              [ ] Pass  [ ] Fail  Notes: ___________

Automated: demo:verify          [ ] Pass  [ ] Fail
```

---

*This checklist reflects the specification screenshot (2FA, roles, multi-tenant, umbrella integrations, session/email) mapped to the current FleetHub codebase.*
