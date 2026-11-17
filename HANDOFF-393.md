# HANDOFF #393 — Comunidade: minhas comunidades, código, sobre e benefícios

Branch `redesign/393-comunidades` (worktree `.claude/worktrees/393-comunidades`). Não fazer push nem PR.

## Comandos que funcionam

- DB descartável: `export DATABASE_URL=$(cat /tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/turl)`
  (= `.env` raiz com `/fatia` → `/fatia_t393`). Já criado, migrado e com seed:taco/seed:exercises.
- Migrar: `cd packages/db && DATABASE_URL=... npx prisma migrate deploy` (gerar client: `npx prisma generate`).
- Testes API: `cd apps/api && DATABASE_URL=... npx jest <padrão>`.
- Pranchas: `.canvas/project/Cm-01..., Cm-02, Cm-04, Cm-22, Cm-22b, Pn-28*` já baixadas (no checkout principal).

## Plano / estado

- [x] DB: migration `GroupPartnerBenefit`, `GroupInvite.code`, `GroupMembership.feedSeenAt`
- [x] API: preview por código/slug (`?code=`), join por código (joinPolicy), `proOffer`
- [x] API: código de entrada revogável (convite com `code`) no painel de convites
- [x] API: resumo da lista (memberCount, newPosts, forYou, challengeRank, visibility, timezone)
- [x] API: feed marca visto na 1ª página
- [x] API: `GET /groups/:id/team` (quem da equipe vê, "viu hoje")
- [x] API: benefícios (membro + CRUD equipe), isolamento
- [x] MCP: `list_group_benefits` + produtor de cartão + números regenerados
- [ ] api-client: tipos, `parseCommunityEntry`, textos
- [ ] web: Cm-01, Cm-02, Cm-04 (sobre), Cm-22, painel Pn-28
- [ ] app: Cm-01, Cm-02 (QR), Cm-04, Cm-22
- [ ] docs REDESIGN_PROGRESS + lint/typecheck/testes

## Decisões

- Código de entrada = `GroupInvite.code` (8 chars sem 0/O/1/I/L), revogável; segue `joinPolicy` (não é aprovação). `POST /groups/:id/invites {role:MEMBER, code:true}`; url do QR `/community?join=1&code=X`. Slug continua valendo como código. `?code=` ou `?slug=` em preview/join.
- `proOffer` = pool valendo e assento livre (ou ALL_MEMBERS) — `entry-code.ts#groupHasFreeSeat`.
- Selo "PRO pago pela academia" = `hasAiSeat` (já é o PRO efetivo pela comunidade: assento, ALL_MEMBERS ou programa).
- "Para você" = versões de PlanOffer PENDING da comunidade. Posts novos: `feedSeenAt` gravado pela 1ª página do `PostService.list` (sem tocar telas do mural).
- Benefícios: `benefit.read` todos, `benefit.manage` só OWNER; vencido ontem aparece apagado sem cupom; rotas `GET /groups/:id/benefits`, `GET .../benefits/manage`, POST/PATCH/DELETE.

## Próximo passo

api-client (tipos, parseCommunityEntry), depois web e app.
