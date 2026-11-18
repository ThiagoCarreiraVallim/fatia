# HANDOFF chat-sobras (fix/chat-etapa6-sobras)

Três defeitos do chat (etapa 6, #384/#385). Apagar este arquivo no fim.

1. [x] Rótulos do eixo do cartão de barras — `barAxisLabels` em packages/api-client/src/chat-cards.ts,
       usado em apps/web/src/components/chat/artefato.tsx e apps/mobile/src/components/chat/artifact-card.tsx
2. [x] Teclado cobre o campo no Android (mobile chat)
3. [x] "Resposta interrompida" quando para antes do primeiro token (web e app)
   - feito com useKeyboardOverlap (Keyboard + measureInWindow), só Android; iOS segue no KAV. ai-menu.tsx tem o mesmo KAV sem behavior no Android (fora do escopo).
