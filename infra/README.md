# Infra

Compose + Dockerfiles + scripts operacionais.

## Uso em desenvolvimento

```bash
# Apenas Postgres (apps rodam locais via pnpm dev)
pnpm infra:up

# Apps + Postgres em containers (mais próximo de prod)
docker compose -f infra/docker-compose.yml --profile full up -d

# Logs
pnpm infra:logs

# Derrubar
pnpm infra:down
```

## Uso em produção (Dokploy)

Stack de produção fica em `infra/docker-compose.prod.yml` e usa Traefik via
`dokploy-network` (rede externa do Dokploy). Postgres roda fora do compose,
como "Database" do próprio Dokploy.

Passo a passo completo: [`infra/dokploy/README.md`](./dokploy/README.md).

Resumo:

1. Criar Postgres (Database do Dokploy) com databases `fatia` e `logto`.
2. Criar Compose service apontando pra `infra/docker-compose.prod.yml`.
3. Configurar variáveis no painel (ver `.env.production.example`).
4. Deploy → o `api` aplica migrations no boot.
5. Configurar tenant do Logto e preencher `LOGTO_APP_ID` / `LOGTO_APP_SECRET` →
   redeploy.

## Backup

`backup.sh` faz `pg_dumpall` (cobre `fatia` e `logto`), compactado em `gzip`, com
retenção local configurável (default 7 dias), cifra opcional AES-256 e replicação
opcional para storage S3-compatível.

```bash
# Cron diário às 4h, agendar no host:
0 4 * * * /opt/fatia/infra/backup.sh >> /var/log/fatia-backup.log 2>&1
```

Variáveis: `BACKUP_DIR`, `RETENTION_DAYS`, `CONTAINER`, `POSTGRES_USER`,
`BACKUP_PASSPHRASE`, `S3_BUCKET`, `S3_ENDPOINT`, `S3_RETENTION_DAYS`,
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `ALERT_WEBHOOK`.

O script **recusa enviar backup não cifrado** para offsite, aborta se o dump sair
truncado, e sai com código 1 em qualquer falha (para o cron acusar).

## Restauração

```bash
# Backup local
gunzip -c /opt/fatia/backups/fatia-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i fatia-postgres psql -U fatia

# Backup cifrado
printf '%s' "$BACKUP_PASSPHRASE" \
  | gpg --batch --quiet --passphrase-fd 0 --decrypt fatia-....sql.gz.gpg \
  | gunzip | docker exec -i fatia-postgres psql -U fatia
```

**Runbook completo de recuperação de desastre** — perda do VPS, corrupção de dados,
rotação de credenciais pós-incidente e o drill trimestral de restore:
[`docs/OPERATIONS.md`](../docs/OPERATIONS.md).
