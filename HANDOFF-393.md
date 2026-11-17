# HANDOFF #393 — Comunidade: minhas comunidades, código, sobre e benefícios

Branch `redesign/393-comunidades` (worktree `.claude/worktrees/393-comunidades`). Não fazer push nem PR.

## Comandos que funcionam

- DB descartável: `export DATABASE_URL=$(cat /tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/turl)`
  (= `.env` raiz com `/fatia` → `/fatia_t393`). Já criado, migrado e com seed:taco/seed:exercises.
- Migrar: `cd packages/db && DATABASE_URL=... npx prisma migrate deploy` (gerar client: `npx prisma generate`).
- Testes API: `cd apps/api && DATABASE_URL=... npx jest <padrão>`.
- Pranchas: `.canvas/project/Cm-01..., Cm-02, Cm-04, Cm-22, Cm-22b, Pn-28*` já baixadas (no checkout principal).

## Plano / estado

- [ ] DB: migration `GroupPartnerBenefit`, `GroupInvite.code`, `GroupMembership.feedSeenAt`
- [ ] API: preview por código/slug (`?code=`), join por código (joinPolicy), `proOffer`
- [ ] API: código de entrada revogável (convite com `code`) no painel de convites
- [ ] API: resumo da lista (memberCount, newPosts, forYou, challengeRank, visibility, timezone)
- [ ] API: feed marca visto na 1ª página
- [ ] API: `GET /groups/:id/team-view` (quem da equipe vê, "viu hoje")
- [ ] API: benefícios (membro + CRUD equipe), isolamento
- [ ] MCP: `list_group_benefits` + produtor de cartão + números regenerados
- [ ] api-client: tipos, `parseCommunityEntry`, textos
- [ ] web: Cm-01, Cm-02, Cm-04 (sobre), Cm-22, painel Pn-28
- [ ] app: Cm-01, Cm-02 (QR), Cm-04, Cm-22
- [ ] docs REDESIGN_PROGRESS + lint/typecheck/testes

## Decisões

(ver abaixo, preencher ao longo)

## Próximo passo

Schema + migration.
