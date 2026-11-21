# HANDOFF #408 — dicas e catálogo de exercícios

Branch `redesign/408-dicas-catalogo`. Pranchas baixadas em `.canvas/project/` (ignorado);
render: `node .canvas/render-pn.mjs ~/.cache/fatia-vis/408/web/board <Prancha> ["texto p/ clicar"...]`.
Prints da prancha em `~/.cache/fatia-vis/408/web/board/`.

## Decisões (registrar no REDESIGN_PROGRESS.md)

- Campos novos por comunidade ficam no `GroupExerciseGuide` (não em `Exercise`): o exercício do
  catálogo geral é de todo mundo; "da casa" e o padrão no plano são da academia.
  `steps`, `commonMistakes`, `homeFriendly`, `defaultSets`, `defaultReps`, `defaultRestSeconds`,
  `defaultLoadMode` (PlanLoadMode, no lugar de `defaultLoadUnit`: carga é sempre kg).
- Favorito da equipe: tabela `GroupExerciseFavorite (groupId, exerciseId)`.
- Vídeo: regra única para o vídeo do exercício (guia e editor são o mesmo campo):
  MP4/MOV, até 200 MB e até 60 s. A duração é lida do `mvhd` no confirm (servidor);
  `MediaFile.durationMs`. #351 fica aberta (player nativo, câmera, PiP).
- `WorkoutPlanExercise` aponta para o `Exercise` vivo. O padrão (séries/reps/descanso/carga) é
  copiado ao montar o plano → editar vale só para planos novos. Vídeo, passos, erros e dica são
  sobreposição lida na hora → trocar o vídeo vale para todos (o antigo sai do bucket).
- Dica: categoria ganha `RECOVERY`; `GENERAL` segue válida (dicas antigas). Texto até 600
  (o que já passava fica se não mudar). `announce` no criar/salvar (como #405).
- Quem edita: `content.publish` (dono, admin, profissional, criador; o admin entrou na #404).

## Estado

- [ ] migration 20261120700000_exercise_catalog_tips
- [ ] API: catálogo com filtros, favorito, guia estendido, duplicar, uso em planos, duração do vídeo
- [ ] API: dicas (categoria, 600, announce, pinned/published no salvar)
- [ ] MCP get_exercise_details / explain_form + docs/MCP_TOOL_SURFACE.md
- [ ] api-client
- [ ] web: Pn-10, Pn-11, Pn-11b; busca do editor de plano com favoritos primeiro
- [ ] membro: passos/erros da casa no detalhe do exercício (web e app)
- [ ] isolation spec, passada visual, docs, PR

## Próximos passos

Seguir a lista acima em ordem, teste vermelho antes de cada feat.
