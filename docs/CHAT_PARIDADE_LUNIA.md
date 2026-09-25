# Paridade do chat com a Lunia — análise de gaps e roadmap

## Contexto

A Lunia (serviço Python em `lunia/` + módulo Lunia no `imobbi-app-backend` + UI assistant-ui no
`imobbi-app-frontend`) é o agente mais maduro do ecossistema: grafo LangGraph com checkpointer,
human-in-the-loop nativo (`interrupt()`), plano, artefatos, orçamento, memória, anexos, ditado,
feedback, ledger de custo. O chat da Fatia (`apps/agent` + `apps/api/src/chat` + `apps/web`) já
tem streaming, tools MCP e confirmação de escrita, mas é stateless, sem histórico na UI e com UX
feita à mão. O objetivo é levar a Fatia à mesma capacidade, **portando a arquitetura da Lunia**.

Decisões de direção:

- **Recursos B2B:** adaptar ao Fatia (app pessoal self-hosted); o resto fica como "não se aplica".
- **Arquitetura:** portar a da Lunia — checkpointer Postgres + `interrupt()`/`resume` + protocolo
  SSE nativo do LangGraph.
- **LGPD/ADRs 015/021/022:** nova ADR; checkpointer no **mesmo Postgres da Fatia**, schema
  dedicado, coberto por `delete_my_account`/`export_my_data`/retenção; Bearer só no runtime
  context, nunca no state.
- **Front:** migrar o PWA para `@assistant-ui/react` + `react-langgraph`.
- **Superfície:** só PWA web (mobile Expo fora, como na ADR 022).

## Matriz de gaps (Lunia → Fatia)

Legenda: ✅ existe · 🟡 parcial · ❌ falta · ⛔ não se aplica · Fase = onde entra no roadmap.

