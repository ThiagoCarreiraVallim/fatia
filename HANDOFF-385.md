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
- Foto do chat comum (ADR 046): descartada ao fim do turno (dono, ADR 038 item 4). Só vira foto guardada
  pelo fluxo da câmera "Prato" com a revisão (reconhecimento da #374 + `POST /meals` com `photoFileId`).

## Checklist

- [ ] 1. Migration: modos por categoria, categoria da memória, `AiAutoWrite`
- [ ] 2. API: `GET/PATCH /chat/settings` (modos), webSearch reaproveita `PATCH /chat/preferences`
- [ ] 3. API: `aiCategory` nas tools + regras no `tool-catalog.spec.ts`
- [ ] 4. API → agente: `toolModes` no corpo do turno
- [ ] 5. Agente: filtro do Desligado, execução automática com limites, header, artefato `saved`
- [ ] 6. API: `AutoWriteService` (retrato, inversa, limites) + `POST /chat/auto-writes/:id/undo`
- [ ] 7. Testes obrigatórios da ADR 039
- [ ] 8. Memórias: categoria, data, `DELETE /chat/memories`, teto 50 com pedido de apagar, renomes
- [ ] 9. Foto: chat descarta no fim do turno; MCP de refeição informa foto; export/exclusão
- [ ] 10. Isolamento (`user-isolation.spec.ts`): foto, memórias, preferências, desfazer
- [ ] 11. api-client: settings, memórias, desfazer, foto da refeição
- [ ] 12. Web: Config da IA, Memórias, Gravado com Desfazer, estados Al-M11, foto por arquivo + revisão
- [ ] 13. App: Config da IA, Memórias, Gravado, estados, câmera Al-M12 + revisão Al-M10
- [ ] 14. Docs: ADRs (notas), DATA_RETENTION, privacy, MCP (se mudou), REDESIGN_PROGRESS
- [ ] 15. lint, typecheck, testes de tudo; commit final sem este arquivo

## Arquivos tocados

(nada ainda)

## Próximo passo exato

Item 1: migration em `packages/db/prisma/schema.prisma`.
