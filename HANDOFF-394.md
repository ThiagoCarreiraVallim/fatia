# HANDOFF #394 — Mural: posts, comunicados, enquetes, denúncia, bloqueio e Para você

Branch `redesign/394-mural` (worktree `.claude/worktrees/394-mural`). Não dar push nem abrir PR.
Pranchas baixadas em `.canvas/project/` do worktree (fora do git).

## Comandos que funcionam

```bash
# env do banco descartável (fatia_t394, já criado com migrate deploy + seeds)
set -a; source /tmp/claude-1000/-home-thiago-Documentos-pessoal-fatia/0bd027d0-f0c2-42a3-b37f-2f6dd993fad5/scratchpad/t394.env; set +a
# (se o scratchpad sumiu: DATABASE_URL do .env da raiz com sed -E 's#/fatia(\?|$)#/fatia_t394\1#')
cd packages/db && npx prisma migrate deploy && npx prisma generate
cd apps/api && npx jest src/sharing/__tests__/post.integration.spec.ts
```

## Decisões

- Agendamento e repetição moram em `GroupAnnouncement` (o "equivalente" da issue): cada disparo cria um `GroupPost` kind ANNOUNCEMENT. `GroupPost` ganha `kind`, `title`, `publishedAs`, `pinOrder`, `pinnedUntil`, `announcementId`, `autoKind`/`autoRefId`.
- E-mail de comunicado: fora (sem infra de descadastro; registrar no REDESIGN_PROGRESS).
- Bloqueio por post/comentário (`POST /users/me/blocks {groupId, postId, commentId?}`): o cliente nunca vê userId de outra pessoa. Post publicado "como a academia" não some por bloqueio.
- Enquete: % só com total >= 5 E (votou OU encerrada); para a equipe no painel, só total >= 5. Abaixo disso a API não manda nem total nem contagem.
- `announcement.publish`: OWNER e PROFESSIONAL. Reordenar/desafixar: `content.moderate`.
- Para você: ofertas de plano e planos alimentares da comunidade, comunicados não vistos, recomendados (conteúdo publicado). Questionário (#391) e avaliação (#383) ficam para as issues deles.

## Checklist

- [x] 1. Schema + migration (`20261117200000_mural_polls_blocks`)
- [x] 2. API bloqueio (UserBlock) + filtros + testes + user-isolation
- [x] 3. API ocultar post, filtros do mural, pins com ordem/prazo, publicar como, não vistos
- [x] 4. API enquetes
- [x] 5. API comunicados (agendar/repetir/job/push) + permissão + PERMISSIONS.md
- [x] 6. API posts automáticos por tipo (auto-post.ts; hooks em content, group-exercise, challenge; Group.autoPosts no update)
- [x] 7. API Para você (for-you.service/controller, GET groups/:id/for-you)
- [x] 8. LGPD export/exclusão
- [x] 9. MCP (list/create aceitam enquete; vote/get poll; blocks) + chat cards
- [x] 10. api-client (community-feed.ts: tipos, feedApi/moderationApi/announcementsApi/blocksApi/forYouApi, helpers de enquete/horário/repetir; abas Mural/Para você/Desafios/Conteúdo, Agenda escondida até #397; markdown-lite título e citação + renderers web/app)
- [~] 11. Web aluno: feito composer, poll-block, block-dialog, feed-ui (menu copiar/ocultar/bloquear, fixar com prazo, tipos), page (filtros, carrossel, novos), for-you, /you/blocked. FALTA testes web
- [ ] 12. Web painel (Pn-14, Pn-26)
- [ ] 13. App (Cm-03/05/06/07/20/21) + bloqueados
- [ ] 14. ADR 032, PERMISSIONS, REDESIGN_PROGRESS, lint/typecheck/testes

## Próximo passo

Item 11 web aluno. Atualizar apps/web/src/app/(app)/community/[groupId]/**tests**/page.test.tsx (abas novas). Depois 12 e 13.

Arquivos: sharing/{block,announcement}.{service,controller}.ts, post.service.ts (reescrito: pins/posts separados no FeedPage, visibleWhere com bloqueio e ocultar), dto/post.dto.ts, permissions.ts + docs/PERMISSIONS.md (`announcement.publish`), users/account.service.ts (export), testes mural.integration.spec.ts, user-isolation (#394).
