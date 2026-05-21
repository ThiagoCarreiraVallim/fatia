#!/usr/bin/env bash
# Nuke the local Postgres volume and re-seed from scratch.
#
# Destructive — only intended for development.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m! %s\033[0m\n' "$*" >&2; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [ "${CI:-}" = "true" ]; then
  die "Refusing to run in CI. This script wipes the local database."
fi

if [ -t 0 ] && [ "${YES:-}" != "1" ]; then
  read -rp "This will DROP the local Postgres volume and lose all data. Continue? [y/N] " ans
  case "$ans" in
    y|Y|yes|YES) ;;
    *) die "Aborted." ;;
  esac
fi

say "Stopping containers and removing volumes"
docker compose --env-file .env -f infra/docker-compose.yml down -v

say "Starting Postgres again"
pnpm infra:up

say "Waiting for Postgres to be ready"
for i in $(seq 1 30); do
  if docker exec fatia-postgres pg_isready -U fatia >/dev/null 2>&1; then
    printf '  ready after %ss\n' "$i"
    break
  fi
  if [ "$i" -eq 30 ]; then
    die "Postgres did not become ready in 30s."
  fi
  sleep 1
done

say "Running migrations"
pnpm db:migrate

say "Seeding"
pnpm db:seed

say "Done. Fresh database is ready."
