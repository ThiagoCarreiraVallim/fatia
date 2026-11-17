# HANDOFF #385 — merge main + passada visual

## Estado

- [x] Passo 1: merge origin/main commitado. api 210/3431, api-client 1016, web 1020, mobile 525, agente 592 (+2 skip), ruff/mypy ok
- [ ] Passo 2: passada visual no checkout principal

## Notas

- Merge resolvido (não commitado ainda se este bloco não tiver "commit do merge"): consentimento fica no AiModule (chat.module só com AutoWriteService); McpController(registry, connections, config); export com aiWriteModes+aiAutoWrites+mcpConnections; foto do app mantém o aviso da #385 (sem AiConsentCard); firstBody(provider) vem de processor; composer/message-list com layout da #384 + placeholder bloqueado e Continuar da #385.
- Migration renomeada para 20261117120000_ai_write_modes_and_memory_category.
- promoteChatPhotoToMeal: #385 não grava foto do chat como refeição; registrado como pendência no REDESIGN_PROGRESS.
- Ajustes de teste do merge: gravado.test usa ChatArtifactCard; chat-screen 'Tentar de novo' espera o título Al-M11 de fora do ar; meal-photo fixture ganhou processor; settings do app aponta '/profile/connect' (a #388 apagou '/profile/tokens').
