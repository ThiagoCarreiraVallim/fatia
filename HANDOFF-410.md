# HANDOFF #410 — boas-vindas da comunidade

Worktree: `.claude/worktrees/w410`, branch `redesign/410-boas-vindas` (base origin/main 64ebd0c4).
O worktree antigo (agent-a0a4…) sumiu sem commits; recomeçado aqui.
Banco de teste: `fatia_t410` (já criado, migrado, seeds TACO e exercícios). Apagar no fim.
Pranchas baixadas (fora do git): scratchpad `artifact-files/.../project/Pn-23*.dc.html`, `Onb-02b*`.
Copiar para `.canvas/project/` da raiz para o `render-board.mjs`.

## Desenho

- **db:** `GroupWelcomePage (id, groupId, position 1..3, kind COVER|PLAIN, title ≤80, body ≤300, showTeam, timestamps)`,
  `@@unique([groupId, position])`, cascade do grupo. `Group.welcomePublishedAt DateTime?`, `Group.welcomeShowOnJoin Boolean @default(true)`.
  Migration `20261121100000_group_welcome_pages` com CHECKs.
- **api (sharing):** `welcome.service.ts` + `welcome.controller.ts`
  - `GET /groups/:g/welcome` (content.publish): `{ pages, publishedAt, showOnJoin }`.
  - `PUT /groups/:g/welcome` (content.publish): `{ pages[0..3], showOnJoin, published }`. Publicar sem página = 400.
  - `GET /groups/:g/welcome/pages` (content.read): só publicadas (Sobre), `[]` se não publicada.
  - `InvitePreview.welcome`: páginas quando publicada **e** showOnJoin.
- **onboarding:** etapa nova `community` entre `welcome` e `share` (api ONBOARDING_STEPS + api-client ONBOARDING_FLOW_ORDER), só com convite e páginas; progressSegment não muda (community divide o traço do welcome).
- **api-client:** `community-welcome.ts` (tipos, api, `welcomeLines`, limites, validação, ícone, CTA, posição).
- **web painel:** `/org/[g]/welcome` (Pn-23/23b/23c), item "Boas-vindas" em Comunidade (content.publish). "Ver como aluno" e "Ver o padrão" em diálogo.
- **web/app aluno:** passo no onboarding (Onb-02b) e rever em Sobre.

## Decisões (registrar no REDESIGN_PROGRESS)

- 300 caracteres mantido (recomendação da issue); título até 80.
- Tipo COVER|PLAIN (issue). Os 3 tipos da prancha (Capa/Lista/Texto) viram: capa ou simples + "- " vira lista em qualquer tipo + chave "Mostrar a equipe nesta página" (`showTeam`).
- Publicação vale para o conjunto (Group.welcomePublishedAt), não por página.
- Permissão: `content.publish` (papéis que editam conteúdo).
- Só pelo convite no onboarding; quem entra por código ou já tem conta relê em Sobre.
- Ordem da etapa 10 (orquestrador): #410 → #413 → #412 → #372, depois #391 e #397 puxadas da 11 antes de #409, #411 e #414.

## Estado

- [x] db + migration
- [x] api red → green (welcome-pages.integration, isolation, onboarding 'community', panel ⌘K)
- [x] api-client red → green (community-welcome.ts, onboarding-flow, menu)
- [ ] web painel red → green
- [ ] onboarding web + app, Sobre web + app
- [ ] docs (REDESIGN_PROGRESS Etapa 10, MOBILE_PARITY?)
- [ ] passada visual (portas 3110/3140), prints em ~/.cache/fatia-vis/410/web/
- [ ] merge origin/main, push, PR
