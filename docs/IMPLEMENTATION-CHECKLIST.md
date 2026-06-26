# FleetHub — Implementation Checklist

Use this document to verify **what is built today** in the `fleethub` monorepo. Check items one by one in the browser or via API/tests.

For the **agreed spec** (2FA, roles, multi-tenant, umbrella integrations, session/email), see **[SPEC-VERIFICATION-CHECKLIST.md](./SPEC-VERIFICATION-CHECKLIST.md)** (English).

**Legend**

| Symbol | Meaning |
|--------|---------|
| ✅ | Implemented and verifiable (demo-ready) |
| ⚠️ | Partial / simplified vs full FRD v1.2 |
| ❌ | Not implemented |
| 🚫 | Explicitly out of scope (live platform integrations) |

---

## 0. Before you start

### 0.1 Environment

- [ ] **✅** Copy env files: `fleethub/.env`, `apps/web/.env.local` (see `README.md`)
- [ ] **✅** `DATABASE_URL` (owner `fleethub`) for migrations/seed
- [ ] **✅** `DATABASE_URL` in web uses `fleethub_app` after `db:create-app-role` (RLS at runtime)
- [ ] **✅** `AUTH_SECRET` ≥ 32 characters
- [ ] **✅** `NEXT_PUBLIC_SERVER_URL` points to API (e.g. `http://127.0.0.1:4000`)
- [ ] **✅** Docker Postgres + Redis up (if using `docker-compose`)

### 0.2 Setup commands

```bash
cd fleethub
npm install
npm run db:setup          # push + RLS + seed
npm run dev               # API + web
```

### 0.3 Automated verification

| Command | What it checks |
|---------|----------------|
| `npm run typecheck` | TypeScript across workspaces |
| `npm run test:acceptance` | RBAC unit tests, deploy env, RLS isolation |
| `npm run test:smoke` | HTTP login + RBAC per role (needs `npm run dev:server`) |
| `npm run demo:verify` | typecheck + acceptance + smoke (if API `/health` responds) |

### 0.4 Demo credentials

| Role | Tenant slug | Email | Password |
|------|-------------|-------|----------|
| Tenant Admin | `demo-a` | `admin-demoa@example.com` | `Demo1234!` |
| Gestor | `demo-a` | `gestor-demoa@example.com` | `Demo1234!` |
| Read-only | `demo-a` | `lectura-demoa@example.com` | `Demo1234!` |
| Super Admin | `platform` | `superadmin@fleethub.local` | `Demo1234!` |

Secondary tenant for RLS manual checks: `demo-b` / `admin-demob@example.com` / `Demo1234!`

---

## 1. Platform & architecture

| # | Item | Status | How to verify |
|---|------|--------|----------------|
| 1.1 | Monorepo: web (`@fleethub/web`), API (`@fleethub/server`), auth, db, contracts, worker | ✅ | `package.json` workspaces |
| 1.2 | PostgreSQL + Prisma schema (tenants, companies, users, drivers, trips, sync_runs, ingestion_events, audit_logs) | ✅ | `packages/db/prisma/schema.prisma` |
| 1.3 | Row Level Security (RLS) on tenant tables (+ `ingestion_events`) | ✅ | `npm run test:tenant:rls`; `apply-rls.sql` |
| 1.4 | App role `fleethub_app` for runtime queries | ✅ | `npm run db:create-app-role` |
| 1.5 | Redis + BullMQ worker package (optional) | ✅ | `apps/worker`, `npm run worker` |
| 1.6 | Next.js rewrites `/api/*` → `@fleethub/server` | ✅ | `apps/web/next.config.ts` |
| 1.7 | Landing / marketing page | ✅ | `/` (logged out) |
| 1.8 | Multi-tenant isolation (no cross-tenant data in UI) | ✅ | Login `demo-a` vs `demo-b`; RLS test |

---

## 2. Authentication & account security

