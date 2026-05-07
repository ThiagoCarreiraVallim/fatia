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

`backup.sh` (TODO em F4.5) faz `pg_dump` para `/var/backups/fatia/` com retenção de 7 dias.

## Restauração

```bash
docker compose exec -T postgres psql -U fatia fatia < /caminho/do/backup.sql
```
