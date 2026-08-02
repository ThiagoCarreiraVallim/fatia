# Checklist de submissão ao diretório de conectores da Anthropic

> Auditoria de 31/07/2026 dos requisitos oficiais contra o código e as issues.
> Fontes: [submission](https://claude.com/docs/connectors/building/submission),
> [pre-submission checklist](https://claude.com/docs/connectors/building/review-criteria),
> [authentication](https://claude.com/docs/connectors/building/authentication),
> [Software Directory Terms](https://support.claude.com/en/articles/13145338-anthropic-software-directory-terms),
> [Software Directory Policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
>
> Fatia é um **remote MCP server** (não MCPB, não MCP App): a submissão acontece no
> portal dentro do admin settings do claude.ai, não mais no Google Form registrado
> na #38 e na #97.

## Sumário

| Bloco                               | Itens | Situação                            |
| ----------------------------------- | ----: | ----------------------------------- |
| A. Lacunas encontradas na auditoria |     9 | trakeadas em #169, #170, #171 e #97 |
| B. Trakeado antes desta auditoria   |     6 | #91, #93, #96, #97, #113, #114      |
| C. Escopo que a doc atual dispensa  |     3 | pode sair do caminho crítico        |

Mapa das lacunas para issues:

| Item                                        | Issue                     |
| ------------------------------------------- | ------------------------- |
| A1 — anotações das 94 tools                 | #169                      |
| A2 — org Team/Enterprise                    | ✅ resolvido (Team ativo) |
| A3–A6 — hardening do OAuth para o diretório | #170                      |
| A7 — validação funcional + conta de teste   | #171                      |
| A8–A9 — compliance e conteúdo da listagem   | #97                       |

O caminho crítico era **#169 → B(#114, #93) → #170 → #171 → #97**.
Com #114, #91 e a maior parte da #93 fechadas em 31/07, encurtou para
**#169 → #170 → #171 → #97**.

---

## A. Lacunas encontradas na auditoria

> Nenhuma delas estava trakeada quando esta auditoria rodou. Todas ganharam issue depois — ver o mapa acima.

### A1. Anotações das tools — bloqueador duro 🔴 (#169)

Requisito 2 da submissão e item obrigatório do review: **toda tool precisa de `title` e
do hint aplicável** (`readOnlyHint: true` para leitura, `destructiveHint: true` para
quem modifica ou apaga). Os hints definem as auto-permissões no Claude: read-only roda
sem confirmação por chamada, destructive sempre pergunta.

Estado do código: **nenhuma anotação existe**. `grep -r "readOnlyHint\|destructiveHint\|annotations" apps/api/src` retorna zero.

- `McpToolDef` (`apps/api/src/common/decorators/tool.decorator.ts`) só tem
  `name`, `description`, `inputSchema` e `execute` — não há campo para `title` nem `annotations`.
- `McpToolRegistry.bindAll()` (`apps/api/src/mcp/mcp-tool.registry.ts:50`) chama
  `registerTool(tool.name, { description, inputSchema }, handler)` — o terceiro campo
  de metadata simplesmente não é passado.

Impacto: o passo **Tools** do portal sincroniza a superfície do servidor e sinaliza
tools sem título ou anotação, pedindo correção **antes** de submeter. Sem isso a
submissão não avança, e são **94 tools** afetadas.

Trabalho:

- [ ] Estender `McpToolDef` com `title: string` e `annotations: { readOnlyHint?: true; destructiveHint?: true }`.
- [ ] Passar os dois no `registerTool` do registry.
- [ ] Preencher nas 94 tools. A separação é mecânica pelo prefixo do nome:
      `get_*` / `list_*` / `search_*` / `explain_*` / `export_*` → `readOnlyHint`;
      `delete_*` (13 tools) e `delete_my_account` → `destructiveHint`;
      `log_*` / `create_*` / `update_*` / `set_*` / `add_*` / `remove_*` / `start_*` /
      `finish_*` / `complete_*` / `clone_*` / `reorder_*` → escrita não destrutiva
      (`readOnlyHint` ausente, sem `destructiveHint`).
- [ ] Estender `apps/api/src/mcp/__tests__/tool-catalog.spec.ts` para falhar se qualquer
      tool registrada estiver sem `title` ou sem hint — mesma trava anti-drift já usada no catálogo.

### A2. Organização Team/Enterprise no claude.ai ✅

O portal de submissão vive em **admin settings** e não existe em plano individual.

- [x] Ter uma organização **Team ou Enterprise** no claude.ai — **Team já ativo**.
- [x] Submeter como **Owner/Primary owner** (ou, no Enterprise, criar um custom role com
      a permissão **Directory management** e atribuí-lo). No Team isso fica só com Owners.
- [x] Atualizar a #97 e o comentário da #38: o
      [Google Form](https://docs.google.com/forms/d/e/1FAIpQLSeafJF2NDI7oYx1r8o0ycivCSVLNq92Mpc1FPxMKSw1CzDkqA/viewform)
      registrado lá **não é mais o caminho** para remote servers — ele cobre desktop
      extensions (MCPB). O nosso é o
      [portal](https://claude.ai/admin-settings/directory/submissions/new).

### A3. `resource` do protected-resource metadata × URL que o usuário digita 🟠 (#170)

A doc é explícita: o campo `resource` do documento de metadata **deve casar exatamente
com a URL do servidor MCP como o usuário a digita no Claude, incluindo o path**.

- `apps/api/src/auth/oauth-discovery.controller.ts:22` devolve `resource: LOGTO_AUDIENCE`.
- **Verificado em produção (01/08/2026)**: o discovery devolve
  `{"resource":"https://api.fat.ia.br", ...}` — **sem path**.
- A URL que a pessoa cola é `site.mcpUrl` = `https://api.fat.ia.br/mcp` — **com path**.
- A divergência é real e está no ar agora. Os arquivos de exemplo também citam domínios
  obsoletos (`api.fatia.local`, `api.fatia.app.br`), o que confunde quem for corrigir.

Trabalho:

- [ ] Decidir a URL canônica do conector e alinhar `resource`, `LOGTO_AUDIENCE` e `site.mcpUrl`.
- [ ] Confirmar o `aud` que o Logto emite continua batendo com o que o `jwt-validation.service.ts` valida.
- [ ] Corrigir o domínio obsoleto no `.env.production.example`.

O `WWW-Authenticate: Bearer resource_metadata=…` no 401 **já está implementado**
(`apps/api/src/auth/jwt-auth.guard.ts:50-52`), que é o caminho mais confiável de
descoberta — esse ponto está OK.

### A4. Erros RFC 6749 no `/token` 🟠 (#170)

A doc pede códigos de erro compatíveis com RFC 6749 (`invalid_grant`, não `invalid_request`
nem código próprio) quando um refresh token deixa de valer — é o que o Claude usa para
decidir refazer o consentimento em vez de falhar em loop.

Hoje `apps/api/src/auth/oauth-facade.controller.ts` lança `BadRequestException`, que
serializa como `{ statusCode, message }` — não `{ "error": "invalid_grant" }`.

- [ ] Mapear as falhas do `/oauth/token` para o envelope de erro OAuth
      (`error`, `error_description`), inclusive o repasse do erro do Logto.
- [ ] Confirmar e documentar a **rotação de refresh token** — DCR/CIMD registram o Claude
      como _public client_, e a spec exige rotacionar ou sender-constrain. Hoje delegado
      ao Logto (ADR 008); verificar o comportamento real e registrar.
- [ ] Confirmar que o `/token` aceita `application/x-www-form-urlencoded` (o Nest liga os
      dois parsers por default, mas vale um teste explícito) e que `/oauth/register`
      continua aceitando `application/json`.

### A5. Rate limit e latência × infraestrutura da Anthropic 🟠 (#170)

O tráfego da Anthropic sai de **`160.79.104.0/21`** — uma faixa compartilhada por
_todos_ os usuários do conector.

- `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])` em `apps/api/src/app.module.ts:33`
  é global e, fora do `/mcp`, chaveia por **IP**. Discovery, `/oauth/register` e
  `/oauth/token` de todo mundo cairiam no mesmo bucket de 100/min → 429 em massa no
  momento em que o conector ganhar tração.
- Orçamento de latência: **10s** para discovery, registration e token; **30s** para
  refresh. O facade adiciona um hop ao Logto em cada um deles.

Trabalho:

- [ ] Isentar (ou elevar bastante) o throttle nas rotas `/.well-known/*` e `/oauth/*`,
      ou chavear por `client_id` em vez de IP.
- [ ] Garantir que Traefik/Dokploy não bloqueiam nem rate-limitam a faixa de egress.
- [ ] Medir p95 de discovery, register, token e refresh em produção contra os limites acima.
- [ ] Manter o `/mcp` em 60/min por usuário (`mcp-throttler.guard.ts` já chaveia por
      `user.id`) — suficiente para o teste funcional do reviewer.

### A6. Decisão DCR × CIMD 🟡 (#170)

Para servidores que esperam tráfego do diretório, a doc recomenda **CIMD ou credenciais
mantidas pela Anthropic em vez de DCR**: com DCR o Claude registra um cliente novo a cada
conexão nova, inflando a tabela `McpOAuthClient` indefinidamente.

Fatia já anuncia `token_endpoint_auth_methods_supported: ['none']` — metade da condição.
O Claude só escolhe CIMD se o metadata trouxer **também**
`"client_id_metadata_document_supported": true`.

- [ ] Decidir: manter DCR, adicionar suporte a CIMD, ou pedir `oauth_anthropic_creds`
      (por e-mail para `mcp-review@anthropic.com`). Registrar em ADR.
- [ ] Se ficar em DCR: definir TTL/limpeza de clientes registrados e órfãos.

### A7. Exercitar as 94 tools de ponta a ponta 🟠 (#171)

Requisito explícito do "before you submit", e o passo **Test & launch** do portal pede
confirmação de que você rodou **cada** tool. Reviewers fazem teste funcional por tool, e
erro genérico ("Internal Server Error", "Bad Request" sem detalhe) reprova.

- [ ] Rodar as 94 tools no [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector).
- [ ] Rodar as 87 como **custom connector** no Claude.
- [ ] Criar a **conta de teste populada** (refeições, planos, sessões, séries, pesos,
      passos, água, metas) e escrever o passo a passo de acesso para o reviewer —
      cada link, credencial e etapa.

### A8. Respostas de data handling e compliance 🟡 (#97)

- [ ] **Dado de saúde pessoal**: o portal pergunta explicitamente. Peso, medidas e
      alimentação são dado sensível (Art. 5º II da LGPD, já reconhecido na #112) —
      responder **sim** e ter a política de privacidade coerente com isso.
- [ ] **API própria**: ✅ o servidor chama a API do próprio Fatia, e o domínio MCP casa
      com o serviço. Nenhum proxy de terceiro.
- [ ] **Sem transação financeira** ✅ e **sem geração de imagem/vídeo/áudio por IA** ✅.
      Atenção: se a #139 (registro de refeição por foto) subir antes da submissão, a
      redação precisa deixar claro que é _reconhecimento_ de imagem, não _geração_.
- [ ] **Sem coleta de dado de conversa** ✅ e nada de consultar memória, histórico de chat
      ou arquivos do usuário ✅ — confirmar na revisão final.
- [ ] Aceitar os **7 acknowledgments** do passo Compliance (todos obrigatórios).

### A9. Conteúdo da listagem, com os limites do portal 🟡 (#97)

Ter pronto **antes** de abrir o portal (o progresso salva no browser, mas só na sessão):

- [ ] Nome do servidor — até **100** caracteres.
- [ ] Tagline — até **55** caracteres.
- [ ] Descrição — até **2.000** caracteres. Não é editável pela Anthropic depois.
- [ ] **1 a 5 categorias**.
- [ ] URL de documentação, URL de política de privacidade, contato de suporte, ícone.
- [ ] **Slug da listagem — permanente depois de publicado.** Escolher com cuidado.
- [ ] Casos de uso primários, pré-requisitos para conectar (conta, plano) e se o conector
      lê, escreve ou os dois (no caso do Fatia: os dois).
- [ ] Nome e site da empresa + contato primário para o review.

---

## B. Trakeado antes desta auditoria

> Atualizado em 01/08/2026. Quatro das seis fecharam desde a auditoria.

| Issue | Estado                                                                          | Bloqueia a submissão?     |
| ----- | ------------------------------------------------------------------------------- | ------------------------- |
| #114  | ✅ **fechada** — tenant configurado, DCR e PKCE verificados contra produção     | não                       |
| #93   | 🟡 domínio, SSL e backup com drill de restore prontos; falta só `ALERT_WEBHOOK` | não                       |
| #91   | ✅ **fechada** — conector validado no Claude mobile                             | não                       |
| #113  | Rota `/docs` pública (PT-BR + EN)                                               | Parcial — ver nota abaixo |
| #96   | 🟡 landing e conteúdo institucional no ar; falta o vídeo (que a doc dispensa)   | não (ver bloco C)         |
| #97   | Montar o pacote e submeter                                                      | é a submissão             |

Sobre a #113: a exigência real é **documentação pública até a data de publicação**, e a
doc diz que _um blog post ou artigo de help center basta_. Durante o review a documentação
pode ser compartilhada em privado. Então a rota `/docs` completa é desejável, mas o gate
pode ser cumprido com menos.

Fora do caminho crítico: #39 (observabilidade), #111 (exemplos de invocação nas
descrições — não é requisito). As frentes #92 (isolamento multi-tenant), #94 (polish das
tools) e #95 (LGPD) estão fechadas, e a #112 (revisão jurídica) também.

O tracking vive no GitHub Project **Fatia Project** (75 itens, com Status e Priority
preenchidos) e nas sub-issues nativas da épica #38.

---

## C. Escopo que a doc atual dispensa

Vale cortar do caminho crítico:

1. **Vídeo demo de 30s não é requisito de submissão.** A doc é explícita: _"Video/GIF: not
   accepted"_. Segue valendo como peça de marketing, mas não é gate. (Está na #96.)
2. **Screenshots de carrossel são só para MCP Apps.** Fatia não usa `ui/open-link`
   (`grep` = 0 ocorrências) nem expõe UI interativa → não é MCP App → sem os 3–5 PNGs
   de 1000px+.
3. **Allowed link URIs não se aplicam** — mesma razão: nenhuma chamada a `ui/open-link`.

Também sem ação: a listagem entra por padrão como **community connector**, e a escalada
para _verified_ é avaliada automaticamente pela Anthropic.

---

## Ordem sugerida

1. **#169** (anotações das 94 tools) — único bloqueador puramente de código, e o passo
   Tools do portal trava nele.
2. **#114 + #93** (Logto em produção, DNS, bucket, drill de restore) — destravam a
   validação real do conector.
3. **#170** (metadata, erros OAuth, throttle e latência) — o que o reviewer encontra ao
   conectar. A decisão DCR × CIMD pode ficar registrada em ADR sem estar implementada.
4. **#91 + #171** (validar o fluxo no Claude; exercitar as 94 tools no Inspector e no
   Claude; conta de teste populada).
5. **#97 + #113** (conteúdo da listagem, respostas de compliance, documentação pública).
6. **#97** — abrir o portal e submeter.

> A2 (org Team) está resolvido e não entra mais na fila.
