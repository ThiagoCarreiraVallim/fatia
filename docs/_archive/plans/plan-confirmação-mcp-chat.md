# Plano — Man-in-the-middle de confirmação no chat MCP (#248 follow-up)

## Contexto

O chat MCP hoje é **somente-leitura** (ADR 021). O agente Python pode consultar dados, mas não executar ações que modificam estado. Isso acontece porque o filtro `somente_leitura()` do `tool_policy.py` só oferece ao modelo as tools com `annotations.readOnlyHint === True`.

A promessa #248 já era: *"o chat é a camada principal de interação"*. Para isso, o chat precisa poder **fazer coisas**, mas não pode fazê-las em silêncio — precisa de **confirmação visual** do usuário antes de executar qualquer ação que altere dados.

### Decisões definidas com o usuário:

- Plano cobre apenas o fluxo de confirmação no chat (não expande para mobile/Expo).
- Confirmáveis são **reversíveis ou idempotentes** — se der ruim, pode desfazer sem perder dados.
- O modal é uma **proposta**, não uma execução direta: o modelo descreve a ação, usuário aprova/rejeita.
- Ferramentas destrutivas irreversíveis (ex: `delete_my_account`) continuam bloqueadas via chat — são REST admin.
- Confirmação é por texto/emoji na conversa; modal popup só se aplica ao PWA Web.

### Definition of Done:

Um usuário pode dizer *"Comi 200g de frango com arroz no almoço"* pelo chat e a refeição aparece registrada, depois de confirmar na tela. O fluxo funciona em ambas as direções: confirmação explícita ("sim", "ok") e recusa ("não", "cancelar").

---

## Design system do PWA (assistant-ui/swervable)

O site https://swervable-winona-unstrepitous.ngrok-free.dev hospeda o design system **@assistant-ui/swervable**, que já está integrado no PWA. Os componentes disponíveis em `apps/web/src/components/elements/`:

| Componente | Uso na confirmação |
|-----------|-------------------|
| `surfaces.tsx` — `paper`, `floating`, `field`, `inkButton`, `ghostButton` | Estilos do modal de confirmação (surface paper/floating, botão ink para confirmar) |
| `tool-call.tsx` — `ToolCall` | Visualização da tool sendo executada durante o fluxo de confirmação |
| `thinking-indicator.tsx` | Indicador enquanto espera a resposta do modelo após confirmação |
| `mobile-composer.tsx` — `MobileComposer` | Composer para responder ao modelo (confirmar/recusar via texto) |
| `empty-state.tsx` / `error-state.tsx` | Estados de loading e erro no modal |

### `apps/api/src/nutrition/mcp/` — ferramentas com anotação de confirmação

- Adicionar `confirmableHint: true` em cada tool que precisa de confirmação visual no chat
- Ferramentas confirmáveis: `log_meal`, `update_meal_item`, `update_meal`, `create_custom_food`, `create_workout_plan`, `add_exercise_to_plan`, `start_workout_session`, `log_set`, `log_weight`, `log_steps`, `log_water`

### `apps/agent/src/fatia_agent/chat/tool_policy.py` — nova classificação de ferramentas

- Evoluir de 2 categorias (readOnly / write) para **3 camadas**: READ_ONLY, CONFIRMABLE, RESTRICTED
- Função `somente_leitura()` → renomear/refatorar em `camada_read_only()`, adicionar `camada_confirmável()` e `camada_restrita()`

### `apps/agent/src/fatia_agent/chat/graph.py` — novo nó de confirmação

- Adicionar nó `confirmar` no grafo LangGraph
- Fluxo: quando modelo pede tool CONFIRMABLE → gera proposta → espera confirmação do usuário
- Se confirmado → executa a tool (agora permitida via `exigir_permitida`)
- Se recusado → modelo ajusta e tenta de novo

### `apps/agent/src/fatia_agent/prompts/chat_pt_br.py` — instruções para o modelo

