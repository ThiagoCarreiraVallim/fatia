# HANDOFF-385 — correções da revisão adversarial (sobre c23c53cc)

Worktree `.claude/worktrees/385-ia-config`, branch `redesign/385-ia-config`. Não fazer push.

## Comandos

- Env da API: `source /tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/env385.sh` (banco `fatia_t385`).
- API: `cd apps/api && npx jest src/chat/auto-write`; agente: `cd apps/agent && uv run pytest -q`.

## Checklist

- [x] 1. Desfazer compara com o estado pós-gravação (409 `AUTO_WRITE_CHANGED`), filhos inclusos; StepLog no `estado()`
- [ ] 2. Timeout na gravação automática: consulta por `toolCallId`; gravação + linha atômicas; testes
- [ ] 3. Limpeza de `input/result/before` após 24 h, ao apagar o registro e no desfazer; export; DATA_RETENTION
- [ ] 4. Header só com a credencial do agente; `runId` amarrado a `ChatRun` ativo; teto por mensagem da pessoa
- [x] 5. `toolCallId` repetido: mesmo input → idempotente; senão `AUTO_WRITE_NEEDS_OK`
- [ ] 6. UI do Desfazer (erros, persistência, antes → depois) e falha do `updateMe` na foto
- [ ] 7. lint, typecheck, testes, docs (ADR 039, REDESIGN_PROGRESS), commit final sem este arquivo

## Próximo passo exato

API do item 4 pronta (fb606b31 + este commit): `runToken` vai ao agente, "Continuar"/retomada seguem o
answerKey, `/mcp` exige `X-Fatia-Agent-Key` com o header, `lookup: true` só consulta.
Falta: agente (ChatRequest.run_token → runId do header; auto desligado sem token/chave; manda a chave;
timeout → lookup; McpUnauthorized → cartão), item 3 export/DATA_RETENTION, item 6 UI, docs.
