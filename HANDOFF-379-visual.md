# HANDOFF #379 — passada visual

Branch `redesign/379-plano-recebido-agenda` (checkout principal). Sem push.
Prints: `~/.cache/fatia-vis/379/{board,web,app}/`, comparações `cmp-<prancha>.png` na raiz dessa pasta.
Pranchas renderizadas: todas em `board/`.

## Estado

- [x] Al-T2 / T2b plano recebido (f830cf7d): cmp-Al-T2-Plano-recebido, cmp-Al-T2-aceito, cmp-Al-T2-recusado, cmp-Al-T2b-Plano-flexivel
- [x] Al-T1 aviso no Treino (ae7a3e99): cmp-Al-T1-aviso. Botão Agenda (calendário) no header não está na prancha: única entrada da agenda, mantido
- [ ] Al-T23 Modelos
- [ ] Al-T12 Periodização
- [ ] Al-T24 / T24b / T24c Agenda + Remarcar
- [ ] verificação final (lint, typecheck, testes)

## Dados do demo

- Oferta `567d357f-b6d3-44e7-afba-28f954c6dee0` (CALENDAR, v1). Recusada e desfeita; virou FLEXIBLE só para o print e voltou; ACEITA no app às 17:52 (gera plano + 8 PlannedSession).
- Comparações: `/tmp/fatia-vis-tools/cmp.sh <saída> <prancha> <web> <app>` (magick).

## Próximo passo

Al-T24 agenda (com sessões do aceite), Remarcar, T24b, T24c.
