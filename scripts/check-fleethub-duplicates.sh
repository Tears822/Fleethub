#!/usr/bin/env bash
# Detect FleetHub API / Web / Worker processes running outside systemd.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FLEETHUB_ROOT="${FLEETHUB_ROOT:-$ROOT}"
LOCK_FILE="${FLEETHUB_WORKER_LOCK_FILE:-/tmp/fleethub-worker-fleet.lock}"

log() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
fail() { printf 'FAIL: %s\n' "$*" >&2; exit 1; }

cgroup_procs() {
  local unit="$1"
  local cg
  cg="$(systemctl show "$unit" -p ControlGroup --value 2>/dev/null || true)"
  [[ -n "$cg" ]] || return 0
  local procs="/sys/fs/cgroup${cg}/cgroup.procs"
  if [[ -f "$procs" ]]; then
    cat "$procs"
    return 0
  fi
  find "/sys/fs/cgroup${cg}" -name cgroup.procs 2>/dev/null | while read -r f; do
    cat "$f" 2>/dev/null
  done
}

collect_systemd_pid_set() {
  local pids=""
  for unit in fleethub-api.service fleethub-web.service fleethub-worker.service; do
    pids+="$(cgroup_procs "$unit")"$'\n'
  done
  echo "$pids" | awk 'NF' | sort -u
}

in_pid_set() {
  local pid="$1"
  local set="$2"
  grep -qx "$pid" <<<"$set"
}

describe_pid() {
  local pid="$1"
  local cwd cmd
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || echo "?")"
  cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || echo "?")"
  printf '  pid=%s cwd=%s\n    %s\n' "$pid" "$cwd" "$cmd"
}

matches_fleethub_process() {
  local pid="$1"
  local cmd="$2"
  [[ "$cmd" == *"$FLEETHUB_ROOT"* ]] && return 0
  local cwd
  cwd="$(readlink "/proc/$pid/cwd" 2>/dev/null || true)"
  [[ "$cwd" == "$FLEETHUB_ROOT"* ]]
}

log "FleetHub duplicate process check"
log "Repo: $FLEETHUB_ROOT"
log ""

managed="$(collect_systemd_pid_set)"
issues=0

scan_role() {
  local label="$1"
  local pattern="$2"
  local orphan_pids=""
  local match_count=0
  local managed_count=0

  while read -r pid; do
    [[ -n "$pid" && "$pid" =~ ^[0-9]+$ ]] || continue
    kill -0 "$pid" 2>/dev/null || continue
    local cmd
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    matches_fleethub_process "$pid" "$cmd" || continue
    [[ "$cmd" =~ $pattern ]] || continue
    match_count=$((match_count + 1))
    if in_pid_set "$pid" "$managed"; then
      managed_count=$((managed_count + 1))
    else
      orphan_pids+="${pid}"$'\n'
    fi
  done < <(ps -eo pid= 2>/dev/null || true)

  log "[$label] processes=$match_count in_systemd=$managed_count"
  if [[ -n "$orphan_pids" ]]; then
    issues=$((issues + 1))
    warn "$label process(es) outside systemd:"
    while read -r pid; do
      [[ -n "$pid" ]] || continue
      describe_pid "$pid"
    done <<<"$orphan_pids"
  fi
}

scan_role "worker" 'src/main\.ts'
scan_role "api" 'src/index\.ts'
scan_role "web" 'next start|next-server'

if [[ -f "$LOCK_FILE" ]]; then
  lock_pid="$(awk 'NR==1{print $1}' "$LOCK_FILE" 2>/dev/null || true)"
  log ""
  log "[worker-lock] $LOCK_FILE -> pid ${lock_pid:-?}"
  if [[ -n "${lock_pid:-}" ]] && kill -0 "$lock_pid" 2>/dev/null; then
    if ! in_pid_set "$lock_pid" "$managed"; then
      issues=$((issues + 1))
      warn "Lock owner pid $lock_pid is not in fleethub-worker.service cgroup."
      describe_pid "$lock_pid"
    fi
  else
    warn "Stale worker lock file (pid not running)."
    issues=$((issues + 1))
  fi
else
  log ""
  log "[worker-lock] not present (worker may be stopped)"
fi

log ""
if [[ "$issues" -gt 0 ]]; then
  fail "Found $issues issue(s). Fix: sudo systemctl restart fleethub-worker  |  Debug safely: ./scripts/worker-debug.sh"
fi

log "OK — no duplicate FleetHub services detected."