- Sistema prompt atualiza com regras sobre quando confirmar vs. executar direto
- Exemplo de proposta: "Quero registrar uma almoço: [detalhes]. Confirmou?"
- Instrução clara: "Para ações CONFIRMABLE, pare e peça confirmação antes de executar"

### `apps/web/src/components/chat/confirmation-modal.tsx` — novo componente React (usando swervable)

- Modal construído com `surfaces.paper` + `floating` do design system
- Botão "Confirmar" usando estilo `inkButton` (botão primary do swervable)
- Botão "Cancelar" usando estilo `ghostButton`
- Visualização da tool via componente `ToolCall` (já existe, reutilizar)
- Composer para resposta usando `MobileComposer` (input de texto) ou shadcn Dialog
- Integração com o stream de eventos do chat para capturar a resposta

### `apps/api/src/mcp/__tests__/tool-catalog.spec.ts` — testes automáticos

- Novo caso: verifica que tools confirmáveis têm `confirmableHint === true`
- Verifica que RESTRICTED não tem `readOnlyHint === true` nem `confirmableHint === true`

---

## Ordem de execução (com checkpoints)

### Etapa 1 — ADR sobre classificação 3 camadas (1h)

1. Escrever novo **ADR** definindo:
   - Três categorias: READ_ONLY, CONFIRMABLE, RESTRICTED
   - Critério para cada uma (reversibilidade, risco de dano acidental, urgência)
   - Como o filtro evolui no `tool_policy.py`
   - Regra: tool sem anotação clara em qualquer campo → entra em RESTRICTED (falha fechada)
2. **Checkpoint:** ADR aprovado e documentado.

### Etapa 2 — Anotações nas tools MCP (4h)

1. Identificar todas as tools que são CONFIRMABLE vs. READ_ONLY:
   - `log_meal` → CONFIRMABLE (cria dado, reversível via delete)
   - `update_meal_item`, `update_meal` → CONFIRMABLE (correção de erro)
   - `create_custom_food` → CONFIRMABLE (adição ao catálogo do usuário)
   - `log_set` → CONFIRMABLE (registra série, idempotente)
   - `start_workout_session`, `log_weight`, `log_steps`, `log_water` → CONFIRMABLE
   - `create_workout_plan`, `add_exercise_to_plan` → CONFIRMABLE
2. Em cada tool: adicionar `confirmableHint: true` (mantendo `readOnlyHint: false`).
3. Tools destrutivas irreversíveis (`delete_my_account`, `bulk_import_admin`) mantêm como RESTRICTED — não expostas ao chat, nem confirmáveis.
4. Atualizar `docs/MCP.md`: adicionar seção sobre confirmação no chat, com tabela de classificação de cada tool.
5. **Checkpoint:** MCP Inspector mostra `confirmableHint: true` para as 12 tools listadas; `get_me`, `list_meals`, etc. continuam readOnly.

### Etapa 3 — Evolução do `tool_policy.py` (2h)

1. Renomear/refatorar `somente_leitura()` → `camada_read_only()`
2. Adicionar três novas funções:
   ```python
   def camada_confirmavel(catalogo) -> list[McpToolInfo]:
       """O recorte: as tools que o /mcp anuncia como confirmáveis."""
       return [t for t in catalogo if t.annotations.get("confirmableHint") is True]

   def camada_restrita(catalogo) -> list[McpToolInfo]:
       """O resto: ferramentas nunca oferecidas ao chat (admin, irreversíveis)."""
       nomes = set(t.name for t in camada_read_only(catalogo)) | \
               set(t.name for t in camada_confirmavel(catalogo))
       return [t for t in catalogo if t.name not in nomes]

   def separar(catalogo) -> tuple[list[McpToolInfo], list[McpToolInfo]]:
       """(permitidas, restritas). Permite o modelo ver as duas opções."""
       permitidas = camada_read_only(catalogo) + camada_confirmavel(catalogo)
       return (permitidas, camada_restrita(catalogo))

   def formato_openai(catalogo, confirmáveis: bool = True):
       """Adiciona hint ao schema quando tool é CONFIRMABLE.
       O modelo lê a hint e sabe que precisa parar pra confirmar."""
       ...
   ```
