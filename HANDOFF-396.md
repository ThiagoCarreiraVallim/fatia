# HANDOFF #396 — Conteúdo da equipe no app

Branch `redesign/396-conteudo-equipe` (parte de `redesign/393-comunidades`).
Pranchas baixadas em `/home/thiago/Documentos/pessoal/fatia/.canvas/project/Cm-1{2..6}-*.dc.html`.
Banco de teste: `fatia_t396` (env em scratchpad `env396.sh`: `.env` do checkout principal com sed no DATABASE_URL).

## Desvios da prancha (documentar no REDESIGN_PROGRESS)

- "Pôr num treino" abre seletor dos meus planos (já-tem desabilitado), não o Al-T8.
- Quatro linhas de macro (com carboidrato) no antes/depois; prancha mostra três.
- Botão Adotar fica depois da descrição (decisão anterior de usabilidade).
- Adotar treino não navega: banner "Em Meus planos" + Abrir (como a prancha).

## Decisões (dono)

- Aplicar plano da equipe pede confirmação com antes e depois (sheet Cm-14 na tela; cartão do chat com "Calorias: X → Y").
- Histórico de metas é mantido: `UserGoalsHistory` (migration `20261118200000_user_goals_history`), gravado em todo `UserGoalsService.upsert` que muda algo (`source` manual|group_plan, template + título). Entra no export (`nutritionGoalsHistory`).

## Feito (API/MCP)

- Histórico de metas + `previousGoals` no resultado da adoção.
- Membro: `GET groups/:id/tips/:tipId`, `GET groups/:id/exercises/:exerciseId`, `GET groups/:id/equipment` (content.read).
- `authorRole` em plano, dica e guia; `exerciseId`/`hasGuide` em cada exercício do plano.
- MCP: `list_group_exercise_guides` (leitura, cartão lista, sem URL) — 156 tools, SHA novo; descrição do `adopt_group_plan`; prompt do agente da comunidade cita a tool.
- Prévia do `adopt_group_plan` com applyGoals: antes → depois por faixa.

## Falta

- user-isolation.spec: FEITO.
- api-client: FEITO (tipos, memberGuide/memberEquipment/tip, helpers, rotas, aba "Conteúdo").
- web: FEITO (commits e35b084e, 7de855d2). TipCard removido; e2e content.spec ajustado (não rodado: sem servidores).
- mobile: espelhar web — content/index, [templateId], tips/[tipId], exercises/[exerciseId], src/components/content/member-content.tsx.
- docs: REDESIGN_PROGRESS (bloco #396 na Etapa 7), MCP ok.
- lint/typecheck/testes de tudo; apagar este HANDOFF no último commit.
