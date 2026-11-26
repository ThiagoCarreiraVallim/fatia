# HANDOFF #372 — Onboarding de quem cria a comunidade e do profissional convidado

- Branch: `redesign/372-onboarding-equipe` (a partir de origin/main 318eb740)
- Worktree: `.claude/worktrees/agent-add7bed28ac8d1510`
- Portas: API 3172, web 3182. Banco descartável `fatia_t372` (apagar no fim com `DROP DATABASE fatia_t372`).
- Pranchas baixadas em `/tmp/claude-1000/.../scratchpad/canvas/project/` (Onb-C1..C5, Onb-Criador-Web, Onb-E1..E3, Pn-21, Pn-21d).
  Se sumirem: `Artifact read` do canvas `GvL8GtYkJGjK5e4YovhZ3o` com `project/<Prancha>.dc.html`.

## Decisões

- Checklist segue o canvas (9 itens, o 9º é "Entrada e quem posta", não "Quem recebe o relatório").
- `Group.kind` (`GroupKind` GYM | COACH), nulo na social; `GroupType` fica. Patrocinadas antigas = GYM.
- Estado: `Group.setupSteps SetupStep[]` (feitos por ação ou à mão), `setupHiddenAt`, `setupRepeatedAt`.
  Itens automáticos derivados dos dados; comunidades antigas nascem com o guia escondido.
- Contraste: avisa e grava o tom corrigido (já é o que a API da #413 faz).
- Comunidade ativa (#412) = checklist completo.
- Permissão nova `group.setup` (só OWNER).
- "Aberto para não membros" do desafio: depende da página pública (#416), fica fora.

## Checklist

- [x] API: migration, setup service/controller, kind na criação, slug-check, notify no desafio, auto-marcação, first-steps
- [x] api-client: community-setup.ts (vermelho: os 7 testes contra stub, cada um na própria asserção)
- [ ] Web: C1/C2, checklist no Início, Repetir o guia, Pn-21d, C5, cartaz, E1, E2, E3
- [ ] Mobile: C1/C2, C3, C4, C5, E1, E2, Repetir o guia
- [ ] Docs: PERMISSIONS, DATA_RETENTION, MOBILE_PARITY, REDESIGN_PROGRESS
- [ ] Passada visual em ~/.cache/fatia-vis/372/
- [ ] PR, CI verde

## Estado atual

Começando pela API.
