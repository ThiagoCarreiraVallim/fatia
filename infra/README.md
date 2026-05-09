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

## Uso em produção

```bash
# No servidor, primeira vez
git clone <repo>
cd fatia
cp .env.example .env
# Editar .env com secrets reais (JWT_SECRET, POSTGRES_PASSWORD, etc)
docker compose -f infra/docker-compose.yml --profile full up -d --build
docker compose exec api pnpm db:migrate:deploy
docker compose exec api pnpm db:seed
```

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
