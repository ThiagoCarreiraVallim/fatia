# OAuth do MCP — fluxo ponta a ponta

> Entregável da issue #91 (frente 1 da épica #38). Documenta como o Fatia satisfaz a
> [spec de autorização do MCP](https://modelcontextprotocol.io/specification/draft/basic/authorization)
> sem que o cliente precise configurar nada, e onde cada endpoint aterrissa no Logto.
>
> A decisão de usar o Logto como IdP está na [ADR 008](./ADR/008-logto-oidc-provider.md).

## O problema que o facade resolve

A spec do MCP exige que o servidor exponha **Dynamic Client Registration** (RFC 7591): o Claude
precisa se registrar sozinho, sem ninguém copiar client id e secret na mão.

O Logto é um IdP OIDC completo, mas **não expõe DCR público**. Registrar um app exige a
Management API, autenticada.

A saída foi a API NestJS agir como **Authorization Server público** — com DCR, `/oauth/authorize`
e `/oauth/token` próprios — e **federar internamente** para o Logto usando um único app
pré-registrado. Para o Claude, o Logto é invisível.

```
Claude  ──►  API do Fatia (AS público, faz DCR)  ──►  Logto (IdP real)
             apps/api/src/auth/oauth-facade.*          um app fixo
```

## Mapeamento endpoint → Logto

| O que o cliente MCP chama                     | Arquivo                                   | Para onde vai                                                                  |
| --------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /.well-known/oauth-protected-resource`   | `oauth-discovery.controller.ts`           | Nada. Responde metadata apontando a própria API como AS                        |
| `GET /.well-known/oauth-authorization-server` | `oauth-discovery.controller.ts`           | Nada. Anuncia os endpoints abaixo, `S256` e `token_endpoint_auth_method: none` |
| `POST /oauth/register` (DCR, RFC 7591)        | `oauth-facade.{controller,service}.ts`    | Nada. Cria uma linha `McpOAuthClient` local com `client_id` = `mcp_<hex32>`    |
| `GET /oauth/authorize`                        | idem                                      | Redireciona para `GET {LOGTO_ENDPOINT}/oidc/auth`                              |
| `GET /oauth/callback`                         | idem                                      | Recebe o Logto e redireciona ao `redirect_uri` do cliente                      |
| `POST /oauth/token`                           | idem                                      | `POST {LOGTO_ENDPOINT}/oidc/token`                                             |
| `POST /mcp` (autenticado)                     | `mcp.controller.ts` + `jwt-auth.guard.ts` | Valida o JWT via JWKS do Logto                                                 |

Os endpoints de discovery e o `/oauth/*` são marcados com `@Public()` — precisam responder sem
token, senão o fluxo nunca começa.

## O fluxo, passo a passo

### 1. Descoberta

O Claude faz `GET /.well-known/oauth-protected-resource`, recebe `authorization_servers: [<base
url da API>]`, e então busca `/.well-known/oauth-authorization-server` naquela base.

A base URL é derivada de `X-Forwarded-Proto` / `X-Forwarded-Host` — não é hardcoded. É o que
permite a mesma imagem rodar em localhost e atrás do Traefik.

### 2. Dynamic Client Registration

```http
POST /oauth/register
{ "redirect_uris": ["https://claude.ai/api/mcp/auth_callback"], "client_name": "Claude" }
```

Resposta: `client_id` novo, `token_endpoint_auth_method: "none"`. **Cliente público** — não há
segredo, e a autenticação do token endpoint é o PKCE.

### 3. Authorization request

```http
GET /oauth/authorize?client_id=...&redirect_uri=...&code_challenge=...&code_challenge_method=S256&state=...
```

O facade valida que o `redirect_uri` foi registrado para aquele `client_id` e que há
`code_challenge` — **PKCE é obrigatório**, não opcional.

Então grava um `McpOAuthAuthorization` e redireciona ao Logto. Três detalhes que não são óbvios:

- **Dois PKCE independentes.** O `code_challenge` do cliente fica guardado em
  `clientCodeChallenge` para ser verificado no passo 5. O facade gera um **segundo** par
  (`logtoCodeVerifier`) para a sua própria conversa com o Logto. Um não vaza no outro.
- **Dois `state`.** O `state` enviado ao Logto é gerado pelo facade e é a chave da linha. O
  `state` original do cliente vai para `clientState` e volta no redirect final — sem ele o Claude
  descarta o callback.
- **`resource` normalizado.** Clientes MCP costumam mandar o resource com barra no final. O Logto
  faz match exato e responde `invalid_target`. `resolveResource()` sempre devolve o
  `LOGTO_AUDIENCE` configurado, ignorando o que veio.

O scope enviado ao Logto sempre inclui `openid` e **`offline_access`** — sem o segundo o Logto
não emite refresh token, e o Claude perderia o acesso a cada expiração.

### 4. Callback

O usuário faz login no Logto (a mesma conta do PWA) e consente. O Logto chama
`GET /oauth/callback?code=<logto>&state=<nosso>`.

O facade encontra a linha pelo `state`, guarda o `logtoCode`, **cunha um código próprio** e
redireciona ao `redirect_uri` do cliente com esse código e com o `clientState`.

O código entregue ao cliente **não** é o código do Logto. O do Logto nunca sai do servidor.

### 5. Token exchange

```http
POST /oauth/token
grant_type=authorization_code&code=<nosso>&redirect_uri=...&client_id=...&code_verifier=...
```

Antes de falar com o Logto, o facade verifica, em ordem:

1. o código existe e já passou pelo callback (`logtoCode` presente);
2. não foi usado (`consumedAt` nulo) — **uso único**;
3. não expirou (`expiresAt`), TTL de 10 minutos;
4. o `client_id` é o mesmo que iniciou o fluxo;
5. o `redirect_uri` é o mesmo;
6. `SHA256(code_verifier) === clientCodeChallenge` — **PKCE**.

Só então troca o `logtoCode` pelos tokens no Logto, usando o `logtoCodeVerifier`, e marca
`consumedAt`.

Os tokens do Logto são repassados ao cliente **sem serem armazenados**.

### 6. Chamadas ao `/mcp`

`Authorization: Bearer <jwt>`. O `JwtAuthGuard` valida assinatura via JWKS, `iss`, `aud`, `exp` e
`sub`, e resolve o `sub` para o `User` local — provisionando na primeira vez.

### Refresh

`grant_type=refresh_token` é repassado ao Logto. O facade não guarda refresh tokens.

## Variáveis de ambiente

| Variável                       | Obrigatória | Para quê                                                                                                                            |
| ------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `LOGTO_ENDPOINT`               | sim         | URL pública do Logto                                                                                                                |
| `LOGTO_AUDIENCE`               | sim         | Identifier do recurso MCP no Logto. É o `aud` validado no JWT e o `resource` enviado — tem de bater **exatamente** com o registrado |
| `LOGTO_MCP_APP_ID`             | sim         | App "Traditional Web" no Logto para o facade                                                                                        |
| `LOGTO_MCP_APP_SECRET`         | sim         | Secret do app acima                                                                                                                 |
| `LOGTO_M2M_APP_ID` / `_SECRET` | não         | Só para `delete_my_account` apagar a identidade — ver [DATA_RETENTION](./DATA_RETENTION.md)                                         |

**Redirect URI a cadastrar no app MCP do Logto:** `{URL pública da API}/oauth/callback`.

## Segurança do facade

- **PKCE obrigatório** no authorize; verificado no token exchange.
- **Código de uso único**, TTL de 10 minutos, com `consumedAt` no banco.
- **`redirect_uri` só da allowlist** registrada via DCR.
- **Vínculo de cliente**: um `client_id` não resgata código de outro, mesmo com o verifier certo.
- **Callback não reutilizável**: `state` já consumido é recusado.
- **Limpeza de authorizations expiradas** no início de cada authorize. Elas nunca dão acesso
  (a validação checa `expiresAt`/`consumedAt`), mas guardavam material criptográfico de todo login
  já feito.

Coberto por `apps/api/src/auth/__tests__/oauth-flow.e2e.spec.ts` (fluxo completo contra Postgres
real, com só o Logto stubado) e por `oauth-facade.service.spec.ts` (por passo, com mocks).

### Rotação das credenciais do app MCP

Trocar `LOGTO_MCP_APP_SECRET` no console do Logto e no ambiente. Invalida fluxos em andamento
(janela de 10 min) mas **não** os tokens já emitidos — quem já está conectado segue conectado até
o token expirar, e o refresh volta a funcionar com o secret novo. Não há necessidade de reconectar
os clientes.

## Revogação (RFC 7009) — decisão

**O facade não expõe `POST /oauth/revoke`, e isso é deliberado.**

Os tokens são emitidos e assinados pelo Logto, não pelo facade — ele nunca os armazena. Um
endpoint de revogação aqui teria de repassar ao Logto, ou seja: seria uma casca sem estado
próprio a revogar.

A spec de autorização do MCP **não exige** revocation endpoint, e o metadata em
`/.well-known/oauth-authorization-server` não anuncia `revocation_endpoint` — clientes conformes
não vão procurá-lo.

O que existe hoje para cortar acesso:

- **No Claude:** remover o conector descarta os tokens do lado do cliente.
- **No Logto:** o console permite invalidar sessões e apagar o usuário.
- **No Fatia:** apagar a conta (`delete_my_account`) remove o `User`, e o token vira inútil — o
  `sub` deixa de resolver.

O que **falta**, e está registrado como limitação em
[`docs/THREAT_MODEL.md`](./THREAT_MODEL.md): não há como o usuário revogar uma sessão específica
pela interface do Fatia sem apagar a conta.

**Reabrir esta decisão se:** a Anthropic pedir revocation na submissão, ou o Fatia passar a emitir
tokens próprios em vez de repassar os do Logto.

## Validar no Claude

Automatizado não cobre — precisa ser feito à mão uma vez, contra a instância hospedada:

1. Claude → Settings → Connectors → Add custom connector, apontando para `{API}/mcp`.
2. Confirmar que o Claude **não pede** client id nem secret (prova o DCR).
3. Concluir o login no Logto e aceitar o consentimento.
4. Pedir ao Claude "quais tools do Fatia você tem?" — deve listar as 87.
5. Pedir "registre uma refeição de teste" e "inicie um treino" — o critério de pronto da épica #38.
6. Conferir no banco que há um `McpOAuthClient` com `lastUsedAt` preenchido.
