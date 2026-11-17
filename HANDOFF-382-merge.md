# HANDOFF #382 merge com main (#381) + passe visual

## Feito

- Passos 1-4: merge commitado em ab6d887a (conflitos, SHA_ENTIDADE 2af00531..., 153 tools, 138,6 k / 115,6 k,
  83 de escrita com exemplo; lint, typecheck, api 3004 testes em fatia_t382, api-client 827, web 918, mobile 488).
- API dev estava velha (nest watch perdeu os arquivos trocados pelo git): rm+recria dos .ts do merge acordou o watch.
- Pranchas copiadas para .canvas/project (Al-G*), renderizadas em ~/.cache/fatia-vis/382/board/.

## Em andamento: passe visual

- G1: diferenças achadas — título "Progresso" sobrando no header (web corta "Progre..."), peso com área (prancha é só linha),
  Força -78% por causa da semana corrente parcial (trocar por média por sessão, helper no api-client com teste),
  passos com 12 barras (prancha 7), badge do peso minúsculo (prancha .bdg é caixa alta).
- Próximas: G6, G7, G5, G11, G12, G9, G10.

## Prints

- ~/.cache/fatia-vis/382/{board,web,app}/ ; cmp-<prancha>.png = prancha | web | app
