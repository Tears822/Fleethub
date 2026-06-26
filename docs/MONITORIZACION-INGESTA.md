# Monitorización de ingesta y sync

Resumen operativo de lo implementado (alineado con [PROPUESTA-MONITORIZACION-SYNC.md](./PROPUESTA-MONITORIZACION-SYNC.md)).

## Datos

| Artefacto | Descripción |
|-----------|-------------|
| `trips.ingest_source` | Origen del viaje: `webhook`, `poll_manual`, `poll_fallback`, `reconcile` |
| `ingestion_events` | Telemetría por evento (creado, actualizado, duplicado, ignorado, latencia) |
| `ingestion_hourly_rollups` | Agregados por hora/tenant (gráficas 24 h y 7 d sin escanear eventos crudos) |
| `sync_runs.cursor_hint` | JSON con `ingestSource`, contadores, `narrowDriverPlatformAccountId` |
| Retención | `ingestion_events` y rollups purgados a los **90 días** (worker, igual que audit log) |
| Rollup refresh | Worker cada **15 min** re-agrega las últimas **72 h** desde `ingestion_events` |

## Ingesta FreeNow (polling)

FreeNow **no expone webhooks** en la integración acordada. La ingesta operativa es:

| Método | Descripción |
|--------|-------------|
| **Polling** | Worker `fleethub-fleet-sync` según `pollingMinutesFreeNow` (Configuración) |
| **Sync manual** | Botón en Configuración → Integraciones |
| **Ventana** | `freenowSyncDays` por tenant (1–28 días; default 7) |

Por cada conductor vinculado el sync:

1. `getCompanyBookings` — viajes completados
2. `getDriverEarnings` — comisión y primas del periodo (reparto proporcional al bruto por viaje)
3. Métricas día desde estados OFFER/CANCELED en bookings + horas desde duración de viajes

El endpoint `POST /api/webhooks/freenow` permanece por compatibilidad futura; **no es el canal principal**.

## Webhooks (Uber)

| Plataforma | URL producción | Notas |
|------------|----------------|-------|
| Uber | `https://activex.rest/api/webhooks/uber` | HMAC `X-Uber-Signature`; ver [UBER-WEBHOOKS.md](./UBER-WEBHOOKS.md) |
| FreeNow | — | **Polling only** — no webhook en producción |
| Health | `GET /api/webhooks/health` | Diagnóstico (Next → API) |

Nginx: `location /api/webhooks/` → API `:4000` ([nginx-activex.rest.conf](./nginx-activex.rest.conf)).

## Worker (modo `fleet`)

| Variable | Efecto |
|----------|--------|
| `WEBHOOK_ENQUEUE_ENABLED=1` | API encola `fleethub-webhook-ingest` |
| `WEBHOOK_REQUIRE_SIGNATURE=1` | Rechaza firma inválida (401) |
| `WEBHOOK_UBER_ENRICH_REPORTS=1` | Fallback Trip Activity 48 h si `resource_href` no basta |
| `WEBHOOK_NARROW_SYNC_ENABLED=1` | Cola sync de **un conductor** si el enrich falla |
| `FLEET_SYNC_POLL_ENABLED=1` | Polling Uber + FreeNow por tenant |
| `FLEET_AUTO_POLL_ALERT_ENABLED=1` | Email a Super Admin si el poll automático lleva >45 min sin éxito |

Flujo Uber webhook: parse → enrich (`resource_href` / reports) → upsert → opcional narrow sync (~8 s).

## UI

### Super Admin — `/super-admin/sync`

- Cola BullMQ `fleethub-fleet-sync`
- KPIs ingesta 24 h (eventos, duplicados, webhook vs poll, latencia)
- Gráficas: ingesta por hora (24 h), sync SUCCESS/FAILED por hora, ingesta por día (7 d)
- Cobertura conductores 24 h por tenant
- Errores sync 7 días

### Configuración → Integraciones

- Cobertura conductores 24 h
- KPIs ingesta 24 h (solo su tenant)
- Tendencia 24 h / 7 días (mismas métricas, ámbito tenant)
- Historial sync 30 d con columna **Ingesta** (`ingest_source`, colisiones)
- Sync manual Uber / FreeNow / todas

## Seguridad (RLS)

Tabla `ingestion_events`:

- Política `tenant_isolation_ingestion_events` — sesión tenant (`app.tenant_id`)
- Política `platform_scope_read_ingestion_events` — lectura global Super Admin (`app.platform_scope = super_admin`)

Migración: `20260522180000_ingestion_events_rls`. Tras desplegar:

```bash
cd fleethub/packages/db && npx prisma migrate deploy
npm run apply-rls -w @fleethub/db   # entornos que reaplican SQL manual
```

## Comandos útiles

```bash
curl -s http://127.0.0.1:4000/health
curl -s http://127.0.0.1:4000/api/webhooks/health
curl -s https://activex.rest/api/webhooks/health

npm run start -w @fleethub/server
npm run fleet -w @fleethub/worker   # WORKER_MODE=fleet
```

## Pendiente / backlog

- ~~Agregados materializados por hora~~ — `ingestion_hourly_rollups` + refresh worker 15 min
- Super Admin: colas **fleet-sync**, **webhook-ingest**, **tenant-export** + éxito sync API 24 h
- ~~Validar payload FreeNow webhook~~ — tests en `freenow-webhook-parse.test.ts`; ajustar si cambia contrato real
- Bolt / Cabify conectores productivos
- ~~Primas engine, export async >10k filas~~ (hecho: ver `IMPLEMENTATION-CHECKLIST.md`)