| # | Item | Status | Route / API | How to verify |
|---|------|--------|-------------|----------------|
| 2.1 | Login (email + password; tenant resolved from email) | ✅ | `/login` | `POST /api/auth/login` |
| 2.2 | Session cookie (JWT) | ✅ | — | Stay logged in across pages |
| 2.3 | Logout | ✅ | Ajustes | `POST /api/auth/logout` |
| 2.4 | Post-login loading / cache refresh | ✅ | `/auth/loading` | Login redirect flow |
| 2.5 | Forgot password (request email) | ✅ | `/olvide-contrasena` | `POST /api/auth/forgot-password` (needs SMTP in `.env`) |
| 2.6 | Reset password (token link) | ✅ | `/restablecer-contrasena` | `POST /api/auth/reset-password` |
| 2.7 | Activate invited user account | ✅ | `/activar-cuenta` | `POST /api/auth/activate` |
| 2.8 | 2FA / TOTP login challenge | ✅ | Login flow | `POST /api/auth/login/2fa` when user has TOTP enabled |
| 2.9 | TOTP setup (begin + confirm) | ✅ | `/ajustes` | `POST /api/auth/totp/begin`, `POST /api/auth/totp/confirm` |
| 2.9b | TOTP disable (with code verification) | ✅ | `/ajustes` | `POST /api/auth/totp/disable`; SA blocked in production |
| 2.9c | TOTP status | ✅ | `/ajustes` | `GET /api/auth/totp/status` |
| 2.10 | Update profile (name) | ✅ | `/ajustes` | `PATCH /api/auth/profile` |
| 2.11 | Change password (logged in) | ✅ | `/ajustes` | `POST /api/auth/change-password` |
| 2.12 | Login attempt lockout | ✅ | — | `packages/auth/src/login-guard.ts` |
| 2.13 | Email verification on self-signup SaaS | ✅ | `/registro` + `EMAIL_VERIFY` token + login gate |
| 2.14 | Tenant audit log UI | ✅ | Configuración → Registro de actividad (admin) |

---

## 3. RBAC (roles & permissions)

Central policy: `packages/auth/src/rbac.ts` (re-exported in web as `@/domain/rbac.policy`).

| # | Capability | Admin | Gestor | Solo lectura | How to verify |
|---|------------|:-----:|:------:|:------------:|----------------|
| 3.1 | View dashboard, apps, billing, analytics, closed shifts | ✅ | ✅ | ✅ | Login each role |
| 3.2 | Close shifts (`/cerrar-turnos`) | ✅ | ✅ | ❌ | Sidebar + `test:smoke` |
| 3.3 | Create/edit drivers | ✅ | ✅ | ❌ | `/conductores/nuevo`, `/conductores/[id]/editar` |
| 3.4 | Create/edit companies | ✅ | ❌ | ❌ | `/empresas/nuevo`, `/empresas/[id]/editar` |
| 3.5 | Tenant settings (`/configuracion`) | ✅ | ❌ | ❌ | Sidebar hidden for gestor/lectura |
| 3.6 | Invite / manage tenant users | ✅ | ❌ | ❌ | Configuración → Usuarios |
| 3.7 | Export CSV (companies, drivers, trips) | ✅ | ✅ | ✅ | `GET /api/tenant/export/*.csv` |
| 3.8 | API write guard (403 for read-only POST/PATCH) | ✅ | — | `apps/server/src/plugins/tenant-write-guard.ts` |
| 3.9 | Route guard (redirect off forbidden pages) | ✅ | — | `assertTenantRouteAllowed` on protected pages |
| 3.10 | Super Admin platform (separate shell) | ✅ | — | Login `platform` / `superadmin@fleethub.local` |

---

## 4. Tenant UI — pages & data source

All listed screens use **PostgreSQL** (seed or user-created data). No fictitious row fallbacks in tables.

