# FleetHub — Next steps (FRD v1.2, no live platform integration)

This backlog maps **Documento de Requisitos Funcionales v1.2** to work that can proceed using **seed/DB trip data** only (no Uber/FreeNow/Bolt/Cabify connectors).

**Already done (demo-ready):** auth, 2FA, RBAC, RLS, multi-tenant, dashboard, apps usage, cerrar/turnos cerrados (status close), facturación, analítica, conductores, empresas, configuración (users, productivity), exports CSV, Super Admin tenants.

---

## Priority phases

### Phase 1 — Cerrar turnos: liquidación real (FRD §7, §9.2) — **done**

| Item | FRD | Status |
|------|-----|--------|
| Economic summary before close (bruto, neto, reparto, efectivo, propinas, peajes) | §7.4 Bloque 2 | ✅ Preview API |
| Confirmation screen with summary + optional note | §7.5 | ✅ UI modal |
| Unvalidated payments warning (allow continue) | §7.5 | ✅ |
| Persist liquidation snapshot on close (audit payload) | §7.5 | ✅ |
| PDF document on close | §9.2 | ✅ Auto-download + vista previa |
| Time-range partial close (franja horaria) | §7.4 Bloque 1 | ✅ Diálogo franja + `timeFrom`/`timeTo` en preview/cierre |
| Super Admin revert close | §7.5 | ✅ `POST /api/super-admin/tenants/:id/shifts/revert-close` + botón al impersonar |

**API:** `POST /api/tenant/shifts/liquidation-preview` · close body may include `note`.

---

### Phase 2 — PDF y exportaciones (FRD §9.2, §14) — **done (core)**

| Item | Notes |
|------|--------|
| PDF liquidación al cerrar | ✅ `POST /api/tenant/shifts/liquidation-pdf` (pdfkit) |
| Excel Cerrar turnos / Turnos cerrados | ✅ `.xlsx` API + botones en cabecera |
| Nombre de archivo FRD §14.3 | ✅ `FleetHub_{tipo}_{rango}_generado{fecha}.*` |
| Logo empresa en PDF | ✅ `logoUrl` + upload en Empresas + embed pdfkit |
| ZIP masivo PDFs turnos cerrados | ✅ `GET /api/tenant/export/turnos-cerrados-pdfs.zip?from=&to=` + botón en Turnos cerrados |
| Excel Apps / Analítica | ✅ `.xlsx` API + botón en cabecera Apps / Analítica |

---

### Phase 3 — Conductores completos (FRD §8) — **done (core)**

| Item | Notes |
|------|--------|
| Pestaña Configuración económica editable en ficha | ✅ `driverSharePct` + fijo diario vía PATCH |
| Pestaña Rendimiento — historial 12 meses | ✅ Tabla mensual desde viajes en BD |
| Historial vehículos (asignaciones) | ✅ `driver_vehicle_assignments` + pestaña Vehículos + sync al editar |
| Indicadores productividad en listado | ✅ Badge OK / Medio / Bajo (mes en curso) |
| Alertas dashboard por umbral | ✅ Panel de alertas en Dashboard |

---

### Phase 4 — Configuración tenant (FRD §13) — **done (core)**

| Item | Notes |
|------|--------|
| General: nombre, timezone, locale | ✅ `GET/PATCH /api/tenant/settings/general` + UI |
| General: NIF, logo | ✅ NIF en Empresas; logo upload en editar empresa |
| Documentos empresa (NDA, auth, SEPA) | ✅ Upload PDF + estado + descarga en ficha empresa |
| Integraciones: historial sync 30 días | ✅ Tabla `sync_runs` + polling interval UI (sin live sync) |
| SMTP / invitaciones | Client credentials — code ready |
| Registro de actividad (audit log) | ✅ Tabla en Configuración (admin) |

---

### Phase 5 — Super Admin comercial (FRD §12) — **done (core)**

