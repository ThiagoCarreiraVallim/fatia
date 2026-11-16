# HANDOFF — ajustes da etapa 4 (treino)

Branch: `fix/treino-ajustes-etapa4` (checkout principal, sem worktree, sem push).
Prints: `~/.cache/fatia-vis/treino-ajustes/` (boards/, before-web/, before-app/, after-web/, after-app/).

## Itens

| #   | Pedido                                             | Status   | Arquivos                                                                                                                                                                  |
| --- | -------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Figuras do "Seus músculos hoje" alinhadas          | feito    | api-client workout-cards.ts (figureViewBox), web e mobile muscle-diagram.tsx; prints before-_/1-_, after-_/1-_, web-1-compare.png, app-1-compare.png                      |
| 2   | "Concluir série" fixo no rodapé                    | pendente |                                                                                                                                                                           |
| 3   | Tirar "Sugestão" e "meta/última vez/RPE" da sessão | pendente |                                                                                                                                                                           |
| 4   | Chips das séries rolam até a da vez                | pendente |                                                                                                                                                                           |
| 5   | Tudo feito: lista das séries do treino             | pendente |                                                                                                                                                                           |
| 6   | Treino feito sem barra, topo e voltar              | feito    | api-client navigation.ts (SESSION_ROUTE em navBarMode/hasTopBar), web session/[id]/page.tsx (sem useTopBarTitle; Salvar fora do cartão); prints before-_/6-_, after-_/6-_ |

## Notas

- Sessão de teste: iniciar Push do demo; finalizar no fim (não cancelar).

## Próximo passo

Item 3 (textos), depois 2 (botão fixo), 4 (chips), 5 (tudo feito). Sessão Push do demo ATIVA (3 séries no supino); prints "antes" de 2/3/4 já tirados (before-_/2-3-session_, before-_/4-set4_). Script local não versionado: scripts/_session.mjs (registra N séries no PWA e tira print).
