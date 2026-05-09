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

`backup.sh` faz `pg_dumpall` (cobre `fatia` e `logto`), compactado em `gzip`,
com retenção configurável (default 7 dias).

```bash
# Cron diário às 4h, agendar no host:
0 4 * * * /opt/fatia/infra/backup.sh >> /var/log/fatia-backup.log 2>&1
```

Variáveis úteis: `BACKUP_DIR`, `RETENTION_DAYS`, `CONTAINER`, `POSTGRES_USER`.

## Restauração

```bash
gunzip -c /opt/fatia/backups/fatia-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i fatia-postgres psql -U fatia
```
