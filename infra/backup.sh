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
#
#   PG_INSTANCES     Instâncias a dumpar, separadas por espaço, no formato
#                    `rotulo:prefixo-do-container:usuario`. Uma entrada por CLUSTER
#                    Postgres — não por database.
#                      ex.: "fatia:fatia-postgres:postgres logto:fatia-logto:postgres"
#                    O container é resolvido por PREFIXO (o nome no Swarm muda
#                    a cada redeploy); casar com 0 ou 2+ é erro.
#                    Se qualquer uma falhar, o backup inteiro falha: cobertura
#                    parcial silenciosa é o modo de falha que este script existe
#                    para evitar.
#
#   CONTAINER        (legado) usado só se PG_INSTANCES não estiver definida
#   POSTGRES_USER    (legado) idem
#
#   BACKUP_PASSPHRASE   Se definida, cifra o dump com AES-256 (gpg simétrico).
#                       SEM ela o dump vai em claro — nunca envie offsite assim.
#
#   Offsite (opcional; só ativa se S3_BUCKET estiver definido):
#   S3_BUCKET             ex.: s3://fatia-backups  ou  b2://fatia-backups
#   S3_ENDPOINT           ex.: https://s3.us-west-004.backblazeb2.com
#   AWS_ACCESS_KEY_ID     credencial
#   AWS_SECRET_ACCESS_KEY credencial
#   AWS_DEFAULT_REGION    obrigatória para R2 (`auto`); o aws cli recusa
#                         qualquer chamada sem região, mesmo com endpoint próprio
#   S3_RETENTION_DAYS     Retenção offsite em dias  (default 30)
#
#   ALERT_WEBHOOK    URL que recebe POST JSON em caso de falha (opcional).
# ---------------------------------------------------------------------------
#
# ATENÇÃO: backup não testado não conta. Ver o drill de restore em
# docs/OPERATIONS.md.

set -euo pipefail

# Carrega .env.backup ao lado do script, se existir. O cron não herda ambiente,
# então sem isto seria preciso repetir todas as variáveis na crontab — e
# credencial em crontab fica legível por qualquer um que rode `crontab -l`.
ENV_FILE="$(dirname "$(readlink -f "$0")")/.env.backup"

# O ambiente tem precedência sobre o arquivo. Isso não sai de graça: `. arquivo`
# SOBRESCREVE variável já exportada, então `CONTAINER=x backup.sh` seria
# silenciosamente ignorado — e é exatamente assim que docs/OPERATIONS.md manda
# testar o alerta de falha. Sem isto, o teste do alerta rodaria um backup normal
# e você concluiria que o alerta funciona.
_OVERRIDES=()
for _v in PG_INSTANCES CONTAINER POSTGRES_USER BACKUP_DIR RETENTION_DAYS \
          BACKUP_PASSPHRASE S3_BUCKET S3_ENDPOINT S3_RETENTION_DAYS \
          AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_DEFAULT_REGION ALERT_WEBHOOK; do
  # `+set` e não `:-`: precisa distinguir "não definida" de "definida vazia",
  # senão não dá para desligar a cifra ou o offsite pela linha de comando.
  [ -n "${!_v+set}" ] && _OVERRIDES+=("$_v=${!_v}")
done

if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a && . "$ENV_FILE" && set +a
fi

for _kv in ${_OVERRIDES+"${_OVERRIDES[@]}"}; do export "${_kv?}"; done

BACKUP_DIR="${BACKUP_DIR:-/opt/fatia/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
S3_RETENTION_DAYS="${S3_RETENTION_DAYS:-30}"

# O Fatia roda DOIS clusters Postgres separados: um da aplicação e um do Logto.
# `pg_dumpall` cobre todos os databases de UM cluster, não os dois — dumpar só
# um traria os dados sem as contas, ou o contrário, e isso só apareceria na hora
# do restore.
PG_INSTANCES="${PG_INSTANCES:-}"
if [ -z "$PG_INSTANCES" ]; then
  PG_INSTANCES="fatia:${CONTAINER:-fatia-postgres}:${POSTGRES_USER:-fatia}"
fi

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

# Resolve o container por PREFIXO do nome.
#
# No Docker Swarm (que é como o Dokploy roda os bancos) o nome inclui o id da
# task — `fatia-postgres-uydgkg.1.ouh0a0vzzyh146o2jrnjqfvp5` — e esse sufixo
# MUDA a cada redeploy. Fixar o nome completo daria um backup que quebra sozinho
# no dia em que o banco for reimplantado.
#
# Nome exato tem precedência. Casar com mais de um é erro, não escolha: pegar o
# primeiro poderia dumpar o cluster errado em silêncio.
#
# Devolve em $RESOLVED em vez de stdout de propósito: dentro de `$(...)` o
# `exit 1` do fail() mataria só o subshell, o alerta sairia duas vezes e a
# segunda mensagem seria genérica.
RESOLVED=""
resolve_container() {
  local pattern="$1" matches n
  if docker inspect --type container "$pattern" >/dev/null 2>&1; then
    RESOLVED="$pattern"; return 0
  fi
  matches=$(docker ps --format '{{.Names}}' | awk -v p="$pattern" 'index($0, p) == 1')
  n=$(printf '%s' "$matches" | grep -c . || true)
  case "$n" in
    0) fail "nenhum container casa com o prefixo '$pattern' (o banco está no ar?)" ;;
    1) RESOLVED="$matches" ;;
    *) fail "prefixo '$pattern' casa com $n containers — ambíguo: $(printf '%s ' $matches)" ;;
  esac
}

