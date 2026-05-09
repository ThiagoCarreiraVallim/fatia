#!/usr/bin/env bash
# Backup do Postgres do Fatia (databases `fatia` e `logto`).
# Como rodar via cron no host:
#   0 4 * * * /opt/fatia/infra/backup.sh >> /var/log/fatia-backup.log 2>&1
#
# Faz um pg_dumpall do container, comprime, e mantém retenção de 7 dias.

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/fatia/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
CONTAINER="${CONTAINER:-fatia-postgres}"
PG_USER="${POSTGRES_USER:-fatia}"

mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M%S)
OUT="$BACKUP_DIR/fatia-$TS.sql.gz"

echo "[$(date -Iseconds)] Backup → $OUT"
docker exec "$CONTAINER" pg_dumpall -U "$PG_USER" --clean --if-exists | gzip > "$OUT"

# Retenção: remove dumps com mais de N dias
find "$BACKUP_DIR" -name 'fatia-*.sql.gz' -mtime +"$RETENTION_DAYS" -delete

echo "[$(date -Iseconds)] OK ($(du -h "$OUT" | cut -f1))"
