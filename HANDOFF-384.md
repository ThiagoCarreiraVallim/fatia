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

## Checklist

- [ ] 1. API: `card`/`appOnly` em todas as tools + spec + `GET /chat/tool-catalog`
- [ ] 2. API: aceites + preferência da busca (migration, endpoints, trava do chat, export/exclusão, isolamento)
- [ ] 3. Agente: formatos novos, `open_in_app`, `web_search` + aceite, pausa por consultas, env
- [ ] 4. API: artefatos dos formatos novos nas tools (produtores) + preview na lista
- [ ] 5. api-client: tipos, catálogo, helpers (link, grupos, respostas rápidas, lista), aceite
- [ ] 6. Web: mensagens, linhas, cartões, confirmação/lote/só no app, composer, busca/aceite, lista, pausa, motivos
- [ ] 7. App: o mesmo
- [ ] 8. Docs (MCP_TOOL_SURFACE, REDESIGN_PROGRESS), lint, typecheck, testes; apagar este arquivo

## Comandos

- DB de teste: `DATABASE_URL` do `.env` da raiz com `sed -E 's#/fatia(\?|$)#/fatia_t384\1#'`.

## Próximo passo

Item 1.
