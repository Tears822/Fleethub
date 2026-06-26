# Uber Vehicle Suppliers — Webhooks (FleetHub)

Aligns with Uber’s confidential rental-platform webhook spec.

## Endpoint

| Item | Value |
|------|--------|
| URL (production) | `https://activex.rest/api/webhooks/uber` |
| Method | `POST` |
| Content-Type | `application/json` |

Nginx should proxy `/api/webhooks/` to `@fleethub/server` (`127.0.0.1:4000`). See `docs/nginx-activex.rest.conf`.

## Authentication (no OAuth)

Uber does **not** use OAuth on partner callbacks. Verify every request:

1. Read raw HTTP body bytes (do not re-serialize JSON).
2. Compute `HMAC-SHA256(body, client_secret)` → hexadecimal digest.
3. Compare with header `X-Uber-Signature`.

FleetHub uses `WEBHOOK_UBER_SIGNING_SECRET` or falls back to `UBER_CLIENT_SECRET` from the developer dashboard application.

Optional header `X-Environment`: `production` or `sandbox` (stored in audit log).

## Request body

| Field | Type | Description |
|-------|------|-------------|
| `event_id` | string | Unique UUID — used for deduplication |
| `event_time` | integer | Unix timestamp |
| `event_type` | string | Event name (see Uber API Reference per webhook) |
| `meta` | object | Event-specific payload |

## Response (required by Uber)

On successful receipt (valid signature):

- **HTTP 200**
- **Empty response body**

Otherwise Uber retries with exponential backoff (30s, 60s, 120s, … up to 7 retries).

FleetHub returns **401** only when the signature is invalid. Tenant resolution errors still return **200** (logged as `webhook.received.unresolved_tenant`) so misconfiguration does not cause endless Uber retries.

## Tenant mapping

Uber does not send FleetHub tenant id. Resolve tenant by:

1. Header `X-FleetHub-Tenant-Slug` (e.g. `demo-a`) if your subscription supports custom headers, or
2. `organization_id` / `org_id` in payload matching **Uber Org ID** in Configuración → Integraciones.

## Processing pipeline

1. API validates signature → audit `webhook.received` → enqueue `fleethub-webhook-ingest`
2. Worker parses payload → **enriches** minimal trips (see below) → upserts with `ingest_source = webhook`
3. Audit `webhook.processed` | `webhook.ignored` | `webhook.unlinked_driver`

### Trip enrichment (completed events)

When the webhook only has `meta.resource_id` + `status` (no fare), the worker:

1. **GET `resource_href`** with the fleet access token (if present in payload)
2. **Fallback:** Trip Activity report for that driver (last 48h) — same as scheduled sync

Disable report fallback (faster, href-only): `WEBHOOK_UBER_ENRICH_REPORTS=0`

### Narrow sync fallback

If trips still lack fare after enrichment, the worker enqueues a **single-driver** `platform-sync` (poll, ~8s delay) for that `driver_platform_account`. Audit payload includes `narrowSyncJobId`. Disable with `WEBHOOK_NARROW_SYNC_ENABLED=0`.

Env:

```env
WEBHOOK_ENQUEUE_ENABLED=1
WEBHOOK_REQUIRE_SIGNATURE=1   # recommended in production
WEBHOOK_NARROW_SYNC_ENABLED=1 # single-driver sync when enrich incomplete
WORKER_MODE=fleet
```

## Dashboard setup

1. **Settings → RIDE REQUESTS → Webhook URL**: `https://activex.rest/api/webhooks/uber`
2. Authentication: **Basic HMAC** (not OAuth)
3. Subscribe to specific event types via your Uber POC (manual subscription)

## Health check

```bash
curl -s https://activex.rest/api/webhooks/health
```

(JSON diagnostic — not used by Uber.)
