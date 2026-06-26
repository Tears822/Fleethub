#!/usr/bin/env bash
# Create local Postgres + apply Prisma schema, RLS, and seed data.
# Usage: from `fleethub/`: copy `.env.example` to `.env`, then `npm run db:setup`

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env ]]; then
  echo "Missing .env — copy .env.example to .env and set DATABASE_URL, AUTH_SECRET, NEXT_PUBLIC_*"
  exit 1
fi

# Allow optional vars in .env; secrets with `$` must be single-quoted in .env (see .env.example).
set -a
set +u
# shellcheck disable=SC1091
source .env
set -u
set +a

echo ">> Starting Docker services (Postgres + Redis)…"
docker compose up -d

echo ">> Waiting for Postgres…"
for _ in {1..40}; do
  if docker compose exec -T postgres pg_isready -U fleethub -d fleethub >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! docker compose exec -T postgres pg_isready -U fleethub -d fleethub >/dev/null 2>&1; then
  echo "Postgres did not become ready in time."
  exit 1
fi

echo ">> Prisma db push…"
npm run db:push -w @fleethub/db

echo ">> Apply RLS policies…"
npm run db:apply-rls

echo ">> Seed demo tenants…"
npm run db:seed

echo ">> Create application role (fleethub_app for RLS at runtime)…"
npm run db:create-app-role

echo ">> RLS isolation check (fleethub_app)…"
if npm run test:tenant:rls; then
  echo ">> RLS check passed."
else
  echo ">> WARN: test:tenant:rls failed — review DATABASE_URL and db:apply-rls."
fi

echo ">> Done."
echo "   - Dev: npm run dev  (apps/web/.env.local → fleethub_app + NEXT_PUBLIC_SERVER_URL)"
echo "   - Acceptance: npm run test:acceptance  (API must be running for smoke)"
