# Deploy do Fatia no Dokploy

Guia para subir o stack (web + api + auth) com Postgres já existente como
"Database" no Dokploy.

## Visão geral

```
                 https
   ┌──────┐   ┌─────────┐   ┌──────────────┐
   │Cliente│──▶│Traefik  │──▶│ web (Next)   │  app.${DOMAIN}
   └──────┘   │ (Dokploy│   ├──────────────┤
              │  Proxy) │──▶│ api (NestJS) │  api.${DOMAIN}
              │         │   ├──────────────┤
              │         │──▶│ auth (Logto) │  auth.${DOMAIN}
              └─────────┘   └──────┬───────┘
                                   │
                            ┌──────▼─────┐
                            │  Postgres  │  (Database do Dokploy)
                            │  fatia +   │
                            │  logto     │
                            └────────────┘
```

Tudo roda atrás do Traefik gerenciado pelo Dokploy. SSL via Let's Encrypt
automático.

## Pré-requisitos

- Servidor com Dokploy instalado e acessível
- DNS apontando o **apex** (`fat.ia.br`, para o site) mais `api.`, `app.`, `auth.` e `www.`
  pro IP do servidor. Um registro `A` para cada — ou um `A` no apex e um `CNAME` de cada
  subdomínio para ele.
- Email válido configurado em "Dokploy → Settings → Server → Let's Encrypt"

## Passo 1 — Criar a Database (Postgres)

Pelo painel do Dokploy:

1. **Project → Create → Database**
2. Tipo: **PostgreSQL** (16)
3. Nome: `fatia-postgres`
4. Defina `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB=fatia`
5. Salve. Anote o **hostname interno** (algo como `fatia-postgres-xxxx`).

Crie também a database do Logto. Conecte por `Open Terminal` no Dokploy
(ou `docker exec`) e rode:

```sql
CREATE DATABASE logto;
```

## Passo 2 — Criar o serviço Compose

1. **Project → Create → Compose**
2. **Source** = Git → cole o repo + branch (`develop` ou `main`)
3. **Compose Path** = `infra/docker-compose.prod.yml`
4. **Network** = `dokploy-network` (já é o default; o compose usa `external: true`)

## Passo 3 — Variáveis de ambiente

Em **Compose → Environment**, cole **uma vez** baseado em
`.env.production.example`. Mínimo obrigatório:

```env
DOMAIN=fat.ia.br

DATABASE_URL=postgresql://fatia:SENHA@fatia-postgres:5432/fatia
LOGTO_DB_URL=postgresql://fatia:SENHA@fatia-postgres:5432/logto

LOGTO_VERSION=1.30
LOGTO_APP_ID=preencher_apos_passo_5
LOGTO_APP_SECRET=preencher_apos_passo_5
LOGTO_COOKIE_SECRET=$(openssl rand -base64 32)
```

Salve. Os subdomínios e demais derivações ficam por conta do compose.

### Opcional — IA hospedada e plano PRO (ADR 024)

Sem nada disto a instância sobe com o app inteiro e o MCP; a IA hospedada some da interface.

```env
# IA hospedada (agente) e custo
AGENT_BASE_URL=http://fatia-agent:8100
AGENT_API_KEY=$(openssl rand -hex 32)
# micro-dólares por milhão de tokens; preço do OpenRouter em 19/10/2026
AI_PRICE_TABLE={"z-ai/glm-5.3-flash":{"in":47076,"out":160000}}
# micro-dólares por dia (UTC): US$ 0,06 por pessoa, US$ 3 na instância
AI_QUOTA_DAILY_MICROS=60000
AI_QUOTA_GLOBAL_DAILY_MICROS=3000000

# Plano PRO: false libera a IA hospedada para todos (self-host)
AI_REQUIRES_PLAN=true
BILLING_PRO_MONTHLY_CENTS=1990
BILLING_PRO_YEARLY_CENTS=17900

# Asaas (assinatura pela web) — webhook em https://api.<DOMAIN>/api/billing/webhooks/asaas
ASAAS_BASE_URL=https://api.asaas.com
ASAAS_API_KEY=...
ASAAS_WEBHOOK_TOKEN=$(openssl rand -hex 32)

# RevenueCat (compra no app) — webhook em https://api.<DOMAIN>/api/billing/webhooks/revenuecat
REVENUECAT_WEBHOOK_AUTH=$(openssl rand -hex 32)
REVENUECAT_SECRET_KEY=sk_...
REVENUECAT_ENTITLEMENT_ID=pro
```

