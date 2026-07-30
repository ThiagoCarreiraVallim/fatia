# Operações e recuperação de desastre

> Entregável da issue #93 (frente 3 da épica #38). Escrito para ser seguido por alguém que
> **não** é o mantenedor — se um passo exige conhecimento que só está na cabeça de uma pessoa, o
> runbook falhou.
>
> Observabilidade e alertas vivem na issue #39. Retenção de dados em
> [`DATA_RETENTION.md`](./DATA_RETENTION.md).

## Topologia

| Componente    | Onde                                       | Notas                                    |
| ------------- | ------------------------------------------ | ---------------------------------------- |
| API (NestJS)  | container, `infra/docker-compose.prod.yml` | Aplica migrations no boot                |
| PWA (Next.js) | container, mesmo compose                   | —                                        |
| Logto         | container, mesmo compose                   | IdP (ADR 008)                            |
| Postgres      | "Database" do Dokploy, **fora** do compose | Databases `fatia` e `logto`              |
| Traefik       | gerenciado pelo Dokploy                    | TLS via Let's Encrypt, `dokploy-network` |
| Backups       | `infra/backup.sh` via cron no host         | Local + offsite opcional                 |

Subdomínios: `api.`, `app.`, `auth.` — com redirect HTTP→HTTPS.

## Backup

### Configurar

Cron no host:

```bash
0 4 * * * /opt/fatia/infra/backup.sh >> /var/log/fatia-backup.log 2>&1
```

Variáveis (em `/etc/environment`, no crontab, ou num wrapper):

```bash
BACKUP_PASSPHRASE=<segredo forte>       # obrigatório para offsite
S3_BUCKET=s3://fatia-backups
S3_ENDPOINT=https://s3.us-west-004.backblazeb2.com   # Backblaze B2, Cloudflare R2, etc.
AWS_ACCESS_KEY_ID=<...>
AWS_SECRET_ACCESS_KEY=<...>
S3_RETENTION_DAYS=30
ALERT_WEBHOOK=<url que recebe POST em caso de falha>
```

Requer `gpg` (cifra) e `aws` cli (offsite) instalados no host.

> **A `BACKUP_PASSPHRASE` NÃO pode viver só no VPS.** Se o servidor morrer e a passphrase morrer
> com ele, os backups offsite são lixo cifrado. Guarde-a num gerenciador de senhas fora da
> infraestrutura. Este é o modo de falha mais fácil de cometer e o mais difícil de perceber antes
> da hora.

### Garantias do script

- Aborta se o dump sair com menos de 1 KB ou se o gzip não passar no teste de integridade — dump
  truncado passa desapercebido até a hora do restore.
- **Recusa enviar offsite sem cifra.** Sem `BACKUP_PASSPHRASE`, o upload não acontece.
- Confirma que o objeto existe no bucket depois do upload; `cp` com sucesso não é prova quando o
  endpoint é S3-compatível de terceiro.
- Sai com código 1 em qualquer falha e chama `ALERT_WEBHOOK`.
- Sem `S3_BUCKET`, avisa em log que o backup só existe naquele host.

## Drill de restore

**Backup não testado não conta.** Rode este drill ao configurar e a cada trimestre. Anote a
data e o tempo na tabela no fim deste doc.

Faça em **container descartável**, nunca contra produção:

```bash
# 1. Postgres temporário
docker run -d --rm --name fatia-restore-test \
  -e POSTGRES_USER=fatia -e POSTGRES_PASSWORD=temp \
  -p 55432:5432 postgres:16-alpine
sleep 5

# 2. Baixar o backup do offsite
aws --endpoint-url "$S3_ENDPOINT" s3 cp \
  "$S3_BUCKET/fatia-YYYYMMDD-HHMMSS.sql.gz.gpg" /tmp/restore-test.sql.gz.gpg

# 3. Decifrar, descomprimir e restaurar
printf '%s' "$BACKUP_PASSPHRASE" \
  | gpg --batch --quiet --passphrase-fd 0 --decrypt /tmp/restore-test.sql.gz.gpg \
  | gunzip \
  | docker exec -i fatia-restore-test psql -U fatia

# 4. Verificar que os dados chegaram — não basta o psql não reclamar
docker exec fatia-restore-test psql -U fatia -d fatia -c \
  'SELECT (SELECT count(*) FROM "User") AS users,
          (SELECT count(*) FROM "Meal") AS meals,
          (SELECT count(*) FROM "WorkoutSession") AS sessions;'

# 5. Limpar
docker stop fatia-restore-test
rm -f /tmp/restore-test.sql.gz.gpg
```

Se as contagens vierem zeradas ou muito abaixo do esperado, **o backup não serve** — investigue
antes de precisar dele.

Para backup local não cifrado, pule o passo 2 e o `gpg`:

```bash
gunzip -c /opt/fatia/backups/fatia-YYYYMMDD-HHMMSS.sql.gz \
  | docker exec -i fatia-postgres psql -U fatia
```