3. `exigir_permitida()` já funciona — não precisa mudar, pois usa o conjunto `permitidas`.
4. **Checkpoint:** `pytest apps/agent/tests/test_tool_policy.py` passa com as novas camadas; tools confirmáveis aparecem no schema do modelo com hint de confirmação.

### Etapa 4 — Novo nó `confirmar` no grafo LangGraph (3h)

1. Atualizar `EstadoDaConversa`:
   ```python
   class EstadoDaConversa(TypedDict):
       mensagem: str
       historico: list[dict[str, str]]
       mensagens: list[dict[str, Any]]
       pendentes: list[dict[str, str]]
       rodadas: int
       resposta: str
       motivo: str
       # Novo: proposta de confirmação em aberto (se houver)
       proposta_confirmavel: dict[str, Any] | None  # {tool_name, arguments, descrição}
       confirmada: bool  # true se usuário já aprovou a proposta atual
   ```
2. Adicionar nó `confirmar`:
   - Recebe do nó `decidir` as ferramentas CONFIRMABLE que o modelo pediu
   - Gera mensagem de proposta para o modelo (e emite evento SSE com tipo `proposta`)
   - O modelo responde com confirmação ou ajuste → volta pro `decidir`
3. Atualizar rota após decidir:
   ```python
   def rota_apos_decidir(state):
       if state["pendentes"] and estado_conferível(state):
           return "confirmar"      # pausa pra aprovação
       elif state["pendentes"] and state["rodadas"] < MAX_RODADAS_DE_TOOL:
           return "agir"            # executa direto (READ_ONLY ou confirmada)
       return "responder"
   ```
4. Função `estado_conferível()`: retorna True se há pendentes CONFIRMABLE e o usuário ainda não confirmou.
5. Fluxo completo:
   - Modelo pede `log_meal` → grafo vai pra `confirmar`
   - `confirmar` gera proposta: `"Quero registrar um almoço com 200g de frango..."`
   - Emite evento SSE tipo `proposta` + texto da proposta
   - Usuário responde "sim" → volta pro `decidir` com a tool já confirmada, agora permitida
   - Se o usuário responder outro pedido → volta ao ciclo normal
6. **Checkpoint:** Grafo roda contra `http://localhost:3001/health` sem erros; `/capabilities` mostra as 3 camadas. Smoke test no MCP Inspector com ferramenta CONFIRMABLE — modelo pede tool, sistema pausa pra confirmação.

### Etapa 5 — Prompt do sistema (1h)

1. Atualizar `sistema_com_data()` em `prompts/chat_pt_br.py`:
   ```python
   return f"""Você é o assistente de nutrição e treino da Fatia.

## Regras de ação

Existem três tipos de ferramenta:

### 1. Leitura (executa direto)
Ferramentas que só consultam dados. Pode usar sem perguntar nada.
Exemplos: get_me, list_meals, search_food, get_strength_progress.

### 2. Confirmação (PARE antes de executar)
Quando você quer registrar algo novo ou mudar algo no banco:
- Descreva claramente o que vai acontecer
- Pergunte ao usuário se pode prosseguir
- ESPERE a resposta dele antes de qualquer outra ação

Exemplo de proposta: "Quero registrar um almoço com 200g de frango grelhado e 158g de arroz branco cozido. Confirmou?"

Se o usuário disser 'sim', 'ok', 'confirma' → execute a ferramenta.
Se disser 'não', 'cancelar' → não execute nada, sugira alternativas.

### 3. Restrição (nunca mencione)
Existem ações que você simplesmente não pode fazer pelo chat. Se o modelo tentar pedir uma tool bloqueada, ignore e responda educadamente."""
   ```
2. **Checkpoint:** Smoke test — modelo pequeno não tenta executar CONFIRMABLE direto; para e pede confirmação.

### Etapa 6 — Modal de confirmação no PWA (4h)

