#!/usr/bin/env bash
# Safely run the fleet worker in the foreground for debugging:
# 1. Stop systemd fleethub-worker (releases singleton lock)
# 2. Run WORKER_MODE=fleet in foreground
# 3. On exit (Ctrl+C or crash), restart systemd worker
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

systemctl_cmd() {
  if [[ "$(id -u)" -eq 0 ]]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

worker_was_active=0
restored=0
if systemctl_cmd is-active --quiet fleethub-worker.service 2>/dev/null; then
  worker_was_active=1
fi

restore_systemd_worker() {
  if [[ "$restored" -eq 1 ]]; then
    return 0
  fi
  restored=1
  if [[ "$worker_was_active" -eq 1 ]]; then
    echo "[worker-debug] Restoring fleethub-worker.service…"
    systemctl_cmd start fleethub-worker.service || true
  fi
}

on_exit() {
  local code=$?
  restore_systemd_worker
  exit "$code"
}

trap on_exit EXIT INT TERM

if [[ "$worker_was_active" -eq 1 ]]; then
  echo "[worker-debug] Stopping fleethub-worker.service so manual worker can take the lock…"
  systemctl_cmd stop fleethub-worker.service
  sleep 2
fi

echo "[worker-debug] Starting manual fleet worker (Ctrl+C restores systemd worker)…"
npm run fleet -w @fleethub/worker