| Item | Notes |
|------|--------|
| Tenant states: trial, activo, suspendido | ✅ `TenantCommercialStatus` + UI en edición tenant |
| Login bloqueado si suspendido / prueba vencida | ✅ `tenantLoginBlockedMessage` |
| Impersonation read-only | ✅ `POST /api/super-admin/impersonate/:id` + banner + audit |
| Informe conductores activos / mes | ✅ `/super-admin/informe` |
| Monitorización global sync errors | ✅ `/super-admin/sync` |

---

### Phase 6 — Notificaciones (FRD §8.3, §12) — **done (core)**

| Item | Notes |
|------|--------|
| Panel alertas en Dashboard | ✅ Pendientes, productividad, sync stale / fallida |
| Preferencias email en Configuración | ✅ Toggles + estado SMTP |
| Email al gestor | ✅ `POST /api/tenant/notifications/send-digest` (SMTP_USER/PASS) |
| WhatsApp | Out of scope unless provider chosen |

---

## Explicitly requires live integration (defer)

- §6 Horas conectadas / tasa aceptación reales → connector `syncDriverDayMetrics` live API
- §11 Conectores trip history live (Uber/FreeNow) — webhooks remain primary
- §5 “Conectados ahora” últimas 2 h desde API
- Onboarding credenciales plataforma en Configuración

**Done (operativa):** Configuración → botones **Sincronizar** por plataforma + cola BullMQ (`POST /api/tenant/sync/poll`, worker `platform-sync`). Dashboard «Más actual» = Uber + FreeNow.

---

## Phase 7 — Dashboard alineado con spec de datos (Pantalla 1) — **partial (P0–P2 done)**

Spec negocio: [especificacion-datos/pantalla-1-dashboard.md](./especificacion-datos/pantalla-1-dashboard.md)

| Item | Status |
|------|--------|
| Facturación día + Top 5 + gráfico 14d en **bruto** | **Done** |
| Tarjeta **Avisos** = conteo alertas reales | **Done** |
| Copy subtítulos (bruto, Uber+FreeNow, turno abierto proxy) | **Done** |
| Turnos pendientes = criterio Cerrar turnos | **Done** |
| Entidad **turno** (P3) | **Done** — `ShiftLiquidation` + KPI «Turnos activos ahora» |
| Top conductores semanal/mensual | **Done** — `?top=week|month` |

---

## Post-phase backlog (demo complete without live APIs)

| Priority | Item | Notes |
|----------|------|--------|
| 1 | ~~**SMTP go-live**~~ | ✅ `SMTP_*` in `fleethub/.env`; verify with `npm run test:smtp` / `test:smtp:send` |
| 2 | **`npm run demo:verify`** | Run before client demo (API on port 4000) |
| 3 | ~~**Dashboard data spec (Phase 7)**~~ | P0–P3 core done (`ShiftLiquidation`, turnos activos) — [pantalla-1-dashboard.md](./especificacion-datos/pantalla-1-dashboard.md) |
| 4 | ~~**Apps «Todas las plataformas»**~~ | **Done** — [pantalla-2-apps.md](./especificacion-datos/pantalla-2-apps.md) |
| 5 | ~~**Apps Pantalla 2 gaps**~~ | Parcial — métricas día refresh, fuente plataforma/estimada en UI; Bolt sin API |
| ~~6~~ | ~~**Primas / incentive rules**~~ | **Done** — reparto `driverBonusSharePct` en `computeLiquidationSummary` + UI/PDF |
| 7 | ~~**Async exports**~~ | ✅ §14.3 — `viajes/async` + worker |
| 8 | ~~**SaaS email verification**~~ | ✅ `/registro`, verify email, resend |

Phases 1–6 above are **done** for seed/DB demo scope. Use [IMPLEMENTATION-CHECKLIST.md](./IMPLEMENTATION-CHECKLIST.md) for line-by-line verification.

---

*See also [CLIENT-DEMO.md](./CLIENT-DEMO.md).*
