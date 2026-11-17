# HANDOFF #384 — Chat com IA (redesign 17/50)

Worktree: `.claude/worktrees/384-chat`, branch `redesign/384-chat` (de `origin/main` ced73a8a).
Não fazer push nem PR. Pranchas baixadas em `/home/thiago/Documentos/pessoal/fatia/.canvas/project/`
(IA-*, Al-M6, Al-M16, Al-M17, Al-M20..M23).

## Decisões (fechadas)

- **D1 Contrato de cartão:** `McpToolDef.card` (formato do cartão, leitura) e `appOnly`
  (`{ screen, path }`, ações restritas) declarados em cada tool; spec em `tool-catalog.spec.ts`.
  Não vão no fio do MCP (hash `SHA_ENTIDADE` não muda). Servidos em `GET /chat/tool-catalog`.
  Formatos (kind do artefato): `metric`, `bars`, `timeline`, `list`, `report` (= Tabela, padrão),
  `range`, `progress`, `comparison`, `scoreboard`, `badges`, `instructions`, `file`, `sources`.
  Mais `app_only` (só no app) e `saved` (Gravado/Desfazer, só componente; quem emite é a #385).
- **D2 Só no app:** tool local do agente `open_in_app` (enum das restritas do catálogo MCP), nunca
  executa nada; emite artefato `app_only` com `tool` e `params`; o cliente monta o link pelo catálogo.
- **D3 Busca na web:** tool local `web_search(query)`, pelo OpenRouter (plugin `web`, engine `exa`,
  `max_tokens` 16). Medido em 2026-11-16: ~2,7 s, US$ 0,0071 por busca (Exa US$ 0,007), anotações
  `url_citation` com `url`, `title`, `content`. Só a query sai (sem histórico, sem sistema, sem id);
  e-mail e telefone são removidos. `webSearch` = `off | ask | on` vem da API; `ask` interrompe com
  `kind: 'web_consent'`. ZDR não cobre o plugin: o texto do aceite diz isso.
- **D4 Aceites:** tabela `AiConsent(userId, kind CHAT|WEB_SEARCH, version, acceptedAt)` +
  `User.webSearchEnabled` (padrão true). Sem aceite do chat na versão atual, `POST /chat` = 403
  `AI_CONSENT_REQUIRED`. Textos e versões em `@fatia/api-client` (`ai-consent.ts`).
  Provedores: "OpenRouter, que encaminha ao modelo GLM 5.3 Flash, da Z.ai"; busca "Exa, pelo OpenRouter".
- **D5 Pausa:** além do teto de voltas, o agente pausa depois de `AGENT_CHAT_PAUSE_AFTER_TOOLS`
  consultas no turno (padrão 14, o exemplo do canvas). "Já consultei N coisas. Continuo?".
- **D6 Lista:** estados já existiam (#369); entra `preview` (última fala) e agrupamento Hoje/Esta semana/Antes.
- **D7 Respostas rápidas:** helper puro no api-client a partir do estado (pausa, pergunta, última tool).
- **D8–D10:** cartão recolhe numa linha ✓ quando não é a última resposta; 2+ consultas seguidas
  agrupam ("Consultei N coisas"), nunca com falha; plano "n de m passos".

## Decisões do dono (mudaram durante a issue)

- **D11 Todo tool tem formato explícito** (sem Tabela padrão para quem não mapeou): leitura →
  um dos formatos de consulta; confirmável → `confirm` (Cartão de confirmação; `refresh_achievements`
  → `badges`, como na prancha); restrita → `appOnly`; locais do agente: `web_search` → fontes,
  `ask_user` → pergunta, `open_in_app` → só no app. Spec que reprova tool sem formato.
  O `artefatos.py` deixa de transformar `kind` desconhecido em `report`: descarta.
- **D12 Conversas antigas podem ser apagadas** se um layout mais limpo pedir; preferir o schema
  limpo a calço de compatibilidade. Registrar no REDESIGN_PROGRESS o que for apagado.
- **D13 Merge de `feat/chat-fotos-busca-fila-cartoes`** (base planejada da etapa 6): fila de
  mensagens, citar trecho, retry do `/mcp`, foto no R2 (fica para a #385 construir em cima),
  busca na web — manter só UMA implementação (a melhor), com cobrança na cota se fizer sentido.
  Migrations da branch precisam ordenar depois das da main. Regenerar números do MCP depois.

## Merge da `feat/chat-fotos-busca-fila-cartoes` (feito)

- Busca na web: ficou a da #384 (tool local `web_search`, pergunta limpa, aceite, cartão de
  fontes). Saiu a da branch (tool de servidor `openrouter:web_search` dentro da chamada do
  modelo, sem aceite, com a conversa inteira no contexto e fontes em markdown no texto):
  `WEB_SEARCH_TOOL`, `stream_chat(web_search=)`, `TurnEnd.sources`, `fontes.py`,
  `test_busca_na_web.py`. Ficou da branch a cobrança por busca: `usage.webSearches` →
  `leitor-do-turno.ts` → `AiUsage` `web_search`/`openrouter-web-search` (a `_search` manda 1).
- Ficaram: retry do `/mcp` (`FALHAS_TEMPORARIAS`), fila de mensagens, citar trecho, foto do chat
  no R2 (para a #385). Cartões da branch ficaram; `get_active_workout_session` virou Lista rica.
- ADR da foto do chat renumerada 038 → **046** (a 038 da main é a foto da refeição); só as
  referências que a branch criou mudaram.
- Migration da branch renomeada 20261105120000 → **20261117030000_chat_photos_in_media_file**.
- `reencode` do `media.service` ganhou `{ side, format }` para servir as duas fotos.

## Checklist

- [x] 1. API: `card`/`appOnly` em todas as tools + spec + `GET /chat/tool-catalog`
- [x] 2. API: aceites + preferência da busca (migration, endpoints, trava do chat, export/exclusão, isolamento)
- [x] 3. Agente: formatos novos, `open_in_app`, `web_search` + aceite, pausa por consultas, env
- [x] 4. API: artefatos dos formatos novos nas tools (produtores) + preview na lista
- [x] 5. api-client (`chat-cards.ts`: catálogo, `AGENT_LOCAL_TOOLS`, `appOnlyHref`, `groupToolCalls`, `quickReplies`, `groupConversationsByDay`, aceites; tipos em `chat.ts`)
- [x] D11 aplicado: `confirm` em 62 confirmáveis + `badges` em `refresh_achievements`; spec `toda tool do chat declara o cartão…`; `catalogoDoChat` sem `?? 'report'`; `artefatos.py` descarta kind desconhecido. MCP: specs rodados depois do merge e do D11 — `SHA_ENTIDADE`, contagem e docs inalterados (card/appOnly não vão no fio).: tipos, catálogo, helpers (link, grupos, respostas rápidas, lista), aceite
- [x] 6. Web: `artefato.tsx` (13 formatos + fontes/só no app/Gravado com cabeçalho igual), `partes.tsx`
      (Consultando…/nada encontrado/não deu certo/você recusou/gravado às HH:MM; recolhe quando não é a
      última resposta; agrupa ≥2), `ask-user.tsx` (Gravar/Ajustar, inválida vermelha, lote "Enviar N
      decisões", aceite da busca, "Continuo?" com Parar aqui), `aceite.tsx` (aceite da 1ª conversa no lugar
      do campo + chave do globo no topo), `pilulas.tsx`, `catalogo.ts` (hooks), lista Hoje/Esta semana/Antes
      com prévia, motivo "Demorou", "Ouvindo… O áudio vira texto e é descartado.", plano "n de m passos",
      "Você" na fala; /privacy reescrita para a busca da #384. Helpers novos no api-client:
      `chatCardTitle`, `isEmptyChatArtifact`, `formatChatNumber`.
- [x] 7. App: `artifact-card.tsx` (todos os formatos), `message-list.tsx` (linhas, agrupar, recolher, motivo do 👎, plano, Você), `pause-card.tsx`, `consent.tsx` (aceite, globo, pílulas), `chat/ai-consent.ts`, lista por dia com busca e prévia, aviso do ditado; `ChatSession.explainVote`
- [ ] 8. Docs (MCP_TOOL_SURFACE, REDESIGN_PROGRESS), lint, typecheck, testes; apagar este arquivo

## Arquivos tocados

- Item 1: `common/decorators/tool.decorator.ts` (tipos), 90 tools (`card`/`appOnly`),
  `mcp/generic-card.ts` (Tabela genérica), `mcp/mcp-tool.registry.ts` (`catalogoDoChat`, fallback),
  `chat/chat.controller.ts` (`GET /chat/tool-catalog`), specs em `mcp/__tests__`.
- Item 2: `schema.prisma` + migration `20261117022522_ai_consent_and_web_search`,
  `chat/consent/ai-consent.service.ts`, `chat.service.ts` (trava 403 + `webSearch` no turno),
  `ai/agent.adapter.ts` e `http-agent.adapter.ts` (`webSearch` no corpo do agente),
  `chat.controller.ts` (`GET/POST /chat/consent`, `PATCH /chat/preferences`), DTOs,
  `users/account.service.ts` (export: `aiConsents`, `webSearchEnabled`), `user-isolation.spec.ts`.

- Item 3: agente — `providers/openai_compat.py` (`web_search`, `supports_web_search`),
  `providers/base.py` (`WebSource`, `WebSearchResult`), `chat/web.py`, `chat/app_only.py`,
  `chat/artefatos.py` (formatos novos), `chat/state.py` (`restricted`, `web_search`,
  `search_web`, `pause_after_tools`), `chat/graph.py` (nós renomeados para inglês nas funções;
  os nomes dos nós no fio continuam `agente`/`ferramentas`/`portao`/`orcamento`), `api.py`
  (`webSearch` no corpo), `settings.py` + env `AGENT_CHAT_PAUSE_AFTER_TOOLS` (compose, .env.example),
  prompt (`open_in_app`, `web_search`). Testes: `tests/chat/test_ferramentas_do_chat.py`,
  `tests/providers/test_web_search.py`, `test_chat_route.py`.

- Item 4: produtores em `get_steps_history`, `get_water_history` (bars), `list_goals` (progress),
  `list_achievements` (badges), `explain_form` (instructions), `export_my_data` (file),
  `get_streak` (metric); `genericList` para quem declara `list`; os demais formatos sem
  produtor ficam só com a linha da tool (diferença registrada). `preview` em
  `ConversationService.list`. Specs: `mcp/__tests__/chat-cards.spec.ts`, persistência.

## Comandos

- DB de teste: `export DATABASE_URL=$(grep '^DATABASE_URL=' /home/thiago/Documentos/pessoal/fatia/.env | cut -d= -f2- | tr -d '"' | sed -E 's#/fatia(\?|$)#/fatia_t384\1#')`
  e `pnpm --filter @fatia/db exec prisma migrate deploy`.
- `cd apps/api && npx jest src/chat src/mcp/__tests__/tool-catalog.spec.ts`
- Agente: `cd apps/agent && uv run --offline pytest -q && uv run --offline ruff check src tests && uv run --offline mypy src`

## Próximo passo

Item 8: REDESIGN_PROGRESS (Etapa 6, bloco #384), `pnpm lint`, `pnpm typecheck`, testes de api/agent/api-client/web/mobile, apagar este arquivo no commit final.
