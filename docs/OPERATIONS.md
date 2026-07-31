# Operações e recuperação de desastre

> Entregável da issue #93 (frente 3 da épica #38). Escrito para ser seguido por alguém que
> **não** é o mantenedor — se um passo exige conhecimento que só está na cabeça de uma pessoa, o
> runbook falhou.
>
> Observabilidade e alertas vivem na issue #39. Retenção de dados em
> [`DATA_RETENTION.md`](./DATA_RETENTION.md).

## Topologia

| Componente     | Onde                                       | Notas                                         |
| -------------- | ------------------------------------------ | --------------------------------------------- |
| Site + landing | container nginx, mesmo compose             | Astro estático (`apps/site`), sem Node nem JS |
| API (NestJS)   | container, `infra/docker-compose.prod.yml` | Aplica migrations no boot                     |
| PWA (Next.js)  | container, mesmo compose                   | —                                             |
| Logto          | container, mesmo compose                   | IdP (ADR 008)                                 |
| Postgres       | "Database" do Dokploy, **fora** do compose | **Dois** clusters: `fatia` e `logto`          |
| Traefik        | gerenciado pelo Dokploy                    | TLS via Let's Encrypt, `dokploy-network`      |
| Backups        | `infra/backup.sh` via cron no host         | Local + offsite opcional                      |

| Host             | Serviço                                |
| ---------------- | -------------------------------------- |
| `fat.ia.br`      | site institucional + `/claude-connect` |
| `www.fat.ia.br`  | redireciona para o apex                |
| `app.fat.ia.br`  | PWA                                    |
| `api.fat.ia.br`  | API + endpoint MCP em `/mcp`           |
| `auth.fat.ia.br` | Logto                                  |

Todos com redirect HTTP→HTTPS.

## Backup — setup do zero

Tudo abaixo roda **no host**, via SSH. Leva ~15 minutos, quase todo em criar o bucket.

### 1. Criar o bucket

No **Backblaze B2** (mais barato para este volume) ou **Cloudflare R2** (sem taxa de egresso):

- crie um bucket **privado** chamado `fatia-backups`
- gere uma chave de aplicação com acesso **só a esse bucket**
- anote `keyID`, `applicationKey` e o **endpoint S3** do bucket

### 2. Instalar as dependências no host

```bash
# Debian/Ubuntu
sudo apt-get update && sudo apt-get install -y gnupg awscli
```

### 3. Gerar a passphrase

```bash
openssl rand -base64 32
```

> ⚠️ **Guarde esta passphrase no seu gerenciador de senhas ANTES de continuar.**
> Se ela existir apenas no VPS e o VPS morrer, os backups offsite viram lixo cifrado —
> você terá todas as cópias e não conseguirá abrir nenhuma. É o erro mais fácil de
> cometer e o mais caro de descobrir tarde.

### 4. Configurar

```bash
cd /opt/fatia
cp infra/.env.backup.example infra/.env.backup
nano infra/.env.backup          # preencher passphrase, bucket, chaves, webhook
chmod 600 infra/.env.backup     # credenciais: só o dono lê
chmod +x infra/backup.sh
```

⚠️ O Fatia roda **dois clusters Postgres separados**: um da aplicação e um do Logto (contas
de usuário). `pg_dumpall` cobre todos os databases de **um** cluster — não os dois. Descubra os
dois nomes e preencha `PG_INSTANCES`:

```bash
docker ps --format '{{.Names}}' | grep -iE 'postgres|logto'
```

```bash
PG_INSTANCES="fatia:<container-da-app>:postgres logto:<container-do-logto>:postgres"
```

Dumpar só um traria os dados sem as contas (ou o contrário), e isso só apareceria na hora do
restore. Se qualquer instância falhar, o backup inteiro falha.

O `backup.sh` carrega o `.env.backup` sozinho — não é preciso repetir variável nenhuma
na crontab (e credencial em crontab ficaria legível por qualquer `crontab -l`).

### 5. Rodar uma vez na mão

```bash
/opt/fatia/infra/backup.sh
```

Esperado: `Dump OK`, `Cifrando com AES-256`, `Offsite OK`, `Concluído`. Se algum passo
falhar, o script sai com código 1 e dispara o `ALERT_WEBHOOK`.

### 6. Agendar

```bash
crontab -e
```

```cron
0 4 * * * /opt/fatia/infra/backup.sh >> /var/log/fatia-backup.log 2>&1
```

### 7. Confirmar que o alerta funciona

Vale testar antes de precisar. Rode apontando para um container inexistente:

```bash
PG_INSTANCES="fatia:nao-existe:postgres" /opt/fatia/infra/backup.sh; echo "exit=$?"
```

Variável passada na linha de comando tem precedência sobre o `.env.backup` — o script guarda os
valores vindos do ambiente e os reaplica depois de carregar o arquivo. Sem esse cuidado o
`. arquivo` sobrescreveria o que você passou, e este teste rodaria um backup **normal**: você
concluiria que o alerta funciona sem nunca tê-lo exercitado.

Deve sair `exit=1` e o webhook deve receber a notificação.

### 8. Executar o primeiro drill de restore

Seção seguinte. **Enquanto isso não acontecer, você não tem backup — tem esperança.**

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

# 2. Baixar o backup do offsite. São DOIS arquivos por execução, um por cluster:
#    fatia-fatia-<TS> (aplicação) e fatia-logto-<TS> (contas). Restaure os dois.
aws --endpoint-url "$S3_ENDPOINT" s3 cp \
  "$S3_BUCKET/fatia-fatia-YYYYMMDD-HHMMSS.sql.gz.gpg" /tmp/restore-app.sql.gz.gpg

# 3. Decifrar, descomprimir e restaurar
printf '%s' "$BACKUP_PASSPHRASE" \
  | gpg --batch --quiet --passphrase-fd 0 --decrypt /tmp/restore-app.sql.gz.gpg \
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
2. **Apontar o DNS** do apex (`fat.ia.br`) e dos subdomínios (`api.`, `app.`, `auth.`, `www.`)
   para o novo IP. Faça isto cedo — a propagação corre em paralelo com o resto.
3. **Criar o Postgres** como Database do Dokploy, com os dois clusters: um para `fatia` e um para `logto`.
4. **Restaurar os dois dumps** mais recentes do offsite (passos 2 e 3 do drill, mirando os
   Postgres novos). São arquivos separados — `fatia-fatia-<TS>` para a aplicação e
   `fatia-logto-<TS>` para as contas — porque são **dois clusters distintos**.
   ⚠️ Restaurar só o da aplicação devolve os dados sem nenhuma conta: todo mundo perde o acesso
   ao próprio histórico. Restaurar só o do Logto devolve as contas vazias. Os dois, sempre.
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
    - `curl https://api.fat.ia.br/health`
    - `curl https://api.fat.ia.br/.well-known/oauth-authorization-server`
    - `curl -I https://fat.ia.br/claude-connect/`
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
