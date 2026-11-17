# HANDOFF #385 — IA: foto do prato, configurações (modo por categoria), memórias e limites

Branch `redesign/385-ia-config`, worktree `.claude/worktrees/385-ia-config`, criada de `redesign/384-chat` (8ce9e0f3).
Não fazer push nem PR. Apagar este arquivo no commit final.

## Comandos que funcionam

```bash
# banco descartável (fatia_t385), já migrado e com seed:taco + seed:exercises
. /tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/env385.sh
# (o script faz: set -a; . <raiz>/.env; DATABASE_URL com /fatia -> /fatia_t385)
cd packages/db && npx prisma migrate deploy && npx prisma generate
cd apps/api && npx jest --silent            # baseline: 199 suítes, 3120 testes verdes
cd apps/agent && uv run pytest -q && uv run ruff check . && uv run mypy src
```

Se o scratchpad sumiu: `DATABASE_URL` do `.env` da raiz com `sed -E 's#/fatia(\?|$)#/fatia_t385\1#'`.

## Decisões

- Pranchas lidas (x-dc e notas do canvas.json): Al-M12, Al-M10, Al-M24, Al-M9, Al-M11. Texto da permissão de
  câmera: "O Fatia usa a câmera para fotografar refeições e rótulos. A foto vai para a IA reconhecer os
  alimentos e só fica guardada se você permitir."
- Execução do automático pela API: o agente chama a tool no `/mcp` com o header `x-fatia-auto-write`
  (conversa, run e tool call). A API confere o modo AUTO da categoria, a elegibilidade e os limites, tira o
  retrato, executa, grava `AiAutoWrite` e devolve o artefato `saved`. Desfazer: `POST /chat/auto-writes/:id/undo`.
- Só é automática a tool com categoria **e** operação inversa declarada; sem inversa, pede OK mesmo em
  Automático. `delete_*`, RESTRICTED, compartilhamento, mural e cobrança não têm categoria de automático.
- "Desligado" tira do catálogo do modelo as tools de escrita da categoria (a leitura fica).
- Foto do chat comum: **a revisão da #384 a torna transitória** (turno + janela curta) e deixa um gancho
  que promove foto do chat a foto da refeição. Aqui NÃO implemento descarte de foto do chat. O fluxo da
  câmera "Prato" usa o reconhecimento da #374 (`/nutrition/meals/recognize` + `POST /meals` com
  `photoFileId`), que só guarda com `keepMealPhotos = true`. **No merge da #384:** se o gancho de promoção
  existir e houver caminho de foto do chat virando refeição, chamá-lo só com refeição criada E
  `keepMealPhotos === true`.
- **No merge da #384:** todo `HostedAiService` passa a exigir o aceite (403 `AI_CONSENT_REQUIRED`),
  inclusive o reconhecimento por foto: a câmera/revisão precisa mostrar o aceite nesse 403 (já tratado
  aqui pelo código do erro). Todo tool precisa de produtor de cartão real (spec nova da #384): conferir
  `save_memory` (mudei o schema) contra ela. Evitei mexer no aceite, na fila e nos produtores de cartão.

## Checklist

- [x] 1. Migration: modos por categoria, categoria da memória, `AiAutoWrite`
- [x] 2. API: `GET/PATCH /chat/settings` (modos), webSearch reaproveita `PATCH /chat/preferences`
- [x] 3. API: `aiCategory` nas tools + regras no `tool-catalog.spec.ts`
- [x] 4. API → agente: `toolModes` no corpo do turno
- [x] 5. Agente: filtro do Desligado, execução automática com limites, header, artefato `saved`
- [x] 6. API: `AutoWriteService` (retrato, inversa, limites) + `POST /chat/auto-writes/:id/undo`
- [x] 7. Testes obrigatórios da ADR 039
- [x] 8. Memórias: categoria, data, `DELETE /chat/memories`, teto 50 com pedido de apagar, renomes
- [x] 9. Foto: chat descarta no fim do turno; MCP de refeição informa foto; export/exclusão
- [x] 10. Isolamento (foto já coberta pela #374) (`user-isolation.spec.ts`): foto, memórias, preferências, desfazer
- [ ] 11. api-client: settings, memórias, desfazer, foto da refeição
- [ ] 12. Web: Config da IA, Memórias, Gravado com Desfazer, estados Al-M11, foto por arquivo + revisão
- [ ] 13. App: Config da IA, Memórias, Gravado, estados, câmera Al-M12 + revisão Al-M10
- [ ] 14. Docs: ADRs (notas), DATA_RETENTION, privacy, MCP (se mudou), REDESIGN_PROGRESS
- [ ] 15. lint, typecheck, testes de tudo; commit final sem este arquivo

## Arquivos tocados

- Migration `20261117100000_ai_write_modes_and_memory_category`: `AiWriteModeSetting`, `AiAutoWrite`,
  `UserMemory.category`.
- API: `chat/auto-write/{auto-write.service,undo-specs}.ts` (+ spec de integração com 18 casos da ADR 039);
  `mcp/auto-write-header.ts`; registry (`useAutoWriter`, `entidades`, execução com `ctx.autoWrite`);
  controller do MCP lê `x-fatia-auto-write`; `aiCategory` em 39 tools; `GET /chat/settings`,
  `PATCH /chat/settings/modes`, `POST /chat/auto-writes/:id/undo`, `DELETE /chat/memories`;
  `toolModes` no corpo do agente; memória: `list/remember/forget/forgetAll/count` (renomes) e
  `save_memory.category`; export LGPD com `aiWriteModes`, `aiAutoWrites` e a categoria da memória;
  docs/MCP.md e MCP_TOOL_SURFACE.md com números regerados pelo spec; SHA_ENTIDADE regerado.
- Prova de vermelho: mutações no serviço (sem o teto por resposta, sem checar o modo, sem o teto de
  itens, Desfazer sem `nutrients`) deixam 1 teste vermelho cada; `aiCategory` em `set_group_sharing`
  deixa 2 vermelhos no `tool-catalog.spec.ts`. Testes de memória vistos vermelhos antes do código.
- API inteira: 200 suítes, 3151+ testes verdes.

- Agente: `ChatToolModes` (`toolModes`) no `ChatRequest`; `sem_desligadas`/`automaticas` em
  `tool_policy.py`; `ContextoDoTurno.conversation_id/auto_write`; `_auto_write` no `run_tools`
  (header `x-fatia-auto-write`, `AUTO_WRITE_NEEDS_OK` → volta ao cartão); `saved` em `artefatos.py`;
  `McpClient.call_tool(auto_write=)`. Testes: `tests/chat/test_gravacao_automatica.py` (7) e 3 na rota.
  Vermelho visto: sem a checagem do NEEDS_OK, sem o filtro de apagar, sem `saved` → 1 falha cada.
  Agente: 577 passed, ruff e mypy limpos.

- api-client: `src/ai-settings.ts` (modos, cópia da Al-M24/M9/M11/M10, `savedUndoId`, `undoAutoWrite`,
  `forgetAllChatMemories`, `memoryMeta`, `quotaResetLabel`, revisão da foto com ±10 g) + teste (11).
  `ChatMemory.category`, `autoWriteId` no `saved`. 921 testes verdes.

## Próximo passo exato

Web: Config da IA (`/chat/settings`?), memórias com categoria e "Apagar todas", Desfazer do Gravado,
estados da Al-M11 e foto do prato por upload.
