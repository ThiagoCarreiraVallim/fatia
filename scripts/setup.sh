#!/usr/bin/env bash
# One-command bootstrap for local development.
#
# Steps:
#   1. enable corepack (so pnpm pinned in package.json is used)
#   2. install workspace deps
#   3. copy .env from .env.example if missing
#   4. start Postgres via docker compose
#   5. wait until Postgres is healthy
#   6. run Prisma migrations
#   7. seed the database (TACO foods + exercises)
#
# Re-running is safe: install/migrate/seed are idempotent. Use `pnpm reset:db`
# to wipe the database volume and re-seed from scratch.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

require() {
  command -v "$1" >/dev/null 2>&1 || die "Missing prerequisite: $1. See docs/ONBOARDING.md."
}

require node
require docker

say "Enabling corepack (pins pnpm to the version in package.json)"
if command -v corepack >/dev/null 2>&1; then
  corepack enable
else
  warn "corepack not found — falling back to global pnpm. Install Node >= 20."
fi

say "Installing dependencies"
pnpm install

if [ ! -f .env ]; then
  say "Creating .env from .env.example"
  cp .env.example .env
  warn ".env was just created from the example — review it before exposing the API publicly."
else
  say ".env already exists — leaving it alone"
fi

say "Starting Postgres (docker compose)"
pnpm infra:up

say "Waiting for Postgres to be ready"
for i in $(seq 1 30); do
  if docker exec fatia-postgres pg_isready -U fatia >/dev/null 2>&1; then
    printf '  ready after %ss\n' "$i"
    break
  fi
  if [ "$i" -eq 30 ]; then
    die "Postgres did not become ready in 30s. Try 'pnpm infra:logs'."
  fi
  sleep 1
done

say "Generating Prisma client"
pnpm db:generate

say "Running Prisma migrations"
pnpm db:migrate

say "Seeding the database (TACO foods + exercises)"
pnpm db:seed

cat <<'EOF'

✓ Setup complete.

  Next steps:
    pnpm dev            # run API + Web with hot reload
    pnpm infra:logs     # tail Postgres / Logto logs
    pnpm reset:db       # wipe the DB volume and re-seed

  API:   http://localhost:3000
  Web:   http://localhost:3001
  MCP:   http://localhost:3000/mcp

  Auth setup (Logto): docs/LOCAL_AUTH.md
  MCP local testing:  docs/MCP_LOCAL.md

EOF