mkdir -p "$BACKUP_DIR"

TS=$(date +%Y%m%d-%H%M%S)
EXT="sql.gz"
[ -n "${BACKUP_PASSPHRASE:-}" ] && EXT="sql.gz.gpg"

# Validações que valem para todas as instâncias, feitas ANTES do primeiro dump.
# Descobrir que falta o gpg depois de dumpar dois clusters é desperdício, e
# descobrir na terceira instância deixaria as duas primeiras em claro no disco.
if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  command -v gpg >/dev/null 2>&1 || fail 'BACKUP_PASSPHRASE definida mas gpg não está instalado'
fi
ENDPOINT_ARG=()
if [ -n "${S3_BUCKET:-}" ]; then
  command -v aws >/dev/null 2>&1 || fail 'S3_BUCKET definido mas o aws cli não está instalado'
  if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
    fail 'recusando enviar backup NÃO CIFRADO para offsite. Defina BACKUP_PASSPHRASE.'
  fi
  # O aws cli recusa qualquer chamada sem região, mesmo com --endpoint-url
  # próprio. No R2 o valor correto é `auto`.
  if [ -z "${AWS_DEFAULT_REGION:-}" ]; then
    fail 'AWS_DEFAULT_REGION não definida (use `auto` no Cloudflare R2)'
  fi
  [ -n "${S3_ENDPOINT:-}" ] && ENDPOINT_ARG=(--endpoint-url "$S3_ENDPOINT")
fi

# --- Uma passada por cluster ---
for instance in $PG_INSTANCES; do
  label="${instance%%:*}"
  rest="${instance#*:}"
  container="${rest%%:*}"
  pg_user="${rest#*:}"

  if [ -z "$label" ] || [ -z "$container" ] || [ -z "$pg_user" ] || [ "$rest" = "$container" ]; then
    fail "PG_INSTANCES malformada em '$instance' (esperado rotulo:container:usuario)"
  fi

  resolve_container "$container"
  OUT="$BACKUP_DIR/fatia-$label-$TS.sql.gz"

  log "[$label] Dump de $RESOLVED → $OUT"
  docker exec "$RESOLVED" pg_dumpall -U "$pg_user" --clean --if-exists | gzip > "$OUT"

  # Dump vazio ou truncado é pior que dump ausente: passa desapercebido até a
  # hora do restore. 1 KB é generoso — um dump real do Fatia passa de centenas de KB.
  SIZE=$(stat -c %s "$OUT" 2>/dev/null || stat -f %z "$OUT")
  if [ "$SIZE" -lt 1024 ]; then
    fail "[$label] dump suspeito: apenas ${SIZE} bytes em $OUT"
  fi
  if ! gzip -t "$OUT" 2>/dev/null; then
    fail "[$label] gzip corrompido em $OUT"
  fi
  log "[$label] Dump OK ($(du -h "$OUT" | cut -f1))"

  # --- Cifra, se houver passphrase ---
  if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
    log "[$label] Cifrando com AES-256"
    printf '%s' "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet \
      --passphrase-fd 0 --symmetric --cipher-algo AES256 \
      --output "$OUT.gpg" "$OUT"
    rm -f "$OUT"
    OUT="$OUT.gpg"
  fi

  # --- Replica offsite ---
  if [ -n "${S3_BUCKET:-}" ]; then
    log "[$label] Enviando para $S3_BUCKET"
    # Sem o `||`, uma falha aqui cairia no trap genérico e o alerta diria só
    # "falha na linha N" — inútil para quem recebe a notificação às 4 da manhã.
    # O caso mais comum é token com permissão só de leitura: o `s3 ls` da
    # validação inicial passa e o PutObject é negado.
    aws "${ENDPOINT_ARG[@]}" s3 cp "$OUT" "$S3_BUCKET/$(basename "$OUT")" --only-show-errors \
      || fail "[$label] upload recusado por $S3_BUCKET (o token tem permissão de ESCRITA no bucket?)"

    # Confirma que o objeto existe do outro lado. `cp` bem-sucedido não é prova
    # suficiente quando o endpoint é S3-compatível de terceiro.
    aws "${ENDPOINT_ARG[@]}" s3 ls "$S3_BUCKET/$(basename "$OUT")" >/dev/null \
      || fail "[$label] upload não verificável: objeto ausente em $S3_BUCKET"
    log "[$label] Offsite OK"
  fi
done

# --- Retenção offsite (uma vez, cobre todos os rótulos) ---
if [ -n "${S3_BUCKET:-}" ]; then

  # Retenção offsite. Comparação por data no nome do arquivo
  # (fatia-<rotulo>-YYYYMMDD-HHMMSS), que é o que temos sem depender de
  # lifecycle policy do provedor.
  CUTOFF=$(date -d "-${S3_RETENTION_DAYS} days" +%Y%m%d 2>/dev/null \
           || date -v "-${S3_RETENTION_DAYS}d" +%Y%m%d)
  aws "${ENDPOINT_ARG[@]}" s3 ls "$S3_BUCKET/" | awk '{print $4}' | while read -r key; do
    [ -z "$key" ] && continue
    keydate=$(echo "$key" | sed -n 's/^fatia-[^-]*-\([0-9]\{8\}\)-.*/\1/p')
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

COUNT=$(printf '%s\n' $PG_INSTANCES | wc -l | tr -d ' ')
log "Concluído: $COUNT cluster(s) em $BACKUP_DIR (fatia-*-$TS.$EXT)"
