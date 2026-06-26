#!/usr/bin/env bash
# Acceptance: unit RBAC, RLS (fleethub_app), deploy env, API role smoke (server must be up).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo ">> RBAC unit tests"
npm run test:rbac

echo ">> Deploy environment check"
npx tsx scripts/verify-deploy-env.ts

echo ">> RLS isolation (fleethub_app)"
npm run test:tenant:rls

if curl -sf "${FLEETHUB_API_URL:-http://127.0.0.1:4000}/health" >/dev/null 2>&1; then
  echo ">> API RBAC smoke"
  npx tsx scripts/role-api-smoke.ts
else
  echo ">> SKIP API smoke — start API: npm run dev:server  (or npm run dev)"
  echo "   Then: npm run test:smoke"
fi

echo ">> Acceptance checks finished."
