#!/usr/bin/env bash
# Semeia o app M2M de bootstrap no Logto LOCAL (ADR 029).
#
# O Logto OSS nasce sem nenhum app com acesso à Management API do tenant
# `default`, e criar um exige o console. É o ovo e a galinha que deixava o
# setup local manual (docs/LOCAL_AUTH.md). Aqui o app é inserido direto na
# database do Logto, ligado à role "Logto Management API access" que o próprio
# seed do Logto cria — o mesmo resultado do clique no console.
#
# SÓ PARA DESENVOLVIMENTO E CI. Em produção o app M2M é criado no console e as
# credenciais vão para LOGTO_M2M_APP_ID/SECRET (infra/dokploy/README.md).
#
# Idempotente: se LOGTO_M2M_APP_ID já está no .env e existe no Logto, não faz nada.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

die() { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
say() { printf '\033[1;36m▶ %s\033[0m\n' "$*"; }

[ -f .env ] || die ".env não encontrado. Rode 'pnpm bootstrap' antes."

PG_CONTAINER="${PG_CONTAINER:-fatia-postgres}"
PG_USER="$(grep -E '^POSTGRES_USER=' .env | cut -d= -f2- || true)"
PG_USER="${PG_USER:-fatia}"

psql_logto() {
  docker exec -i "$PG_CONTAINER" psql -U "$PG_USER" -d logto -v ON_ERROR_STOP=1 -At "$@"
}

env_get() { grep -E "^$1=" .env | head -1 | cut -d= -f2- || true; }
env_set() {
  if grep -qE "^$1=" .env; then
    # `|` como delimitador: secrets do Logto não têm `|`.
    sed -i.bak "s|^$1=.*|$1=$2|" .env && rm -f .env.bak
  else
    printf '%s=%s\n' "$1" "$2" >>.env
  fi
}

ROLE_ID="$(psql_logto -c "select id from roles where tenant_id='default' and name='Logto Management API access'")"
[ -n "$ROLE_ID" ] || die "Role 'Logto Management API access' não existe. O Logto já terminou o primeiro boot?"

APP_ID="$(env_get LOGTO_M2M_APP_ID)"
if [ -n "$APP_ID" ] && [ -n "$(psql_logto -c "select id from applications where id='$APP_ID'")" ]; then
  say "App M2M $APP_ID já existe — nada a fazer"
  exit 0
fi

APP_ID="fatia-bootstrap-m2m"
SECRET="$(openssl rand -hex 24)"

psql_logto <<SQL
insert into applications (tenant_id, id, name, secret, description, type, oidc_client_metadata)
values ('default', '$APP_ID', 'Fatia bootstrap (local)', '$SECRET',
        'Criado por scripts/logto-seed-m2m.sh — só desenvolvimento', 'MachineToMachine',
        '{"redirectUris": [], "postLogoutRedirectUris": []}')
on conflict (id) do update set secret = excluded.secret;

insert into applications_roles (tenant_id, id, application_id, role_id)
values ('default', 'fatia-bootstrap-role', '$APP_ID', '$ROLE_ID')
on conflict do nothing;
SQL

env_set LOGTO_M2M_APP_ID "$APP_ID"
env_set LOGTO_M2M_APP_SECRET "$SECRET"
say "App M2M $APP_ID criado e gravado no .env"