| # | Page | Path | Status | Data / notes |
|---|------|------|--------|----------------|
| 4.1 | Dashboard | `/dashboard` | ⚠️ | KPIs, gráfica 14 d, top 5 — **reglas de negocio parciales** → [especificacion-datos/pantalla-1-dashboard.md](./especificacion-datos/pantalla-1-dashboard.md) |
| 4.2 | Apps (usage) | `/apps` | ⚠️ | Métricas día (refresh + worker); horas/aceptación plataforma vs (est.); Bolt sin API live |
| 4.3 | Close shifts | `/cerrar-turnos` | ✅ | Preview + confirm modal, note, PDF, franja horaria, unvalidated warning |
| 4.4 | Closed shifts | `/turnos-cerrados` | ✅ | Closed trips aggregated; Excel + ZIP PDFs; SA revert when impersonating |
| 4.5 | Drivers list | `/conductores` | ✅ | License, platforms, productivity badge |
| 4.6 | Driver detail | `/conductores/[id]` | ✅ | Tabs: Datos, Vehículos (historial), Rendimiento 12m, Turnos cerrados, Económico editable |
| 4.7 | New driver | `/conductores/nuevo` | ✅ | `POST /api/tenant/drivers` |
| 4.8 | Edit driver | `/conductores/[id]/editar` | ✅ | `PATCH /api/tenant/drivers/:id` |
| 4.9 | Companies list | `/empresas` | ✅ | Billing month, driver count, contact from profile |
| 4.10 | Company detail | `/empresas/[id]` | ✅ | Profile + gestión documental (PDF upload, firmado/pendiente) |
| 4.11 | New company | `/empresas/nuevo` | ✅ | `POST /api/tenant/companies` |
| 4.12 | Edit company | `/empresas/[id]/editar` | ✅ | `PATCH /api/tenant/companies/:id` |
| 4.13 | Billing | `/facturacion` | ✅ | Tabs: by driver, by day, global; `?from=&to=` query |
| 4.14 | Analytics | `/analitica` | ✅ | KPIs + per-driver table; platform filter |
| 4.15 | Settings | `/configuracion` | ✅ | General, integrations, sync history, users, notifications, audit log |
| 4.16 | Account settings | `/ajustes` | ✅ | Profile, password, TOTP, logout |

**Suggested billing/analytics URL after seed:**  
`/facturacion?from=2026-04-01&to=2026-05-31`  
`/analitica?from=2026-04-01&to=2026-05-31`

---

## 5. Operativa — shift features (detail)

| # | Feature | Status | How to verify |
|---|---------|--------|----------------|
| 5.1 | List pending shifts (by driver, money columns) | ✅ | `/cerrar-turnos` as Admin/Gestor |
| 5.2 | Filter/search pending list | ✅ | Search + platform filter in UI |
| 5.3 | Expand row — trip detail from API | ✅ | `GET /api/tenant/shifts/trips?tripIds=...` |
| 5.4 | Close all pending trips for a driver | ✅ | UI → `POST /api/tenant/shifts/close` `{ driverId }` |
| 5.5 | Close by trip IDs | ✅ | `POST /api/tenant/shifts/close` `{ tripIds }` |
| 5.6 | List closed shifts with date range | ✅ | `/turnos-cerrados` |
| 5.7 | Export shift detail to Excel | ✅ | Expand row → Excel button |
| 5.8 | Export closed shifts list (UI) | ✅ | Excel + ZIP PDFs on `/turnos-cerrados` |
| 5.9 | Close by time range (partial shift) | ✅ | `ShiftCloseFranjaDialog` + `timeFrom`/`timeTo` |
| 5.10 | Pre-close confirmation with economic summary | ✅ | `ShiftCloseConfirmDialog` + liquidation preview API |
| 5.11 | Close note / audit on settlement | ✅ | Optional `note` on close; payload in `audit_logs` |
| 5.12 | PDF liquidation document | ✅ | Preview/download + auto-download on close |
| 5.13 | Revert closed shift (Super Admin) | ✅ | When impersonating → `POST .../shifts/revert-close` |
| 5.14 | Payment validation warnings on close | ✅ | `unvalidatedCount` in preview; allow continue |

---

## 6. Liquidation & economic split

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 6.1 | Trip money fields (gross, fee, app/cash/card, tips, tolls, net) | ✅ | Stored on `trips`; shown in lists/exports |
| 6.2 | Driver `driverSharePct`, `dailyFixedCents` on record | ✅ | Edit driver / seed |
| 6.3 | Apply reparto on close (IVA, neto empresa/conductor) | ✅ | `computeLiquidationSummary` in preview/PDF |
| 6.4 | Cash auto-deduct from settlement | ✅ | `totalToSettleCents = driverNet − cash` |
| 6.5 | Primas / incentives split rules | ✅ | `platformBonusCents` + `driverBonusSharePct` en liquidación, preview y PDF |
| 6.6 | Economic config drives close calculation | ✅ | `driverSharePct` / `dailyFixedCents` on driver |

