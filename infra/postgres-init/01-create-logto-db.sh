#!/bin/bash
# Cria a database `logto` na primeira inicialização do Postgres.
# Executado automaticamente pelo entrypoint da imagem postgres quando o volume está vazio.
# Se o volume já tem dados, esse script NÃO roda novamente.

set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
  SELECT 'CREATE DATABASE logto'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'logto')\gexec
EOSQL

echo "Database 'logto' verificada/criada."
