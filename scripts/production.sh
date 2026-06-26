#!/usr/bin/env bash
# FleetHub — production on VPS (survives SSH disconnect via systemd).
#
# Usage:
#   ./scripts/production.sh install   # build + install systemd units + enable on boot
#   ./scripts/production.sh start     # start stack now
#   ./scripts/production.sh stop      # stop stack
#   ./scripts/production.sh restart   # restart stack
#   ./scripts/production.sh status    # show service status
#   ./scripts/production.sh logs      # follow API + web logs
#   ./scripts/production.sh build     # npm ci + production build only
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

SYSTEMD_DIR="/etc/systemd/system"
UNIT_NAMES=(fleethub-docker fleethub-api fleethub-web fleethub-worker fleethub.target)

log() { printf '\n\033[1;36m[fleethub]\033[0m %s\n' "$*"; }
die() { printf '\n\033[1;31m[fleethub] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

require_root_for_install() {
  if [[ "$(id -u)" -ne 0 ]] && [[ "${1:-}" == "install" ]]; then
    die "Run install as root: sudo ./scripts/production.sh install"
  fi
}

detect_docker_compose() {
  if docker compose version &>/dev/null; then
    echo "docker compose"
  elif command -v docker-compose &>/dev/null; then
    echo "docker-compose"
  else
    die "Docker Compose not found. Install Docker Engine + compose plugin."
  fi
}

detect_npm() {
  if command -v npm &>/dev/null; then
    command -v npm
    return
  fi
  die "npm not found in PATH. Install Node.js 20+."
}

check_env_files() {
  [[ -f "$ROOT/.env" ]] || die "Missing $ROOT/.env — copy from .env.example and configure."
  [[ -f "$ROOT/apps/web/.env.local" ]] || die "Missing $ROOT/apps/web/.env.local — copy from apps/web/.env.example."
}

do_build() {
  log "Installing dependencies (npm ci)…"
  npm ci
  log "Production build (web + server)…"
  npm run build
  log "Build finished."
}

render_unit() {
  local template="$1"
  local out="$2"
  local fleethub_user fleethub_group npm_bin docker_compose docker_up docker_down

  fleethub_user="${SUDO_USER:-${USER:-root}}"
  fleethub_group="$(id -gn "$fleethub_user" 2>/dev/null || echo "$fleethub_user")"
  npm_bin="$(sudo -u "$fleethub_user" bash -lc 'command -v npm' 2>/dev/null || detect_npm)"
  docker_compose="$(detect_docker_compose)"
  docker_up="${docker_compose} up -d"
  docker_down="${docker_compose} down"

  sed \
    -e "s|%FLEETHUB_ROOT%|$ROOT|g" \
    -e "s|%FLEETHUB_USER%|$fleethub_user|g" \
    -e "s|%FLEETHUB_GROUP%|$fleethub_group|g" \
    -e "s|%NPM_BIN%|$npm_bin|g" \
    -e "s|%DOCKER_COMPOSE_UP%|$docker_up|g" \
    -e "s|%DOCKER_COMPOSE_DOWN%|$docker_down|g" \
    "$template" >"$out"
}

do_install() {
  require_root_for_install install
  check_env_files

  if ! command -v docker &>/dev/null; then
    die "Docker not found. Install Docker before production install."
  fi

  if ! command -v node &>/dev/null; then
    die "Node.js not found. Requires Node 20+."
  fi

  log "Building application as user ${SUDO_USER:-root}…"
  if [[ "$(id -u)" -eq 0 ]] && [[ -n "${SUDO_USER:-}" ]]; then
    sudo -u "$SUDO_USER" bash -lc "cd '$ROOT' && ./scripts/production.sh build"
  else
    do_build
  fi

  log "Installing systemd units into $SYSTEMD_DIR …"
  render_unit "$ROOT/deploy/systemd/fleethub-docker.service" "$SYSTEMD_DIR/fleethub-docker.service"
  render_unit "$ROOT/deploy/systemd/fleethub-api.service" "$SYSTEMD_DIR/fleethub-api.service"
  render_unit "$ROOT/deploy/systemd/fleethub-web.service" "$SYSTEMD_DIR/fleethub-web.service"
  render_unit "$ROOT/deploy/systemd/fleethub-worker.service" "$SYSTEMD_DIR/fleethub-worker.service"
  render_unit "$ROOT/deploy/systemd/fleethub.target" "$SYSTEMD_DIR/fleethub.target"

  systemctl daemon-reload
  systemctl enable fleethub.target
  systemctl restart fleethub.target

  log "FleetHub is enabled on boot and running."
  echo ""
  echo "  Web:  check NEXT_PUBLIC_APP_URL in apps/web/.env.local (default http://127.0.0.1:3000)"
  echo "  API:  port 4000 (NEXT_PUBLIC_SERVER_URL should be http://127.0.0.1:4000)"
  echo ""
  echo "  sudo ./scripts/production.sh status"
  echo "  sudo ./scripts/production.sh logs"
  echo "  journalctl -u fleethub-api -u fleethub-web -u fleethub-worker -f"
}

require_units_installed() {
  if [[ -f "$SYSTEMD_DIR/fleethub.target" ]]; then
    return 0
  fi
  die "systemd units not installed. Run once from repo root:

  cd $ROOT
  sudo ./scripts/production.sh install

  (install copies units to $SYSTEMD_DIR and enables boot startup)"
}

systemctl_user() {
  if [[ "$(id -u)" -eq 0 ]]; then
    systemctl "$@"
  else
    sudo systemctl "$@"
  fi
}

do_start() {
  require_units_installed
  systemctl_user start fleethub.target
  log "Started fleethub.target"
}

do_stop() {
  require_units_installed
  systemctl_user stop fleethub.target
  log "Stopped fleethub.target"
}

do_restart() {
  require_units_installed
  systemctl_user restart fleethub.target
  log "Restarted fleethub.target"
}

do_status() {
  require_units_installed
  systemctl_user status fleethub-docker fleethub-api fleethub-web fleethub-worker fleethub.target --no-pager || true
  echo ""
  curl -sf "http://127.0.0.1:4000/health" && echo " API health: OK" || echo " API health: not responding on :4000"
  curl -sf -o /dev/null "http://127.0.0.1:3000" && echo " Web: OK on :3000" || echo " Web: not responding on :3000"
}

do_logs() {
  require_units_installed
  journalctl -u fleethub-api -u fleethub-web -u fleethub-worker -f
}

do_check_duplicates() {
  bash "$ROOT/scripts/check-fleethub-duplicates.sh"
}

do_worker_debug() {
  bash "$ROOT/scripts/worker-debug.sh"
}

usage() {
  cat <<EOF
FleetHub production helper (systemd — keeps running after SSH exit)

  ./scripts/production.sh install           Install units, build, enable on boot, start
  ./scripts/production.sh build             npm ci + npm run build
  ./scripts/production.sh start             Start services
  ./scripts/production.sh stop              Stop services
  ./scripts/production.sh restart           Restart services
  ./scripts/production.sh status            Status + health checks
  ./scripts/production.sh logs              Follow API + web logs
  ./scripts/production.sh check-duplicates    Detect API/Web/Worker outside systemd
  ./scripts/production.sh worker-debug      Stop systemd worker, run manual worker, restore on exit

Before install:
  1. cp .env.example .env  &&  edit secrets / DATABASE_URL
  2. cp apps/web/.env.example apps/web/.env.local
  3. docker compose up -d   (or let install start Postgres/Redis)
  4. npm run db:setup && npm run db:seed   (first time only)

EOF
}

cmd="${1:-}"
case "$cmd" in
  install) do_install ;;
  build) check_env_files; do_build ;;
  start) do_start ;;
  stop) do_stop ;;
  restart) do_restart ;;
  status) do_status ;;
  logs) do_logs ;;
  check-duplicates) do_check_duplicates ;;
  worker-debug) do_worker_debug ;;
  -h|--help|help|"") usage ;;
  *) die "Unknown command: $cmd. Run: ./scripts/production.sh help" ;;
esac
