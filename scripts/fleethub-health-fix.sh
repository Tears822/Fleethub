#!/usr/bin/env bash
# FleetHub — fix common production slowdowns (duplicate workers, Redis, service health).
#
# Usage: sudo ./scripts/fleethub-health-fix.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

log() { printf '\n[fleethub-health] %s\n' "$*"; }

log "1. Worker processes (should be exactly 1 main.ts worker):"
pgrep -af 'Acuerdo/fleethub.*src/main.ts' || echo "  (none)"

WORKER_PIDS=$(pgrep -f 'Acuerdo/fleethub.*src/main.ts' || true)
WORKER_COUNT=$(echo "$WORKER_PIDS" | grep -c . || echo 0)
if [[ "${WORKER_COUNT:-0}" -gt 1 ]]; then
  log "Stopping ${WORKER_COUNT} duplicate workers…"
  pkill -f 'Acuerdo/fleethub.*src/main.ts' || true
  sleep 2
fi

log "2. Redis:"
if redis-cli -h 127.0.0.1 ping 2>/dev/null | grep -q PONG; then
  log "Redis (system): PONG on 127.0.0.1:6379"
elif command -v docker &>/dev/null; then
  docker compose up -d redis 2>/dev/null || true
  sleep 2
  if docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; then
    log "Redis (docker): PONG"
  else
    log "WARN: Redis not responding — worker queue/poll will fail"
  fi
else
  log "WARN: redis-cli/docker not found — check REDIS_URL manually"
fi

log "3. Start single worker (if not running):"
if pgrep -f 'Acuerdo/fleethub.*src/main.ts' >/dev/null; then
  log "Worker already running"
else
  nohup npm run worker >> /var/log/fleethub-worker.log 2>&1 &
  sleep 3
  pgrep -af 'Acuerdo/fleethub.*src/main.ts' || log "WARN: worker failed to start"
fi

log "4. API / Web response (localhost):"
curl -sf -o /dev/null -w "  API :4000 → %{http_code} in %{time_total}s\n" http://127.0.0.1:4000/health || echo "  API not responding"
curl -sf -o /dev/null -w "  Web :3000 → %{http_code} in %{time_total}s\n" http://127.0.0.1:3000/ || echo "  Web not responding"

log "5. Postgres connections (fleethub):"
psql "${DATABASE_URL:-postgresql://fleethub:fleethub@localhost:5432/fleethub}" -t -c \
  "SELECT state, count(*) FROM pg_stat_activity WHERE datname='fleethub' GROUP BY state ORDER BY count DESC;" 2>/dev/null || echo "  (psql skipped)"

log "Done. If web is still slow on Cerrar turnos, pending trip volume may need DB tuning (cosculluela ~2800+ pending)."