---

## 7. Drivers & companies (CRUD)

| # | Feature | Status | API |
|---|---------|--------|-----|
| 7.1 | List drivers (tenant-scoped, company scope) | ✅ | Server component query |
| 7.2 | Create driver + platforms (Uber/FreeNow) | ✅ | `POST /api/tenant/drivers` |
| 7.3 | Update driver profile & platforms | ✅ | `PATCH /api/tenant/drivers/:driverId` |
| 7.4 | Driver fields: name, DNI, phone, email, birth date, license, vehicle | ✅ | Form + DB |
| 7.5 | List companies with enriched list row | ✅ | `listCompaniesForTenant` |
| 7.6 | Company profile JSON (address, contact, IBAN) | ✅ | `companies.profile` |
| 7.7 | Create / update company | ✅ | `POST/PATCH /api/tenant/companies` |
| 7.8 | Company logo upload | ✅ | `POST .../companies/:id/logo` + UI en editar empresa |
| 7.9 | Vehicle assignment history | ✅ | `driver_vehicle_assignments` + pestaña Vehículos |
| 7.10 | Real-time “connected now” indicator | ⚠️ | Apps + conductores: refresh worker (`refreshDriverConnectionsForTenant`); not Uber push |

---

## 8. Reporting & exports

| # | Feature | Status | How to verify |
|---|---------|--------|----------------|
| 8.1 | Billing report (by driver / day / global) | ✅ | `/facturacion` + date range |
| 8.2 | Analytics by driver | ✅ | `/analitica` |
| 8.3 | Dashboard 14-day revenue | ✅ | `/dashboard` |
| 8.4 | Export companies CSV | ✅ | `GET /api/tenant/export/empresas.csv` |
| 8.5 | Export drivers CSV | ✅ | `GET /api/tenant/export/conductores.csv` |
| 8.6 | Export trips CSV | ✅ | `GET /api/tenant/export/viajes.csv` |
| 8.7 | Excel export (billing, analytics, shift detail) | ✅ | Client-side download helpers |
| 8.8 | FRD file naming convention on exports | ✅ | `FleetHub_{tipo}_{rango}_generado{fecha}.*` |
| 8.9 | Async export jobs (>10k rows) | ✅ | `POST …/viajes/async` + worker `fleethub-tenant-export` |
| 8.10 | ZIP of PDFs for date range | ✅ | `GET /api/tenant/export/turnos-cerrados-pdfs.zip` |

---

## 9. Configuration (`/configuracion`)

| # | Feature | Status | How to verify |
|---|---------|--------|----------------|
| 9.1 | Productivity thresholds (€/h, trips/h, acceptance %) | ✅ | Save → `PATCH /api/tenant/settings/productivity` |
| 9.2 | Thresholds used in Apps productivity labels | ✅ | `/apps` after changing thresholds |
| 9.3 | Integrations panel (Uber, FreeNow active; Bolt/Cabify soon) | ⚠️ | Live sync + webhooks; org/company IDs in settings; **no SaaS credential wizard** |
| 9.4 | Sync run history (last successes/failures) | ✅ | `sync_runs` + columna ingesta (`ingest_source`, colisiones) |
| 9.12 | Driver coverage KPI (24 h) | ✅ | Configuración → Integraciones |
| 9.13 | Ingestion event KPIs + charts (24 h / 7 d, tenant-only) | ✅ | `ingestion_events`; ver [MONITORIZACION-INGESTA.md](./MONITORIZACION-INGESTA.md) |
| 9.14 | Manual platform sync (Uber, FreeNow, all) | ✅ | `POST /api/tenant/sync` → BullMQ `fleethub-fleet-sync` |
| 9.5 | Invite tenant user | ✅ | `POST /api/tenant/users/invite` |
| 9.6 | Resend invite | ✅ | `POST /api/tenant/users/:userId/resend-invite` |
| 9.7 | Update user role / active | ✅ | `PATCH /api/tenant/users/:userId` |
| 9.8 | Company assignment for restricted users | ✅ | Invite form company checkboxes |
| 9.9 | Configure live API credentials per tenant | 🚫 | Not in scope |
| 9.10 | Polling interval config (stored, no live sync) | ✅ | Saved in tenant `settings` JSON |
| 9.11 | Tenant audit log (read-only) | ✅ | Configuración → Registro de actividad |

