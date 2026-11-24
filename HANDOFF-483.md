# HANDOFF #483 (frente C, PR 2) — frente C (treino e nutrição no app)

Brief: /home/thiago/.cache/fatia-briefs/Cc.md

- Branch PR 1: `fix/475-treino-nutricao-app` (#475 #476 #477 #478 #479 #480)
- Branch PR 2: `fix/483-drawer-previa-treino` (#483 #484), a partir de origin/main
- Portas: API 3116, web 3146. Banco `fatia_t475` (migrado + seed exercises/taco). Trava: frente-C.

## Decisões

- #477: regra de lint (`no-restricted-syntax`) no eslint do mobile obriga `shows*ScrollIndicator={false}`
  em todo ScrollView/FlatList/SectionList/Drawer*; arquivos da #413 ficam de fora da regra.
  Carousel ganha prop `bleed` (margem negativa + padding no content).
- #479: API nova `GET /workout/week?date=` (TrainingWeek de qualquer semana) para o treino arrastar
  entre semanas; componente `WeekPager` único (FlatList horizontal paginada por semana).
- #476: figura muscular colorida por séries da semana + resumo (mais treinados / esquecidos);
  toque abre drawer com os números.

## Checklist PR 1

- [ ] #475 título menor
- [ ] #480 + e card Novo plano → /workout/plans/new
- [ ] #478 chip ativo visível
- [ ] #477 bleed + sem barras
- [ ] #476 card séries por músculo
- [ ] #479 faixa arrastável (API + app)
- [ ] lint/typecheck/test, prints, PR

## Checklist PR 2

- [ ] #483 drawer fling + confirmação de rascunho
- [ ] #484 prévia do treino

## Estado atual

- PR 1 aberto: #489 (fix/475-treino-nutricao-app), CI pendente.
- PR 2 (fix/483-drawer-previa-treino): código pronto e commitado.
  - #483: `drawer-state.ts` (máquina testada), Drawer só desmonta quando assenta, mostra o último conteúdo
    enquanto desce, `useDiscardGuard`/`DiscardGuard` (confirm-drawer.tsx), folhas de plans/[id] em DrawerLayer.
  - #484: `planPreview` (api-client) + `PlanPreviewProvider`/`usePlanPreview` no layout; plans/index, cards, agenda.
    Comunidade: a tela do modelo já é a prévia (exercícios, séries, guia antes do "Adotar").
- Falta: prints do PR 2 (esperando a trava do emulador, estava com frente-B), abrir o PR 2, relatório.
- API do worktree: `node apps/api/dist/main` na 3116, DB fatia_t475 (seed demo feito).
