#!/usr/bin/env bash
# One-command dev: postgres + logto (Docker) + api + web (host, hot reload).
#
# Idempotent — `docker compose up -d` is a no-op if the services are already
# running. After infra is healthy, hands off to `turbo run dev` in the
# foreground so logs from API and Web stream until you Ctrl-C.
#
# Run `pnpm bootstrap` first (once) to install deps, migrate, and seed.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker not found. See docs/ONBOARDING.md."

say "Ensuring Postgres + Logto are up"
docker compose --env-file .env -f infra/docker-compose.yml up -d postgres logto >/dev/null

say "Waiting for Postgres"
for i in $(seq 1 30); do
  if docker exec fatia-postgres pg_isready -U fatia >/dev/null 2>&1; then
    break
  fi
  if [ "$i" -eq 30 ]; then
    die "Postgres did not become ready in 30s. Try 'pnpm infra:logs'."
  fi
  sleep 1
done

LOGTO_ADMIN_PORT="${LOGTO_ADMIN_PORT:-3002}"
say "Waiting for Logto admin console on :${LOGTO_ADMIN_PORT}"
LOGTO_READY=0
for i in $(seq 1 90); do
  if curl -fs -o /dev/null "http://localhost:${LOGTO_ADMIN_PORT}/" 2>/dev/null; then
    LOGTO_READY=1
    break
  fi
  sleep 1
done
if [ "$LOGTO_READY" -eq 0 ]; then
  warn "Logto didn't respond within 90s — continuing anyway. 'pnpm infra:logs' to inspect."
fi

if [ ! -f .env ]; then
  die ".env not found. Run 'pnpm bootstrap' first."
fi

# Required for API + Web to boot. If any is missing or still a placeholder
# from .env.example, fail loud and point at LOCAL_AUTH.md — booting Turbo
# anyway just crashes API in a loop and leaves stale Web on :3001.
REQUIRED=(
  LOGTO_ENDPOINT
  LOGTO_AUDIENCE
  LOGTO_APP_ID
  LOGTO_APP_SECRET
  LOGTO_MCP_APP_ID
  LOGTO_MCP_APP_SECRET
  LOGTO_COOKIE_SECRET
)
MISSING=()
for var in "${REQUIRED[@]}"; do
  value=$(grep -E "^${var}=" .env 2>/dev/null | head -1 | cut -d= -f2- || true)
  if [ -z "$value" ] || [[ "$value" == replace_* ]]; then
    MISSING+=("$var")
  fi
done

if [ "${#MISSING[@]}" -gt 0 ]; then
  printf '\n\033[1;31m✗ Logto setup not complete.\033[0m\n\n' >&2
  printf 'Missing or placeholder values in .env:\n' >&2
  for v in "${MISSING[@]}"; do printf '  - %s\n' "$v" >&2; done
  cat >&2 <<EOM

This is a one-time setup. Logto OSS doesn't expose a public bootstrap API,
so the admin account + apps must be created via its console.

  1. Open http://localhost:${LOGTO_ADMIN_PORT}/  (Logto is already running)
  2. Follow docs/LOCAL_AUTH.md — ~10 minutes
  3. Re-run: pnpm dev

After this is done once, 'pnpm dev' is one-command-zero-setup until you
run 'pnpm reset:db' (which drops the Postgres volume — Logto's DB lives
there too, so you'd redo this setup).
EOM
  exit 1
fi

cat <<EOF

✓ Infra is up. Starting API + Web with hot reload (Ctrl-C to stop).

  API:           http://localhost:3000
  Web:           http://localhost:3030
  MCP:           http://localhost:3000/mcp
  Logto:         http://localhost:${LOGTO_PORT:-3001}
  Logto admin:   http://localhost:${LOGTO_ADMIN_PORT}

EOF

exec pnpm turbo run dev