---

## 10. Super Admin (`/super-admin`)

| # | Feature | Status | Path / API |
|---|---------|--------|------------|
| 10.1 | Platform dashboard (stats, recent tenants/users) | ✅ | `/super-admin` |
| 10.2 | List all tenants | ✅ | `/super-admin/tenants` |
| 10.3 | Create tenant + initial admin | ✅ | `/super-admin/tenants/nuevo` → `POST /api/super-admin/tenants` |
| 10.4 | Edit tenant (name, tax id, company active) | ✅ | `/super-admin/tenants/[id]` → `PATCH /api/super-admin/tenants/:tenantId` |
| 10.5 | List platform users | ✅ | `/super-admin/usuarios` |
| 10.6 | Create platform Super Admin user | ✅ | `/super-admin/usuarios/nuevo` → `POST /api/super-admin/platform-users` |
| 10.7 | Impersonate tenant (read-only) | ✅ | Banner + `POST /api/super-admin/impersonate/:id` |
| 10.8 | Suspend / trial / commercial status | ✅ | `TenantCommercialStatus` + login block |
| 10.9 | Global integration monitoring dashboard | ✅ | `/super-admin/sync` — cola, KPIs ingesta, gráficas 24 h/7 d, cobertura, errores |
| 10.11 | Active drivers report | ✅ | `/super-admin/informe` |
| 10.10 | Create tenant users from SA (cross-tenant) | ❌ | By design: tenant users invited in Configuración |

---

## 11. External integrations & worker

| # | Feature | Status | Location |
|---|---------|--------|----------|
| 11.1 | Connector interface (contracts) | ✅ | `packages/contracts`, `apps/worker/src/connectors/` |
| 11.2 | Uber connector (fleet OAuth + Trip Activity reports) | ⚠️ | Live when env + linked drivers; demo-a may show 0 Uber trips (account) |
| 11.3 | FreeNow connector (bookings + earnings, polling) | ✅ | Public ids only (`GEYTMOBQGE` + driver `id`); bookings + `getDriverEarnings` validated live |
| 11.4 | Bolt / Cabify | ❌ | UI “coming soon”; sync job stub only |
| 11.5 | Worker: platform sync + scheduled poll | ✅ | `process-platform-sync`, `schedule-platform-sync-poll` |
| 11.6 | Webhook ingestion (Uber + FreeNow booking) | ✅ | `POST /api/webhooks/*` → `fleethub-webhook-ingest`; [UBER-WEBHOOKS.md](./UBER-WEBHOOKS.md) |
| 11.7 | Trip `ingest_source` + `ingestion_events` telemetry | ✅ | `packages/auth/src/trip-ingest-upsert.ts`, `ingestion-events.ts` |
| 11.8 | Uber webhook enrich + narrow single-driver sync | ✅ | `uber-webhook-enrich.ts`, `WEBHOOK_NARROW_SYNC_ENABLED` |
| 11.9 | Ingestion events retention (90 d) | ✅ | `purge-ingestion-retention.ts` |
| 11.10 | Production URL / nginx webhooks | ✅ | `docs/nginx-activex.rest.conf`, `activex.rest` |

---

## 12. Notifications & alerts

| # | Feature | Status |
|---|---------|--------|
| 12.1 | Dashboard alerts panel | ✅ | Pending shifts, productivity, sync stale/failed |
| 12.2 | Email digest (manual / dashboard) | ⚠️ | `POST /api/tenant/notifications/send-digest` (needs SMTP) |
| 12.3 | WhatsApp alerts | 🚫 | Out of scope |
| 12.4 | Stale sync alert in dashboard | ✅ | `dashboard-alerts.queries.ts` |
| 12.5 | Notification preferences (toggles) | ✅ | Configuración → Notificaciones |

---

## 13. Seed data (`demo-a`)

