# HANDOFF #379 — passada visual

Branch `redesign/379-plano-recebido-agenda` (checkout principal). Sem push.
Prints: `~/.cache/fatia-vis/379/{board,web,app}/`, comparações `cmp-<prancha>.png` na raiz dessa pasta.
Pranchas renderizadas: todas em `board/`.

## Estado

- [x] Al-T2 / T2b plano recebido (f830cf7d): cmp-Al-T2-Plano-recebido, cmp-Al-T2-aceito, cmp-Al-T2-recusado, cmp-Al-T2b-Plano-flexivel
- [x] Al-T1 aviso no Treino (ae7a3e99): cmp-Al-T1-aviso. Botão Agenda (calendário) no header não está na prancha: única entrada da agenda, mantido
- [x] Al-T23 Modelos: cmp-Al-T23-Modelos (filtro por comunidade só aparece com 2+ comunidades; o demo tem 1)
- [x] Al-T12 Periodização: cmp-Al-T12-Periodizacao (bug: blocks/latest null → corpo vazio; corrigido no apiFetch)
- [x] Al-T24 / T24b / T24c Agenda + Remarcar: cmp-Al-T24-Agenda, cmp-Al-T24-hoje, cmp-Al-T24-Remarcar, cmp-Al-T24b-Agenda-vazia, cmp-Al-T24c-Agenda-plano-terminado
- [x] verificação final (2026-11-16): pnpm lint e pnpm typecheck verdes; api-client 740, web 888, mobile 480 (5 testes de helper do app foram para o api-client)

## Dados do demo

- Oferta `567d357f-b6d3-44e7-afba-28f954c6dee0` (CALENDAR, v1). Recusada e desfeita; virou FLEXIBLE só para o print e voltou; ACEITA no app às 17:52 (gera plano + 8 PlannedSession).
- Agenda: para os prints as datas das PlannedSession foram deslocadas (−1 dia, −35, −365) e o startDate da versão mudado; tudo restaurado (16/11..10/12, startDate 2026-11-15, PLANNED). Um Remarcar real no app (14→21 nov) também foi desfeito no banco.
- Modelos: os 2 GroupPlanTemplate temporários vis379-* já foram apagados.
- Comparações: `<scratchpad>/cmp.sh <saída> <prancha> <web> <app>` (magick).

## Próximo passo

Passada visual concluída. Falta o dono conferir os cmp-*.png e decidir as diferenças listadas no relatório; depois apagar este arquivo e o HANDOFF-379.md e abrir a PR.
