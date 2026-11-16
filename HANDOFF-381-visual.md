# HANDOFF #381 — passada visual (T17b, T10, T11, T11b)

Branch `redesign/381-treino-livre-historico`, checkout principal. Sem push.
Prints em `~/.cache/fatia-vis/381/{board,web,app}/`; lado a lado `cmp-<board>.png`.
Helper (scratchpad, fora do git): node api.mjs <rota-web> <trecho-url-api> imprime o JSON da API como o demo.

## Estado

- [x] pranchas renderizadas (board/)
- [x] T17b treino livre (commit "fix: treino livre segue a T17b") — prints web/workout_free*.m.png, app/free-empty.png, app/free-with.png, cmp-Al-T17b-*.png
- [ ] T10 histórico
- [ ] T11 detalhe força
- [ ] T11b detalhe cardio (demo não tem sessão cardio: criar via "Só cardio")
- [ ] lint/typecheck/testes; apagar este arquivo no último commit

## Diferenças achadas (a corrigir)

- T17b: textos b3 (12px, faint) saíam 14px muted; chips pill (prancha 10px); app: cartão vazio tracejado (prancha sólido);
  sugeridos = 8 "Abdominais..." (alfabético) — variar por grupo.
- T10: título "Histórico de treino" (prancha "Histórico"); b3 em 14px muted; selo do tipo; sem emoji (feeling nulo; detalhe usa média das séries).
- T11b: "Salvar como plano" verde (prancha .btn = s2).
- Botões fixos: prancha .btn tem raio 14px (!important no canvas.css); todo DockedAction do app usa pill. Mantido pill, reportar.

## Próximo passo

T10: título "Histórico" (packages/api-client/src/navigation.ts), b3 (text-xs text-faint), selo raio 6px, emoji só se houver; API: feeling do histórico cai na média das séries (session-history.ts, teste antes).