Run: `npm run seed -w @fleethub/db`

| # | Item | Status |
|---|------|--------|
| 13.1 | Tenant `demo-a` → company **BADAVI SL** | ✅ |
| 13.2 | Users: admin, gestor, lectura | ✅ |
| 13.3 | 4 drivers with full profiles + platforms | ✅ |
| 13.4 | Closed trips Apr–May 2026 (billing/analytics volume) | ✅ |
| 13.5 | Today’s trips (dashboard / apps) | ✅ |
| 13.6 | Pending shifts (close shifts screen) | ✅ |
| 13.7 | Sync runs for Configuración UI | ✅ |
| 13.8 | Tenant productivity settings JSON | ✅ |
| 13.9 | Company profile (address, contact, banking, documents metadata) | ✅ |
| 13.10 | Tenant `demo-b` for RLS smoke | ✅ |
| 13.11 | Demo users without TOTP (smoke-friendly) | ✅ | Seed clears `totpEnabled` on demo users |

---

## 14. API reference (implemented routes)

### Health

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | None |

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Tenant or platform login |
| POST | `/api/auth/login/2fa` | Complete TOTP challenge |
| POST | `/api/auth/logout` | Clear session |
| POST | `/api/auth/forgot-password` | Request reset email |
| POST | `/api/auth/reset-password` | Set new password with token |
| POST | `/api/auth/activate` | Activate invited account |
| PATCH | `/api/auth/profile` | Update name |
| POST | `/api/auth/change-password` | Change password |
| POST | `/api/auth/totp/begin` | Start TOTP setup |
| POST | `/api/auth/totp/confirm` | Confirm TOTP setup |

### Tenant (session: tenant user)

| Method | Path | Admin | Gestor | Lectura |
|--------|------|:-----:|:------:|:-------:|
| GET | `/api/tenant/shifts/trips` | ✅ | ✅ | ✅ |
| POST | `/api/tenant/shifts/liquidation-preview` | ✅ | ✅ | ❌ |
| POST | `/api/tenant/shifts/liquidation-pdf` | ✅ | ✅ | ❌ |
| POST | `/api/tenant/shifts/close` | ✅ | ✅ | ❌ |
| POST | `/api/tenant/drivers` | ✅ | ✅ | ❌ |
| PATCH | `/api/tenant/drivers/:driverId` | ✅ | ✅ | ❌ |
| POST | `/api/tenant/companies` | ✅ | ❌ | ❌ |
| PATCH | `/api/tenant/companies/:companyId` | ✅ | ❌ | ❌ |
| POST | `/api/tenant/companies/:companyId/logo` | ✅ | ❌ | ❌ |
| POST/PATCH | `/api/tenant/companies/:companyId/documents/:docId` | ✅ | ❌ | ❌ |
| GET/PATCH | `/api/tenant/settings/general` | ✅ | ❌ | ❌ |
| GET/PATCH | `/api/tenant/settings/productivity` | ✅ | ❌ | ❌ |
| GET/PATCH | `/api/tenant/settings/notifications` | ✅ | ❌ | ❌ |
| POST | `/api/tenant/sync` | ✅ | ✅ | ❌ |
| POST | `/api/tenant/notifications/send-digest` | ✅ | ❌ | ❌ |
| POST | `/api/tenant/users/invite` | ✅ | ❌ | ❌ |
| POST | `/api/tenant/users/:userId/resend-invite` | ✅ | ❌ | ❌ |
| PATCH | `/api/tenant/users/:userId` | ✅ | ❌ | ❌ |
| GET | `/api/tenant/export/*.csv` | ✅ | ✅ | ✅ |
| GET | `/api/tenant/export/*.xlsx` | ✅ | ✅ | ✅ |
| GET | `/api/tenant/export/turnos-cerrados-pdfs.zip` | ✅ | ✅ | ✅ |

### Super Admin (session: platform user)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/super-admin/tenants` | Create tenant + admin |
| PATCH | `/api/super-admin/tenants/:tenantId` | Update tenant (incl. commercial status) |
| POST | `/api/super-admin/platform-users` | Create Super Admin user |
| POST | `/api/super-admin/impersonate/:tenantId` | Read-only tenant session |
| POST | `/api/super-admin/impersonate/end` | End impersonation |
| POST | `/api/super-admin/tenants/:tenantId/shifts/revert-close` | Reopen closed trips (impersonating) |

