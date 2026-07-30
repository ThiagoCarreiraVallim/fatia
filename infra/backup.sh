#!/usr/bin/env bash
# Backup do Postgres do Fatia (databases `fatia` e `logto`).
#
# Faz pg_dumpall do container, comprime, opcionalmente cifra, mantém retenção
# local e opcionalmente replica para storage S3-compatível offsite.
#
# Como rodar via cron no host:
#   0 4 * * * /opt/fatia/infra/backup.sh >> /var/log/fatia-backup.log 2>&1
#
# ---------------------------------------------------------------------------
# Variáveis
#
#   BACKUP_DIR       Onde guardar localmente        (default /opt/fatia/backups)
#   RETENTION_DAYS   Retenção local em dias         (default 7)
#   CONTAINER        Nome do container do Postgres  (default fatia-postgres)
#   POSTGRES_USER    Usuário do dump                (default fatia)
#
#   BACKUP_PASSPHRASE   Se definida, cifra o dump com AES-256 (gpg simétrico).
#                       SEM ela o dump vai em claro — nunca envie offsite assim.
#
#   Offsite (opcional; só ativa se S3_BUCKET estiver definido):
#   S3_BUCKET             ex.: s3://fatia-backups  ou  b2://fatia-backups
#   S3_ENDPOINT           ex.: https://s3.us-west-004.backblazeb2.com
#   AWS_ACCESS_KEY_ID     credencial
#   AWS_SECRET_ACCESS_KEY credencial
#   S3_RETENTION_DAYS     Retenção offsite em dias  (default 30)
#
#   ALERT_WEBHOOK    URL que recebe POST JSON em caso de falha (opcional).
# ---------------------------------------------------------------------------
#
# ATENÇÃO: backup não testado não conta. Ver o drill de restore em
# docs/OPERATIONS.md.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/fatia/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
CONTAINER="${CONTAINER:-fatia-postgres}"
PG_USER="${POSTGRES_USER:-fatia}"
S3_RETENTION_DAYS="${S3_RETENTION_DAYS:-30}"

log() { echo "[$(date -Iseconds)] $*"; }

# Notifica falha antes de morrer. O `|| true` garante que um webhook fora do ar
# não mascare o código de saída real do backup.
fail() {
  local message="$1"
  log "ERRO: $message"
  if [ -n "${ALERT_WEBHOOK:-}" ]; then
    curl -fsS -m 10 -X POST "$ALERT_WEBHOOK" \
      -H 'Content-Type: application/json' \
      -d "$(printf '{"service":"fatia-backup","status":"failed","host":"%s","message":"%s"}' \
            "$(hostname)" "$message")" >/dev/null 2>&1 || true
  fi
  exit 1
}

# Qualquer comando que falhe cai aqui com a linha, em vez de morrer em silêncio.
trap 'fail "falha na linha $LINENO"' ERR

mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/fatia-$TS.sql.gz"
EXT="sql.gz"

log "Dump → $OUT"
docker exec "$CONTAINER" pg_dumpall -U "$PG_USER" --clean --if-exists | gzip > "$OUT"

# Dump vazio ou truncado é pior que dump ausente: passa desapercebido até a hora
# do restore. 1 KB é generoso — um dump real do Fatia passa de centenas de KB.
SIZE=$(stat -c %s "$OUT" 2>/dev/null || stat -f %z "$OUT")
if [ "$SIZE" -lt 1024 ]; then
  fail "dump suspeito: apenas ${SIZE} bytes em $OUT"
fi
if ! gzip -t "$OUT" 2>/dev/null; then
  fail "gzip corrompido em $OUT"
fi
log "Dump OK ($(du -h "$OUT" | cut -f1))"

# --- Cifra, se houver passphrase ---
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  command -v gpg >/dev/null 2>&1 || fail 'BACKUP_PASSPHRASE definida mas gpg não está instalado'
  log "Cifrando com AES-256"
  printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet \
    --passphrase-fd 0 --symmetric --cipher-algo AES256 \
    --output "$OUT.gpg" "$OUT"
  rm -f "$OUT"
  OUT="$OUT.gpg"
  EXT="sql.gz.gpg"
fi

# --- Replica offsite ---
if [ -n "${S3_BUCKET:-}" ]; then
  command -v aws >/dev/null 2>&1 || fail 'S3_BUCKET definido mas o aws cli não está instalado'

  if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
    fail 'recusando enviar backup NÃO CIFRADO para offsite. Defina BACKUP_PASSPHRASE.'
  fi

  ENDPOINT_ARG=()
  [ -n "${S3_ENDPOINT:-}" ] && ENDPOINT_ARG=(--endpoint-url "$S3_ENDPOINT")

  log "Enviando para $S3_BUCKET"
  aws "${ENDPOINT_ARG[@]}" s3 cp "$OUT" "$S3_BUCKET/$(basename "$OUT")" --only-show-errors

  # Confirma que o objeto existe do outro lado. `cp` bem-sucedido não é prova
  # suficiente quando o endpoint é S3-compatível de terceiro.
  aws "${ENDPOINT_ARG[@]}" s3 ls "$S3_BUCKET/$(basename "$OUT")" >/dev/null \
    || fail "upload não verificável: objeto ausente em $S3_BUCKET"
  log "Offsite OK"

  # Retenção offsite. Comparação por data no nome do arquivo (fatia-YYYYMMDD-...),
  # que é o que temos sem depender de lifecycle policy do provedor.
  CUTOFF=$(date -d "-${S3_RETENTION_DAYS} days" +%Y%m%d 2>/dev/null \
           || date -v "-${S3_RETENTION_DAYS}d" +%Y%m%d)
  aws "${ENDPOINT_ARG[@]}" s3 ls "$S3_BUCKET/" | awk '{print $4}' | while read -r key; do
    [ -z "$key" ] && continue
    keydate=$(echo "$key" | sed -n 's/^fatia-\([0-9]\{8\}\)-.*/\1/p')
    [ -z "$keydate" ] && continue
    if [ "$keydate" -lt "$CUTOFF" ]; then
      log "Removendo offsite antigo: $key"
      aws "${ENDPOINT_ARG[@]}" s3 rm "$S3_BUCKET/$key" --only-show-errors || true
    fi
  done
else
  log "AVISO: S3_BUCKET não definido — backup existe apenas neste host."
  log "        Perder o VPS significa perder os backups. Ver docs/OPERATIONS.md."
fi

# --- Retenção local ---
find "$BACKUP_DIR" -name "fatia-*.${EXT}" -mtime +"$RETENTION_DAYS" -delete
find "$BACKUP_DIR" -name 'fatia-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete 2>/dev/null || true

log "Concluído: $OUT"