## Cenário 1 — perda total do VPS

Tempo estimado: **1 a 2 horas**, dominado por propagação de DNS e emissão de certificado.

1. **Provisionar host novo** com Docker e Dokploy. Ver `infra/dokploy/README.md`.
2. **Apontar o DNS** dos três subdomínios (`api.`, `app.`, `auth.`) para o novo IP. Faça isto
   cedo — a propagação corre em paralelo com o resto.
3. **Criar o Postgres** como Database do Dokploy, com as databases `fatia` e `logto`.
4. **Restaurar o dump** mais recente do offsite (passos 2 e 3 do drill, mirando o Postgres novo).
   O `pg_dumpall` cobre `fatia` **e** `logto`, então as contas de usuário voltam junto — ninguém
   precisa se recadastrar.
5. **Recriar o Compose service** apontando para `infra/docker-compose.prod.yml`.
6. **Repor as variáveis de ambiente** no painel do Dokploy (ver `.env.production.example`).
   Precisam ser as **mesmas** de antes, em especial `LOGTO_COOKIE_SECRET` — trocá-la invalida as
   sessões do PWA.
7. **Deploy.** A API aplica migrations no boot; o dump restaurado já está na versão correta, então
   é no-op.
8. **Confirmar o TLS.** O Traefik pede certificado ao Let's Encrypt no primeiro acesso a cada
   subdomínio. Se falhar, quase sempre é DNS ainda não propagado — espere e tente de novo, com
   atenção ao rate limit do Let's Encrypt.
9. **Reinstalar o cron de backup** e rodar `backup.sh` na mão uma vez.
10. **Smoke test:**
    - `curl https://api.<domínio>/health`
    - `curl https://api.<domínio>/.well-known/oauth-authorization-server`
    - Login no PWA
    - Conectar o Fatia no Claude e pedir uma leitura (ver [`MCP_OAUTH.md`](./MCP_OAUTH.md))

## Cenário 2 — corrupção de dados, host íntegro

1. **Parar a API** para não haver escrita durante o restore.
2. Tirar um dump do estado atual, mesmo corrompido — ele pode conter dados posteriores ao último
   backup que você vai querer garimpar depois.
3. Restaurar o último backup bom (o `pg_dumpall` usa `--clean --if-exists`, então recria os
   objetos).
4. Subir a API e conferir.

Perda de dados esperada: até 24 h (o backup é diário às 4h).

## Cenário 3 — vazamento de credencial

Rotacione, na ordem:

1. **Senha do Postgres** — no Dokploy, e depois `DATABASE_URL` no ambiente.
2. **`LOGTO_MCP_APP_SECRET`** — console do Logto e ambiente. Ver a seção de rotação em
   [`MCP_OAUTH.md`](./MCP_OAUTH.md): não desconecta quem já está conectado.
3. **`LOGTO_APP_SECRET`** (app do PWA) — console e ambiente.
4. **`LOGTO_COOKIE_SECRET`** — trocar **derruba todas as sessões do PWA**. Faça se houver
   suspeita de sessão comprometida; os usuários só precisam logar de novo.
5. **`BACKUP_PASSPHRASE`** — trocar não recifra os backups antigos. Mantenha a antiga arquivada
   enquanto houver backup cifrado com ela dentro da janela de retenção.
6. **Credenciais S3** — no provedor e no ambiente.
7. **`LOGTO_M2M_APP_SECRET`**, se configurado.

Depois: `docker compose up -d --force-recreate` para todo container ler as variáveis novas.

Se houver suspeita de acesso indevido a dados de usuário, considere as obrigações de comunicação
da LGPD (art. 48) — ANPD e titulares afetados.

## Cenário 4 — Logto indisponível

A API valida JWT via JWKS com cache. Com o Logto fora:

- **Quem já tem token válido continua funcionando** até ele expirar.
- **Login novo e refresh param.**

Não há fallback, e é uma dependência aceita conscientemente na ADR 008. Restaurar o Logto é a
única saída: `docker compose logs logto` e confirmar que ele alcança a database `logto`.

## Checklist trimestral

- [ ] Drill de restore executado e anotado abaixo
- [ ] `BACKUP_PASSPHRASE` confirmada fora do VPS
- [ ] Log de backup sem falhas nos últimos 90 dias
- [ ] Validade dos certificados TLS
- [ ] Espaço em disco no host
- [ ] Backups offsite presentes e dentro da retenção configurada

## Histórico de drills

Preencher a cada execução. Uma linha vazia aqui significa que o backup **nunca foi testado**.

| Data | Executado por | Backup usado | Tempo até restaurado | Resultado                                        |
| ---- | ------------- | ------------ | -------------------- | ------------------------------------------------ |
| —    | —             | —            | —                    | **Pendente: primeiro drill ainda não executado** |
