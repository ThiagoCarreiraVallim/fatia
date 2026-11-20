# HANDOFF #405 — Painel: biblioteca e enviar para alunos

Branch `redesign/405-biblioteca-enviar` a partir de origin/main 88f21774. Pranchas baixadas em
`/tmp/claude-1000/.../scratchpad/artifact-files/80eb4942-.../project/` (Pn-18, Pn-08, 08b, 08c, 08d,
Pn-M4, Cm-20); se sumirem, `Artifact read` do GvL8GtYkJGjK5e4YovhZ3o.

## Decisões (registrar no REDESIGN_PROGRESS)

- O `PlanOffer` da #379 (com `PlanOfferVersion`) JÁ é a oferta individual: não criar tabela nova.
  Versões, SUPERSEDED, aceite pelo materializer, MCP list/accept/decline já existem.
- Plano alimentar vai pelo `NutritionPlan` (ADR 045, lado do aluno pronto em #376): o modelo da
  biblioteca (metas + refeições) vira um `NutritionPlan` (uma opção por refeição). Precisa de metas
  e de alimentos do catálogo; senão 400 com o motivo. `NutritionPlan.sourceTemplateId` novo.
- Hábito, questionário e recomendação: decisão pendente adotada = modelo entra com #391/#390
  reaproveitando o tipo da oferta; aqui ficam visíveis e desligados ("chega com ...").
- "Sem progresso": só o estado, nunca o motivo (recomendação da issue).
- Rotas: `groups/:groupId/offers` já é das Ofertas vendidas (#403) → usar `groups/:groupId/sends`.
  Lado do aluno continua `/plan-offers` (#379) e `/nutrition/plan`.
- Rascunho: `GroupPlanTemplate.draft` (default false, dados velhos false). Publicado = `publishedAt`
  (na comunidade). Rascunho não publica nem envia.
- "Anunciar no mural": `announce` no publish (true força o post, false não posta, ausente = config).
- "Com quem": pessoas distintas com cópia (adotou ou recebeu); < 5 → "menos de 5".
- Enviados recentemente: só os MEUS envios nesta comunidade; resposta (aceito/recusado) é minha
  (já recebo o aviso); progresso só pela porta de leitura (Treino), senão "sem progresso".
- Fim do plano flexível: `PlanOfferVersion.endDate` (null = sem fim). "O que mudou":
  `PlanOfferVersion.changeNote`.

## Passos

- [x] 1. Ler issue, schema, código existente
- [x] 2. Banco de teste fatia_t405
- [x] 3. Migration 20261120400000_plan_library_send
- [x] 4. API: testes vermelhos (sends.integration.spec, content publish/draft/reach, isolamento)
- [x] 5. API: implementação
- [x] 6. MCP (sem mudar descrição: baseline sha) changeNote + docs/MCP_TOOL_SURFACE.md
- [ ] 7. api-client (send-plans.ts) + testes
- [ ] 8. Web: biblioteca (Pn-08/08b/08c/08d), página Enviar (Pn-18), oferta do aluno com "O que mudou"
- [ ] 9. Mobile: "O que mudou" na oferta; seção send fora das abas
- [ ] 10. Passada visual
- [ ] 11. REDESIGN_PROGRESS, merge origin/main, apagar banco e HANDOFF
