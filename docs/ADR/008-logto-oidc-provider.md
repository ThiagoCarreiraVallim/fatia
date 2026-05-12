# ADR 008 — Logto como provider OIDC, substituindo auth manual

**Status:** Accepted  
**Data:** 2026-05-09  
**Supersedes:** ADR 003 (Auth dupla JWT + Bearer)

## Contexto

A ADR 003 propunha auth dupla: JWT próprio para o PWA + Bearer token estático para MCP. A intenção era manter simples — controle total, sem dependências externas.

Quando foi a hora de conectar o servidor MCP ao Claude (web e mobile), bateu na realidade: **conectores remotos no Claude exigem OAuth 2.1 com Dynamic Client Registration, PKCE e Resource Indicators**. Bearer token estático colado pelo usuário não é suportado nessas interfaces. Apenas o Claude Desktop aceita config local com bearer, mas perde-se mobile, que era o caso de uso central (foto da comida).

Implementar OAuth 2.1 conforme spec MCP do zero em NestJS exigiria:

- Endpoints `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource`
- Authorization code flow com PKCE (RFC 7636)
- Dynamic Client Registration (RFC 7591)
- Resource Indicators (RFC 8707)
- Refresh token rotation
- Tela de consentimento
- JWKS endpoint

Estimativa honesta: 14+ dias de trabalho focado, área que historicamente concentra vulnerabilidades quando feita sem expertise.

## Decisão

Adotar **Logto self-hosted** como Identity Provider único do Fatia.

- **PWA** autentica via Logto (OAuth code flow + PKCE)
- **Claude (MCP)** autentica via Logto (OAuth + DCR conforme spec MCP)
- **NestJS API** vira **resource server**: valida JWTs emitidos pelo Logto, não emite credenciais
- Login único entre PWA e Claude — mesma identidade, mesmo refresh

### Por que Logto, não Keycloak

- **Stack alinhada:** Node/TS, mesma linguagem do resto do projeto. Debug acessível.
- **Suporte explícito a MCP:** Logto documenta o flow MCP especificamente, com exemplos. Keycloak suporta os RFCs mas o operador monta o flow sob OAuth genérico.
- **Recursos:** ~200-400MB RAM vs ~500MB-1GB de Keycloak. Importa em servidor pequeno.
- **DX:** Console moderno, configuração mais direta. Curva menor.

Keycloak ganharia em projetos com requisitos enterprise (SAML, federação multi-IDP, alta carga). Nenhum se aplica aqui.

### Por que self-hosted, não SaaS

Custo operacional do projeto deve ser zero por bom tempo. Auth0/Clerk free tiers existem mas dependem de produto de terceiro continuar gratuito e disponível no plano. Logto self-hosted no mesmo servidor é gratuito permanente.

## Consequências

### Positivas

- Conexão com Claude funciona conforme spec MCP, sem implementar OAuth manualmente
- Login único entre PWA e Claude
- Refresh tokens, rotação, revogação — tudo automático pelo Logto
- API NestJS fica drasticamente mais simples (só valida JWT)
- Senhas, hashing, recovery, rate-limit de login — fora do nosso código
- Console admin pronto pra gerenciar usuários (criar contas pra família/amigos)
- Schema mais limpo: `passwordHash` e `McpToken` somem

### Negativas

- Mais um serviço em produção (Logto + DB)
- Dependência forte: se Logto cai, PWA e MCP saem juntos
- Curva de aprendizado de Logto (config inicial)
- Menos controle: customização de tela de login depende do que Logto oferece
- Logto consome RAM extra (200-400MB)

### Neutras

- `User` no banco continua existindo, mas agora referenciado por `logtoSub` (sub claim do JWT) em vez de `email/passwordHash`
- Primeiro login de cada usuário cria `User` automaticamente (provisioning lazy)

## Implicações concretas

### Schema

- Remover `User.passwordHash`
- Remover model `McpToken` inteiro
- Adicionar `User.logtoSub @unique` — mapeia o `sub` do JWT do Logto pro registro local
- `User.email` continua, populado a partir do claim `email` do Logto
- `User.name` idem

### API (NestJS)

- Some o módulo de auth manual (`AuthService`, signup, login, JWT signing, argon2)
- Novo módulo de auth: valida JWT do Logto via JWKS, verifica `iss`, `aud`, `exp`
- Guard `JwtAuthGuard` lê `Authorization: Bearer <jwt-do-logto>`
- Provisioning lazy: na primeira request de um `sub` desconhecido, criar `User`
- Endpoint `/auth/me` continua existindo, retorna `User` local

### MCP

- Tools `list_my_tokens` e `revoke_token` **removidas** (gerenciamento via Logto)
- Endpoint `/mcp` valida JWT do Logto, mesma lógica do REST
- `/.well-known/oauth-protected-resource` aponta pro Logto como auth server
- `/.well-known/oauth-authorization-server` é servido pelo Logto, não por nós

### PWA

- Tela `/login` deixa de ter form. Botão "Entrar" redireciona pro Logto
- SDK `@logto/next` cuida de cookie, refresh, callback
- Tela `/profile` perde a parte de gerenciar tokens MCP (some)
- Provisioning visível: usuário admin cria conta no console do Logto, manda link de primeiro login

### Infra

- Adicionar serviço `logto` ao `docker-compose.yml`
- Logto usa Postgres — escolhemos **mesmo Postgres, database separada** (`fatia` e `logto`)
- Subdomínio próprio: `auth.fatia.dominio`
- Dokploy faz roteamento e SSL automático

## Reversibilidade

Migração é unidirecional na prática. Voltar pra auth manual exigiria:

1. Adicionar `passwordHash` de volta
2. Forçar todos os usuários a recadastrar (senha não é exportável do Logto sem comprometer segurança)
3. Reimplementar todo o flow OAuth pra MCP

Não há cenário realista de reversão. Decisão é de longo prazo.

## Notas de implementação

- Tenant Logto = um único tenant, "fatia"
- App PWA = SPA com PKCE
- App MCP = configurado pra suportar Dynamic Client Registration (DCR habilitado)
- Roles e scopes: começar simples — `user` (default) e `admin` (manual). Sem RBAC complexo na v1.
- Tela de login customizada com tema dark alinhado ao app — feature do Logto

## Alternativas consideradas

- **Keycloak self-hosted:** rejeitado pelos motivos acima (stack Java, RAM maior, MCP não é cidadão de primeira classe).
- **Authentik:** opção moderna, mas comunidade menor que Logto e MCP não é foco deles ainda.
- **Auth0/Clerk free tier:** rejeitado por dependência de SaaS de terceiros, plano gratuito pode mudar.
- **OAuth 2.1 manual com `oidc-provider` (Panva):** rejeitado. ~14 dias de implementação, área crítica de segurança, sem benefício pra um app pessoal.
- **Apenas Claude Desktop com bearer estático:** rejeitado. Perde mobile, que é o caso central.
