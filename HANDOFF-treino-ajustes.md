# HANDOFF — ajustes da etapa 4 (treino)

Branch: `fix/treino-ajustes-etapa4` (checkout principal, sem worktree, sem push).
Prints: `~/.cache/fatia-vis/treino-ajustes/` (boards/, before-web/, before-app/, after-web/, after-app/).

## Itens

| #   | Pedido                                             | Status   | Arquivos                                                                                                                                                                                                                               |
| --- | -------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Figuras do "Seus músculos hoje" alinhadas          | feito    | api-client workout-cards.ts (figureViewBox), web e mobile muscle-diagram.tsx; prints before-_/1-_, after-_/1-_, web-1-compare.png, app-1-compare.png                                                                                   |
| 2   | "Concluir série" fixo no rodapé                    | feito    | web active-exercise-card.tsx (sticky no fim do card, +teste); mobile session-dock-store.ts (+teste), session-dock.tsx, active-session.tsx, active-exercise-card.tsx, active-cardio-card.tsx; prints before-_/2-3-session_, after-_/2-_ |
| 3   | Tirar "Sugestão" e "meta/última vez/RPE" da sessão | feito    | web active-exercise-card.tsx (+teste), mobile guided-session.ts setHeadline, active-exercise-card.tsx, active-cardio-card.tsx ("Anterior: X" como no PWA); prints before-_/2-3-session_, after-*/3-session.png                         |
| 4   | Chips das séries rolam até a da vez                | pendente |                                                                                                                                                                                                                                        |
| 5   | Tudo feito: lista das séries do treino             | pendente |                                                                                                                                                                                                                                        |
| 6   | Treino feito sem barra, topo e voltar              | feito    | api-client navigation.ts (SESSION_ROUTE em navBarMode/hasTopBar), web session/[id]/page.tsx (sem useTopBarTitle; Salvar fora do cartão); prints before-_/6-_, after-_/6-_                                                              |

## Notas

- Sessão de teste: iniciar Push do demo; finalizar no fim (não cancelar).

## Próximo passo

Item 4 (chips rolam até a da vez, web e app), depois 5 (tudo feito). Sessão Push do demo ATIVA (3 séries no supino). Script local não versionado: scripts/_session.mjs (registra N séries no PWA e tira print).
