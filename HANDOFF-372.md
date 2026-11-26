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

- [x] API, api-client, web, mobile, docs (commitados)
- [x] Passada visual web (390 e 1440, escuro) em ~/.cache/fatia-vis/372/web; correções em c5b4f1ed
- [ ] Passada visual app (emulador): C1, C2, C3, C4, C5 e E1 vistos; falta E1 com o logo corrigido, E2 e C3 de novo; correções em fc8fa0db
- [ ] REDESIGN_PROGRESS: "Verificado" e "Passada visual"; checks completos; apagar HANDOFF e scripts/tmp-*.mjs
- [ ] PR [Redesign 48/50], CI verde, DROP DATABASE fatia_t372

## Como subir (scripts no scratchpad da sessão; refazer se sumirem)

- API: env do .env da raiz + DATABASE_URL=.../fatia_t372, API_PORT=3172, WEB_ORIGIN=http://localhost:3182, `pnpm exec nest start` em apps/api.
- Web: NEXT_PUBLIC_API_URL=http://localhost:3172, LOGTO_BASE_URL=http://localhost:3182, `next dev -p 3182`.
- Sessão do demo: e2e/.auth/demo.json do worktree (login feito com a web da worktree na 3030; o Logto só aceita callback na 3030).
- Metro: EXPO_PUBLIC_API_URL=http://192.168.18.37:3172, `expo start --port 8081` em apps/mobile (apps/mobile/.env copiado da main, ignorado pelo git). O Expo Go está logado com a conta pessoal do dono, não com o demo: no banco descartável ela ganhou onboardedAt e criou a "Estudio Norte".
- Seed do demo no fatia_t372 (Academia Demo); convites de profissional por `community-invite.ts academia-demo --role PROFESSIONAL`.
