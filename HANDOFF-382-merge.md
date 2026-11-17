# HANDOFF #382 merge com main (#381) + passe visual

## Feito

- Passos 1-4: merge commitado em ab6d887a (conflitos, SHA_ENTIDADE 2af00531..., 153 tools, 138,6 k / 115,6 k,
  83 de escrita com exemplo; lint, typecheck, api 3004 testes em fatia_t382, api-client 827, web 918, mobile 488).
- Passe visual G1, G5, G6, G7, G9, G10, G11, G12 em 3452963c, a875ec19, 0dbe8569.
- Prints finais e cmp-<prancha>.png prontos em ~/.cache/fatia-vis/382/.
- Metro 8081 está com o diretório `apps/mobile/src/components/goals/` morto no watcher (serve a folha
  Nova meta velha). Não matei: subi um Metro extra na 8082 (background) só para os prints do app.

## Próximo passo exato

1. Lint, typecheck e todos os testes (api em fatia_t382).
2. Commit final apagando este HANDOFF; parar o Metro 8082; reabrir o Expo Go na 8081.

## Prints

- ~/.cache/fatia-vis/382/{board,web,app}/ ; cmp-<prancha>.png = prancha | web | app
