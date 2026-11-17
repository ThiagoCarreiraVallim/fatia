# HANDOFF #385 — merge main + passada visual

## Estado

- [x] Passo 1: merge origin/main commitado. api 210/3431, api-client 1016, web 1020, mobile 525, agente 592 (+2 skip), ruff/mypy ok
- [ ] Passo 2: passada visual no checkout principal

## Notas

- Merge resolvido (não commitado ainda se este bloco não tiver "commit do merge"): consentimento fica no AiModule (chat.module só com AutoWriteService); McpController(registry, connections, config); export com aiWriteModes+aiAutoWrites+mcpConnections; foto do app mantém o aviso da #385 (sem AiConsentCard); firstBody(provider) vem de processor; composer/message-list com layout da #384 + placeholder bloqueado e Continuar da #385.
- Migration renomeada para 20261117120000_ai_write_modes_and_memory_category.
- promoteChatPhotoToMeal: #385 não grava foto do chat como refeição; registrado como pendência no REDESIGN_PROGRESS.
- Ajustes de teste do merge: gravado.test usa ChatArtifactCard; chat-screen 'Tentar de novo' espera o título Al-M11 de fora do ar; meal-photo fixture ganhou processor; settings do app aponta '/profile/connect' (a #388 apagou '/profile/tokens').

## Passo 2 (checkout principal, branch redesign/385-ia-config)

- Worktree destacado; checkout principal na branch; migrations aplicadas no banco dev (deploy limpo, sem resolve).
- As 5 pranchas não estavam em .canvas/project: baixadas do artifact compartilhado "Fatia — redesign e novo plano" (https://claude.ai/artifact/GvL8GtYkJGjK5e4YovhZ3o, files project/Al-M*.dc.html) e copiadas para .canvas/project. Renders em ~/.cache/fatia-vis/385/board.
- Demo: linhas criadas listadas em ~/.cache/fatia-vis/385/demo-rows.txt (baseline no topo). Restaurar no fim.
- Consultas no banco: node <scratchpad>/q.cjs "SQL" (Prisma raw; psql não existe).
