# HANDOFF #408 — revisão adversarial da PR #466

Branch `redesign/408-dicas-catalogo`, PR #466. Banco de teste `fatia_t408b`
(env em `scratchpad/t408b.env`); apagar no fim. Prova: `apps/api/src/sharing/__tests__/review-466.integration.spec.ts`.

## Estado

- [x] F1 "em N planos": só planos que vieram desta comunidade (modelo da biblioteca ou oferta/programa), alunos distintos, célula mínima 5
- [x] F2 vídeo fragmentado: mehd/trun; exercise_video recusa duração desconhecida
- [ ] F3 app do painel: filtro `team=true` no servidor; chaves de query separadas
- [ ] F4 Duplicar sem `clonedFromId`
- [ ] nits: nome da cópia até 200; toast "post no mural criado" só se criou
- [ ] testes, lint, typecheck, merge main, push, apagar handoff e fatia_t408b

Ponto aberto (fora do escopo): PUT pré-assinado pode ser reusado depois do confirm.