### Webhooks & health (no session cookie)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/webhooks/uber` | Uber HMAC webhook → queue ingest |
| POST | `/api/webhooks/freenow` | FreeNow webhook → queue ingest |
| GET | `/api/webhooks/health` | API + Redis diagnostic |

---

## 15. Summary for contract / demo

### Ready for client demo (with seed)

- Multi-tenant app shell, auth, 2FA, RBAC, RLS  
- Dashboard, apps, billing, analytics, drivers, companies on **real DB data**  
- **Cerrar turnos**: preview, economic summary, note, PDF, franja horaria, unvalidated warning  
- **Turnos cerrados**: Excel, ZIP PDFs, SA revert when impersonating  
- Company **logo** + **documents** (PDF upload)  
- Configuración: general, productivity, integrations history, users, notifications, **audit log**  
- Super Admin: tenants, commercial status, impersonation, informe, **sync + ingesta monitor**  
- Live Uber/FreeNow sync + webhooks (when worker + env configured); `ingestion_events` KPIs  
- Exports CSV/XLSX with FRD filename pattern  
- `npm run demo:verify` (typecheck + acceptance + smoke when API is up)

### Remaining (no live platform connectors)

| Item | Status |
|------|--------|
| SMTP go-live (invites, password reset, digest) | ✅ Verified — `npm run test:smtp` / `test:smtp:send` (Gmail in `fleethub/.env`) |
| Primas reparto en cierre (bonus share %) | ✅ |
| Platform fee share % en liquidación | ✅ | `driverPlatformFeeSharePct` en `computeLiquidationSummary` |
| Async exports >10k rows | ✅ | BullMQ + polling en UI turnos cerrados |
| Fijo diario en liquidación | ✅ | `dailyFixedCents` sumado al total a liquidar |
| Uber `fareType` en ingesta live | ✅ | `uber-fare-type.ts` + merge partner trips |
| SaaS self-signup email verification | ✅ `PUBLIC_SIGNUP_ENABLED` + `/api/auth/signup` |
| WhatsApp notifications | 🚫 |
| Uber trip volume on demo tenant (waitlist / empty API) | ⚠️ Operational on Uber side, not FleetHub bug |
| Bolt / Cabify production connectors | ❌ |
| Materialized hourly rollup table | ✅ `ingestion_hourly_rollups` + worker refresh 15 min |
| Monitorización: colas BullMQ (3) + éxito sync 24 h | ✅ `/super-admin/sync` |
| Tenant Admin 2FA obligatorio en producción | ✅ `tenantAdminNeedsMfaSetup` |

### Explicitly out of scope (current phase)

- Bolt / Cabify live APIs  
- SaaS self-service credential onboarding per tenant  

---

## 16. Related docs

- [MONITORIZACION-INGESTA.md](./MONITORIZACION-INGESTA.md) — webhooks, `ingestion_events`, UI Super Admin / Configuración  
- [PROPUESTA-MONITORIZACION-SYNC.md](./PROPUESTA-MONITORIZACION-SYNC.md) — diseño KPIs y fases  
- [UBER-WEBHOOKS.md](./UBER-WEBHOOKS.md) — contrato Uber callbacks  
- [especificacion-datos/README.md](./especificacion-datos/README.md) — **origen y fórmula por pantalla** (negocio vs código)  
- [especificacion-datos/pantalla-1-dashboard.md](./especificacion-datos/pantalla-1-dashboard.md) — Dashboard (spec cliente Mar 2026)  
- [NEXT-STEPS-FRD.md](./NEXT-STEPS-FRD.md) — phased backlog (phases 1–6 done)  
- [CLIENT-DEMO.md](./CLIENT-DEMO.md) — Spanish walkthrough for the meeting  
- [README.md](../README.md) — setup and deploy  
- FRD v1.2 (client document) — full target requirements  

---

*Last aligned with codebase: May 2026 — FRD demo + live Uber/FreeNow sync, webhooks, ingestion telemetry.*