Usando componentes do swervable (`apps/web/src/components/elements/`) para manter consistência visual com o resto do chat:

1. Componente `confirmation-modal.tsx` (nova pasta `apps/web/src/components/chat/`):
   - **Container** usando `surfaces.paper` — sombra suave, fundo escuro
   - **Título/detalhes** em campo `surfaces.field` — texto descritivo da ação proposta
   - **Botão Confirmar** usando `surfaces.inkButton` — botão primary do swervable (bg-foreground/text-background)
   - **Botão Cancelar** usando `surfaces.ghostButton` — secundário, hover sutil
   - **Visualização da tool em execução** reutilizando o componente `ToolCall` existente (`elements/tool-call.tsx`) com estado `running`
   - **Composer para resposta** usando `MobileComposer` (`elements/mobile-composer.tsx`) já adaptado ao Fatia
2. Integração no stream de eventos do chat:
   - Quando evento SSE tem tipo `proposta` → abre modal (via `surfaces.floating` como overlay)
   - Modal bloqueia input temporariamente enquanto aberto
   - Clique em Confirmar → dispara evento `{type: "confirm", proposalId: X}` pro backend
3. Integração backend (`chat.service.ts` ou endpoint):
   - Recebe evento `{type: "confirm", proposalId: X}`
   - Marca proposta como confirmada no estado do grafo
   - Volta pra rodada normal, modelo pode executar a tool agora
4. **Checkpoint:** Abrir chat MCP no PWA, digitar *"Comi 200g de frango"* → modal abre com proposta usando estilos swervable; Confirmar salva, Cancelar não salva.
5. **Verificação visual:** o modal tem consistência com `tool-call.tsx` (mesmo padding, mesma fonte mono para tool names, mesmas cores de status).
4. **Checkpoint:** Abrir chat MCP no PWA, digitar *"Comi 200g de frango"* → sistema pausa e mostra modal; clicar "Confirmar" → refeição salva, clicar "Cancelar" → não salva.

### Etapa 7 — Testes end-to-end (3h)

1. **Teste unitário** `tool_policy.py`:
   - Tools confirmáveis aparecem no schema como CONFIRMABLE
   - Tools restritas não aparecem
   - Tool sem anotação → RESTRICTED (falha fechada)

2. **Teste de integração** chat:
   - Mensagem *"Comi 200g de frango"* → modelo pede `search_food` + `log_meal`
   - Proposta gerada → modal abre no PWA
   - Clique Confirmar → refeição salva; clique Cancelar → não salva

3. **Smoke test** MCP Inspector:
   - Listar tools → ver 12 com `confirmableHint: true`
   - Executar flow "Comi 200g de frango" → pausa pra confirmação
   - Confirmar → dados salvos; cancelar → dados não salvos

4. **Isolamento**: user A não vê proposta de user B.

---

## Verificação end-to-end (DoD)

1. **Backend isolado:** agente Python aceita ferramenta CONFIRMABLE, para pra confirmação, executa após aprovação → dados no banco via `pnpm db:studio`.
2. **PWA:** abrir chat MCP, digitar *"Comi 200g de frango"* → modal abre com proposta; Confirmar salva, Cancelar não salva.
3. **MCP Inspector:** listar tools, executar `log_meal` → pausa pra confirmação.
4. **Isolamento:** user A vê propostas do user B? Não.
5. **Tests:** `pnpm --filter agent test` + `pnpm --filter api test`.
6. **Lint/types:** `pnpm typecheck && pnpm lint` na raiz.

---

## Convenções a respeitar (de `docs/CLAUDE.md`)

- YAGNI > DRY; sem abstrações antes da 2ª repetição.
- `strict: true`, sem `any`.
- Zod para schemas de input no MCP, class-validator para REST.
- Nunca aceitar `userId` como parâmetro de controller — sempre `@CurrentUser()`.
- Conventional Commits por sub-fase: `feat(mcp-confirm): ...`, `feat(chat-modal): ...`.
- ADR antes de qualquer código estrutural; specs documentadas em `docs/MCP.md`.
