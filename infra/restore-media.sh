#!/usr/bin/env bash
# Restaura a mídia da comunidade a partir da cópia cifrada do backup (#349).
#
# Baixa $S3_BUCKET/media/, decifra cada objeto com a BACKUP_PASSPHRASE e sobe
# para o bucket de destino, na mesma chave. Com DATABASE_CONTAINER definido,
# confere em seguida que toda `MediaFile` READY do banco restaurado existe no
# bucket — a prova de que banco e imagens voltaram juntos.
#
# Uso (no host, com o .env.backup carregado ou as variáveis exportadas):
#
#   RESTORE_S3_BUCKET=fatia-media-restaurado \
#   RESTORE_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com \
#   RESTORE_S3_ACCESS_KEY_ID=... RESTORE_S3_SECRET_ACCESS_KEY=... \
#   DATABASE_CONTAINER=fatia-restore-test DATABASE_USER=fatia \
#   infra/restore-media.sh
#
# Variáveis:
#   S3_BUCKET, S3_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY,
#   AWS_DEFAULT_REGION   o offsite, como no backup.sh (leitura basta)
#   BACKUP_PASSPHRASE    a mesma dos backups
#   RESTORE_S3_BUCKET    bucket de destino (nome, sem s3://). Nunca o de produção
#                        com dados: o envio sobrescreve chaves iguais
#   RESTORE_S3_ENDPOINT, RESTORE_S3_ACCESS_KEY_ID, RESTORE_S3_SECRET_ACCESS_KEY,
#   RESTORE_S3_REGION    (default auto)
#   DATABASE_CONTAINER   opcional: container do Postgres restaurado, para conferir
#   DATABASE_USER        (default fatia) e DATABASE_NAME (default fatia)

set -euo pipefail

ENV_FILE="$(dirname "$(readlink -f "$0")")/.env.backup"
# O ambiente vence o arquivo, como no backup.sh.
_OVERRIDES=()
for _v in S3_BUCKET S3_ENDPOINT AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION \
          BACKUP_PASSPHRASE; do
  [ -n "${!_v+set}" ] && _OVERRIDES+=("$_v=${!_v}")
done
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a && . "$ENV_FILE" && set +a
fi
for _kv in ${_OVERRIDES+"${_OVERRIDES[@]}"}; do export "${_kv?}"; done

log() { echo "[$(date -Iseconds)] $*"; }
fail() { log "ERRO: $1"; exit 1; }

for v in S3_BUCKET BACKUP_PASSPHRASE RESTORE_S3_BUCKET RESTORE_S3_ENDPOINT; do
  [ -n "${!v:-}" ] || fail "$v não definida"
done
command -v aws >/dev/null 2>&1 || fail 'aws cli não instalado'
command -v gpg >/dev/null 2>&1 || fail 'gpg não instalado'

ORIGEM=(aws)
[ -n "${S3_ENDPOINT:-}" ] && ORIGEM+=(--endpoint-url "$S3_ENDPOINT")
destino() {
  AWS_ACCESS_KEY_ID="${RESTORE_S3_ACCESS_KEY_ID:-}" \
  AWS_SECRET_ACCESS_KEY="${RESTORE_S3_SECRET_ACCESS_KEY:-}" \
  AWS_DEFAULT_REGION="${RESTORE_S3_REGION:-auto}" \
    aws --endpoint-url "$RESTORE_S3_ENDPOINT" "$@"
}

TRABALHO=$(mktemp -d)
trap 'rm -rf "$TRABALHO"' EXIT
mkdir -p "$TRABALHO/selado" "$TRABALHO/claro"

log "Baixando $S3_BUCKET/media"
"${ORIGEM[@]}" s3 sync "$S3_BUCKET/media" "$TRABALHO/selado" --only-show-errors

total=0
while IFS= read -r -d '' selado; do
  rel="${selado#"$TRABALHO/selado"/}"
  saida="$TRABALHO/claro/${rel%.gpg}"
  mkdir -p "$(dirname "$saida")"
  printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --passphrase-fd 0 \
    --decrypt --output "$saida" "$selado" || fail "não decifrou $rel (passphrase errada?)"
  total=$((total + 1))
done < <(find "$TRABALHO/selado" -type f -name '*.gpg' -print0)
log "$total objeto(s) decifrado(s)"

log "Enviando para s3://$RESTORE_S3_BUCKET"
destino s3 sync "$TRABALHO/claro" "s3://$RESTORE_S3_BUCKET" --only-show-errors

if [ -n "${DATABASE_CONTAINER:-}" ]; then
  # Toda MediaFile pronta precisa do objeto. PENDING fica de fora: é envio que
  # nunca terminou, e a faxina da API o apaga em 24 h.
  docker exec "$DATABASE_CONTAINER" psql -U "${DATABASE_USER:-fatia}" -d "${DATABASE_NAME:-fatia}" \
    -tAc "SELECT key FROM \"MediaFile\" WHERE status = 'READY' ORDER BY key" > "$TRABALHO/no-banco"
  destino s3 ls "s3://$RESTORE_S3_BUCKET" --recursive | awk '{print $4}' | sort > "$TRABALHO/no-bucket"
  faltando=$(comm -23 <(sort "$TRABALHO/no-banco") "$TRABALHO/no-bucket" | grep -c . || true)
  no_banco=$(grep -c . "$TRABALHO/no-banco" || true)
  if [ "$faltando" != 0 ]; then
    comm -23 <(sort "$TRABALHO/no-banco") "$TRABALHO/no-bucket" | head -20
    fail "$faltando de $no_banco MediaFile READY sem objeto no bucket restaurado"
  fi
  log "Conferido: as $no_banco MediaFile READY do banco existem no bucket"
fi

log "Restore da mídia concluído"