Com `AI_REQUIRES_PLAN=true`, ligue a cota **antes** (o PRO tem preço fixo) e configure pelo menos
o Asaas, senão ninguém consegue assinar pela web. Depois do primeiro uso, confira que o chat e a foto
saem precificados (`pricingKnown = true`) — a conta e a consulta estão em
[`docs/OPERATIONS.md`](../../docs/OPERATIONS.md#custo-e-cota-da-ia). Roteiro completo em
[`docs/BILLING.md`](../../docs/BILLING.md#plano-pro-do-usuário-adr-024).

### Opcional — comunidades: assentos, convite por e-mail e link universal (ADR 025/026)

```env
# Assento de IA pago pela comunidade, por mês (cobrado pelo mesmo Asaas)
BILLING_SEAT_MONTHLY_CENTS=1490

# E-mail do convite, mandado pela própria API. O mesmo SMTP do Logto, em URL.
# Vazio = a equipe copia o link do convite.
MAIL_SMTP_URL=smtps://resend:CHAVE@smtp.resend.com:465
EMAIL_FROM=Fatia <nao-responda@fat.ia.br>

# Apagar a conta remove a identidade no Logto, e o primeiro acesso lê o e-mail
# real da pessoa (sem isso o convite por e-mail não a reconhece). App M2M com a
# role "Logto Management API access".
LOGTO_M2M_APP_ID=...
LOGTO_M2M_APP_SECRET=...

# Link universal do convite no app nativo (/.well-known/*). Vazio = abre o PWA.
APPLE_TEAM_ID=...
ANDROID_CERT_SHA256=AA:BB:...
```

Todas já estão listadas no `infra/docker-compose.prod.yml`: o container só recebe o que está lá,
então preencher no painel basta.

## Passo 4 — Primeiro deploy (Logto sobe sozinho)

1. **Compose → Deploy**.
2. Acompanhe os logs até `auth` ficar healthy. Logto roda migrations próprias
   na primeira execução (~30-60s).
3. Acesse `https://auth.${DOMAIN}/admin` — vai pedir cadastro de **admin do
   Logto** (é uma conta pra administrar o IdP, **não** é a conta de usuário do
   app).

## Passo 5 — Configurar o tenant do Logto

No console do Logto:

1. **Applications → Create** → tipo **Traditional Web** → nome "Fatia PWA"
   - **Redirect URIs**: `https://app.${DOMAIN}/api/logto/callback`
   - **Post sign-out URIs**: `https://app.${DOMAIN}/`
   - Anote `App ID` e `App Secret` → preencha `LOGTO_APP_ID` e
     `LOGTO_APP_SECRET` no Dokploy e clique em **Redeploy**.

2. **API Resources → Create** → nome "Fatia API"
   - **Identifier**: `https://api.${DOMAIN}` (este vira `LOGTO_AUDIENCE`)
   - Scopes: `read`, `write` (começar simples)

3. **Sign-in experience → Advanced → Dynamic Client Registration** = **Enabled**
   (necessário pro conector MCP do Claude funcionar)

4. **Roles → Create** → `user` (default) e `admin`

5. **Users → Create** → seu usuário, atribua role `admin`.

## Passo 6 — Redeploy com vars completas

Depois de preencher `LOGTO_APP_ID` / `LOGTO_APP_SECRET`, rode **Redeploy**.
`web` e `api` precisam dessas vars no boot.

## Passo 7 — Migrations + smoke test

A entrada do container `api` já roda `prisma migrate deploy` antes de iniciar
o servidor. Se der ruim:

```bash
docker exec -it $(docker ps -qf name=fatia-api) \
  pnpm --filter @fatia/db exec prisma migrate deploy
```

Smoke tests:

```bash
# API saudável (sem auth)
curl https://api.${DOMAIN}/health

# Discovery do MCP (sem auth)
curl https://api.${DOMAIN}/.well-known/oauth-protected-resource

# PWA carrega
curl -I https://app.${DOMAIN}/
```

## Passo 8 — Conectar Claude (MCP)

1. Claude → **Configurações → Conectores → Adicionar**
2. URL: `https://api.${DOMAIN}/mcp`
3. Claude vai redirecionar pro Logto, faça login com a mesma conta
4. Teste: peça `get_me` no chat.

## Backup do Postgres

Ver `infra/backup.sh` na raiz do `infra/`. Executar no host (não dentro de
container do Dokploy) com cron diário às 4h, retenção 7 dias:

```cron
0 4 * * * /opt/fatia/infra/backup.sh >> /var/log/fatia-backup.log 2>&1
```

## Atualizações

- Push pra branch configurada → Dokploy detecta e faz **Auto Deploy** (se
  habilitado) ou clique em **Deploy** manualmente.
- Migrations novas rodam automaticamente no boot do `api` (`prisma migrate
deploy`). Se quiser separar (deploy de zero downtime), mude o `CMD` do
  Dockerfile e rode migrations num passo manual antes do redeploy.

## Troubleshooting

| Sintoma                      | Provável causa                                                          |
| ---------------------------- | ----------------------------------------------------------------------- |
| `502 Bad Gateway` no Traefik | container ainda subindo / healthcheck falhando — ver logs               |
| API retorna 401 mesmo logado | `LOGTO_AUDIENCE` no api ≠ identifier no Logto                           |
| Login redireciona em loop    | `LOGTO_BASE_URL` ou `Redirect URI` incorretos                           |
| Claude não conecta MCP       | DCR não está habilitado no tenant Logto                                 |
| Logto admin não abre         | `auth.${DOMAIN}/admin` exige redirecionamento; checar labels do Traefik |