| Funcionalidade                                                                                                                                          | Lunia                                        | Fatia hoje                                                | Fase                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Streaming de texto + markdown                                                                                                                           | ✅ protocolo nativo LangGraph                | ✅ protocolo próprio (`token/tool/proposal/usage/done`)   | 1/3                                                                                   |
| Tool calls MCP com Bearer do usuário                                                                                                                    | ✅                                           | ✅ `chat/mcp_client.py`                                   | 1                                                                                     |
| Checkpointer / `thread_id` escopado                                                                                                                     | ✅ `{company}:{user}:{chat}`                 | ❌ stateless, histórico no body (ADR 022)                 | 1                                                                                     |
| Hydrate de thread fria a partir do backend                                                                                                              | ✅ `hydrate` → `/lunia/messages/search`      | ❌                                                        | 1/2                                                                                   |
| HITL `confirm` (aprovação de escrita)                                                                                                                   | ✅ interrupt, card por ação, risco           | 🟡 dois turnos HTTP, `approved` ecoado pelo cliente       | 1/3                                                                                   |
| HITL `question` (`ask_user` com formulário tipado)                                                                                                      | ✅                                           | ❌                                                        | 1/3                                                                                   |
| HITL `continue` (orçamento esgotado)                                                                                                                    | ✅ `budget_gate` (tools, custo, relógio)     | ❌ corte duro `MAX_RODADAS_DE_TOOL=4` → `step_limit`      | 4                                                                                     |
| Pausa pendente restaurada após F5                                                                                                                       | ✅                                           | ❌ proposta vive só na tela                               | 2/3                                                                                   |
| Planner + evento `plan` / `step`                                                                                                                        | ✅                                           | ❌                                                        | 4                                                                                     |
| Validação + reflexão (retry único)                                                                                                                      | ✅ regras                                    | ❌                                                        | 4                                                                                     |
| Artefatos estruturados (`report/metric/timeline/comparison/...`)                                                                                        | ✅ via `structuredContent`                   | ❌ MCP só devolve texto (`mcp/mcp-tool.registry.ts`)      | 4                                                                                     |
| Evento `cost` / `context` + popovers de execução/contexto                                                                                               | ✅                                           | 🟡 só `usage` (ignorado no client)                        | 4                                                                                     |
| Ledger de runs (kind, status, tokens, custo, runId)                                                                                                     | ✅ `LuniaRun`                                | 🟡 `AiUsage` sem runId/status/kind                        | 2                                                                                     |
| Cota + medidor na UI                                                                                                                                    | ✅ semanal + meter + banner                  | 🟡 cota diária no back (`ai/ai-usage.service.ts`), sem UI | 4                                                                                     |
| Lista de conversas, busca, renomear, apagar                                                                                                             | ✅ sidebar agrupada, busca server-side       | ❌ na UI (API tem list/get/delete; sem rename/busca)      | 2/3                                                                                   |
| Nova conversa por UUID na URL (`/chat/[id]`)                                                                                                            | ✅                                           | ❌ id só num ref                                          | 3                                                                                     |
| Título por LLM                                                                                                                                          | ✅ `/lunia/title` (fallback "Nova Conversa") | 🟡 primeiros 60 chars                                     | 2                                                                                     |
| Evento `persisted` (ids das linhas gravadas)                                                                                                            | ✅                                           | ❌                                                        | 2                                                                                     |
| Feedback 👍/👎 + motivos                                                                                                                                | ✅ `review/reviewReasons/reviewNote`         | ❌                                                        | 4                                                                                     |
| Stop / copy / retry                                                                                                                                     | ✅ assistant-ui                              | 🟡 stop + retry manual                                    | 3                                                                                     |
| Edit / branch                                                                                                                                           | 🟡 UI-only (histórico linear)                | ❌                                                        | 3 (esconder `BranchPicker`; edit só na última)                                        |
| Sugestões iniciais                                                                                                                                      | 🟡 slot vazio                                | ✅ `SUGESTOES`                                            | 3 (manter)                                                                            |
| Memória do usuário (`remember`/`forget` + popover)                                                                                                      | ✅ `LuniaUserMemory`                         | ❌                                                        | 4                                                                                     |
| Contexto de tela (`extraContext`)                                                                                                                       | ✅ property/lead/enterprise                  | ❌                                                        | 4 (rotas de refeição/treino)                                                          |
| Citações de entidade (`<leadId>` → card)                                                                                                                | ✅                                           | ❌                                                        | 4 (opcional: `<mealId>`, `<sessionId>`)                                               |
| Anexo de imagem no chat (vision)                                                                                                                        | ✅ presign R2                                | ❌ removido do composer                                   | 5 (**sem persistência**, ADR 020)                                                     |
| Anexo PDF + `read_attachment`                                                                                                                           | ✅                                           | ❌                                                        | ⛔                                                                                    |
| Ditado (transcrição)                                                                                                                                    | ✅ `/lunia/transcribe`                       | ❌ protocolo declarado, #141                              | 5                                                                                     |
| Busca na web com fontes                                                                                                                                 | ✅                                           | ❌                                                        | ⛔ (subprocessador, #136)                                                             |
| Geração de imagem                                                                                                                                       | ✅                                           | ❌                                                        | ⛔                                                                                    |
| Prompts versionados / canary / Langfuse                                                                                                                 | ✅                                           | ❌                                                        | 6 (opcional, desligado por padrão)                                                    |
| Benchmark de chat (fixture/live + checks)                                                                                                               | ✅ 18 casos                                  | ❌ só benchmark de foto                                   | 6                                                                                     |
| Painel flutuante Ctrl+J                                                                                                                                 | ✅                                           | ❌                                                        | ⛔ (PWA mobile-first com bottom nav)                                                  |
| Créditos/pacotes/checkout, tiers por empresa, instruções da empresa, política de automação por risco, painel System Luno, kill switch, admin de modelos | ✅                                           | —                                                         | ⛔ (ADR 022 já cumpre o papel da política; `/chat/availability` cumpre o kill switch) |

Bugs/dívidas encontrados na Fatia que entram de carona:

- `agent-chat.client.ts` `traduzirErro` converte todo 401/403 do agente (inclusive
  `MCP_UNAUTHORIZED`, token expirado) em 503 → deve virar 401. (Fase 2)
- `packages/api-client/src/chat.ts` descarta `done.reason` e não conhece `MCP_*`,
  `AGENT_STREAM_INTERRUPTED`, `CHAT_INTERNAL_ERROR` → tudo vira `AI_UNKNOWN_ERROR`. (Fase 3)
- `ConfirmationCard` só rotula 10 das 35 tools confirmáveis (`ROTULOS`). (Fase 3)
- Docs desatualizadas dizendo "chat só lê": `docs/ARCHITECTURE.md`, `apps/agent/README.md`,
  docstring de `/chat` em `api.py`. (Fase 0)
- `revoke_data_sharing` marcada `confirmableHint: true` — conferir com a ADR 022. (Fase 0)

## Arquitetura alvo

```
PWA (assistant-ui + useLangGraphRuntime) ──SSE nativo──▶ API NestJS /chat (proxy, persistência,
   cota, ledger, evento `persisted`) ──X-Fatia-Agent-Key + Bearer──▶ Agent FastAPI /chat
   (LangGraph: hydrate → planner → agent → tools → human_gate/budget_gate → validate → reflect)
   ├─ checkpointer AsyncPostgresSaver no schema `agent_checkpoint` do Postgres da Fatia
   └─ MCP /mcp da API (Bearer vindo do runtime context, nunca do state)
```

Invariantes a preservar da Fatia:

- Provedor próprio `providers/openai_compat.py` (allowlist `allowed_models.py`,
  `cf-aig-collect-log: false`) — **sem `langchain-openai`**; adaptador `BaseChatModel` próprio.
- Classificação em 3 camadas (ADR 022) por anotação: READ_ONLY executa, CONFIRMABLE vira
  `interrupt` kind `confirm`, RESTRICTED nunca é oferecida (`exigir_permitida`).
- A tool aprovada executa **exatamente** o `tool_call` guardado no checkpoint (substitui o eco de
  `approved` + `exigir_aprovada` — a garantia fica mais forte, o cliente não carrega argumentos).
- Mídia nunca persiste (ADR 004/020): nada de imagem/áudio no checkpoint, na tabela ou em bucket.

## Roadmap

### Fase 0 — ADR e docs (pré-requisito)

- `docs/ADR/023-checkpointer-no-postgres-da-fatia.md`: supera o trecho "sem checkpointer" das ADRs
  021/022 e o header de `apps/agent/src/fatia_agent/chat/graph.py`. Define schema dedicado, role
  com acesso só a ele, `thread_id = {userId}:{conversationId}`, purga/exportação/retenção, Bearer
  no `context` do `astream` (não serializado), strip de blocos de mídia antes de gravar.
- Atualizar `docs/DATA_RETENTION.md`, `docs/THREAT_MODEL.md` (vetor 10), `docs/ARCHITECTURE.md`,
  `apps/agent/README.md`, `docs/ADR/README.md`.

### Fase 1 — Núcleo do agente (porta de `lunia/src/lunia/agent/*` e `streaming/events.py`)

- `apps/agent/src/fatia_agent/providers/langchain_adapter.py`: `BaseChatModel` sobre
  `OpenAICompatProvider` com `_astream` emitindo `AIMessageChunk` (texto, `tool_call_chunks`,
  `usage_metadata`) — é o que faz o stream mode `messages` funcionar.
- Deps: `langchain-core` explícito, `langgraph-checkpoint-postgres`, `psycopg[binary,pool]`.
- `chat/checkpointer.py` (porta de `lunia/agent/checkpointer.py`): lifespan, `setup()`,
  `InMemorySaver` só em dev.
- `chat/state.py` + `chat/graph.py` reescritos no desenho da Lunia (`GraphState` com
  `add_messages`, `merge_plan`, contadores por run; `AgentContext` congelado). Nesta fase:
  `hydrate`, `agent`, `tools`, `human_gate` (kinds `confirm` e `question`). Planner/budget/
  validate/reflect ficam para a Fase 4.
- `chat/tools/human.py`: `ask_user(prompt, fields)` local (porta direta).
- `chat/streaming.py`: frames nativos (`messages`, `updates` com `__interrupt__`,
  `messages/complete`) + eventos próprios `start`, `cost`, `error`, `done{status}`; filtra
  `hydrate`, remove `artifact` bruto de ToolMessage.
- `ChatRequest` novo: `{conversationId, userId, messages:[só a nova], resume?:{interruptId, value},
timezone}`; `userId` confiável porque só a API (com `X-Fatia-Agent-Key`) chama. Checagem de
  `interruptId` pendente (`_pending_interrupt_id`). Remove `history`, `approved`, evento `proposal`.
- `DELETE /threads/{userId}` e `DELETE /threads/{userId}/{conversationId}` para purga.
- Testes: portar/adaptar `tests/chat/test_graph.py`, `test_confirmacao.py` (agora resume),
  `test_sem_vazamento.py` (Bearer nunca no checkpoint — ler o blob gravado e procurar o token).

### Fase 2 — API NestJS (porta de `LuniaProxyService` / `lunia.service.ts`)

- `apps/api/src/chat/chat.service.ts`: `absorb()` que lê frames nativos, monta transcript
  (porta de `lunia-transcript.ts`), grava `Message.metadata {status, transcript, interrupt}` e emite
  `persisted {assistantMessageId, messageId}`; heartbeat `: keep-alive`; upstream segue se o
  cliente cair (resposta gravada e cobrada).
- Rotas: `POST /chat` (body `{conversationId, messages}` | `{conversationId, resume}`; conversa
  criada no primeiro envio), `GET /chat/conversations?q=` (busca), `PATCH /chat/conversations/:id`
  (rename), `DELETE` (apaga + purga thread), `GET /chat/conversations/:id/messages` (hydrate do
  agente e `load` do front), `PATCH /chat/messages/:id/feedback`, `GET /chat/quota`.
- Prisma (`packages/db/prisma/schema.prisma`): `Message` + `metadata Json?`, `runId`, `review`,
  `reviewReasons`, `reviewNote`; `AiUsage` + `runId @unique`, `kind`, `status`, tokens (idempotente
  por `runId`); `UserMemory` (Fase 4). Migration.
- Título por LLM: `POST /title` no agente, disparado sem `await` após o 1º turno.
- `users/account.service.ts`: delete chama a purga do agente; export inclui conversas/memórias.
- Fix de `traduzirErro` (401 → 401). DTOs novos em `chat/dto/chat.dto.ts`.

### Fase 3 — PWA com assistant-ui (porta de `imobbi-app-frontend/src/{hooks,services,lib}/lunia/*`)

- Deps: `@assistant-ui/react`, `@assistant-ui/react-langgraph`, `@assistant-ui/react-markdown`.
- `packages/api-client/src/chat.ts`: `streamChat` sobre frames nativos (porta de
  `services/lunia/lunia-stream.ts` `drainFrames`/`parseFrame`), funções de conversas/quota/feedback,
  códigos de erro completos.
- `apps/web/src/components/chat/`: `use-chat-runtime.ts` (porta de `use-lunia-runtime.ts`:
  `stream`, `load`, `encodeResume`/`decodeResume`, `onCustomEvent`), `run-state.ts`
  (`applyLuniaEvent`), `history.ts` (`historyToMessages`, `pendingInterrupt`), `thread.tsx`,
  `thread-list.tsx` (Hoje/Ontem/Anteriores, busca, rename, delete), `interrupt.tsx` + `ask-user.tsx`
  (question/confirm/continue), `tool-fallback.tsx` com rótulos pt-BR para **todas** as tools.
- Rotas: `app/(app)/chat/page.tsx` redireciona para `/chat/[id]` com `randomUUID()`;
  `app/(app)/chat/[id]/page.tsx`. Lista em Sheet no mobile.
- Manter o que já é bom: composer acima da bottom nav (#255), `aria-live` sem spam, sugestões,
  checagem `/chat/availability` para esconder a aba.
- Apagar o antigo: `use-chat-stream.ts`, `chat-view.tsx`, `confirmation-card.tsx`,
  `elements/tool-call.tsx`, `elements/mobile-composer.tsx` e `streamdown` se ficarem órfãos, e
  seus testes; reescrever `__tests__`.

### Fase 4 — Recursos ricos

- Agente: `planner` (2–5 passos, `plan`/`step`), `budget_gate` (tools/custo/relógio, kind
  `continue`, substitui `step_limit`), `validate` (vazio, "como uma IA", UUID sem tag, conselho
  médico) + `reflect`, evento `context`.
- Artefatos: `apps/api/src/mcp/mcp-tool.registry.ts` passa a devolver `structuredContent`; tools
  de resumo/progresso (ex.: `get_today_summary`, `get_week_summary`, `get_weight_progress`,
  `list_meals`, `get_strength_progress`) publicam `metric`/`report`/`timeline`/`comparison`;
  componentes de artefato no web (reusar gráficos de `components/progress`).
- Memória: `UserMemory` + tools MCP `remember`/`forget` (ambas CONFIRMABLE, pela ADR 022 — é
  escrita de dado pessoal), injeção cercada no prompt, popover na UI, entra no export/delete.
- Feedback 👍/👎 + diálogo de motivos; medidor de cota; popover de execução (tokens/custo);
  contexto de tela a partir da rota (refeição/sessão de treino abertas); citações opcionais.

### Fase 5 — Multimodal (respeitando ADR 004/020)

- Foto no chat: EXIF removido no dispositivo, bytes inline no body (sem presign/bucket), agente
  converte em bloco `image_url` só para a chamada ao modelo e grava no checkpoint um placeholder
  ("📷 foto enviada"); modelo `AI_MODEL_VISION` quando houver imagem; recusa se o modelo não tem
  visão.
- Ditado (#141): `POST /transcribe` no agente (porta de `lunia/speech.py`), áudio só em memória;
  hook de ditado (porta de `use-lunia-dictation.ts`) preenchendo o composer sem enviar.

### Fase 6 — Qualidade e observabilidade

- Benchmark de chat em `apps/agent/eval/chat/` (porta de `lunia/benchmark/*`: modo fixture com
  schemas MCP reais, checks determinísticos, casos: leitura, escrita com confirmação, ambíguo que
  pergunta, injeção em registro, fora de escopo, fuso/data).
- Job de CI para Python (ruff, mypy, pytest).
- Langfuse/prompt versionado: opcional, desligado por padrão, com `mask()`; só na instância
  oficial após revisão de subprocessador (#136).

### Ordem de deploy

Fases 1–3 são **breaking** (protocolo SSE e body de `POST /chat` mudam): agente, API e web sobem
juntos no mesmo `docker compose`. Migration Prisma antes da API. Nenhuma conversa antiga se perde
(Message continua); threads frias são reidratadas pelo `hydrate`.

## Verificação por fase

- Agente: `uv run pytest -q`, `uv run ruff check`, `uv run mypy`; teste que lê o checkpoint gravado
  e prova ausência do Bearer e de bytes de mídia.
- API/web: `pnpm lint`, `pnpm typecheck`, `pnpm test` (turbo).
- E2E manual com `pnpm dev` + Playwright em `/chat`: leitura; escrita → card → aprovar executa uma
  vez com os argumentos exibidos; rejeitar não grava; `ask_user` com formulário; `continue` do
  orçamento; F5 com pausa pendente restaura o card; renomear/buscar/apagar conversa (checar via SQL
  que `agent_checkpoint.checkpoints` do thread sumiu); `delete_my_account` purga todos os threads;
  `export_my_data` inclui conversas e memórias.
