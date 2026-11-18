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

- [x] 1. Schema + migration (`20261118100000_mural_polls_blocks`)
- [x] 2. API bloqueio (UserBlock) + filtros + testes + user-isolation
- [x] 3. API ocultar post, filtros do mural, pins com ordem/prazo, publicar como, não vistos
- [x] 4. API enquetes
- [x] 5. API comunicados (agendar/repetir/job/push) + permissão + PERMISSIONS.md
- [x] 6. API posts automáticos por tipo (auto-post.ts; hooks em content, group-exercise, challenge; Group.autoPosts no update)
- [x] 7. API Para você (for-you.service/controller, GET groups/:id/for-you)
- [x] 8. LGPD export/exclusão
- [x] 9. MCP (list/create aceitam enquete; vote/get poll; blocks) + chat cards
- [x] 10. api-client (community-feed.ts: tipos, feedApi/moderationApi/announcementsApi/blocksApi/forYouApi, helpers de enquete/horário/repetir; abas Mural/Para você/Desafios/Conteúdo, Agenda escondida até #397; markdown-lite título e citação + renderers web/app)
- [x] 11. Web aluno (composer Post/Enquete/Prévia/toolbar/publicar como/fixar; poll-block; block-dialog; menu copiar/ocultar/bloquear/denunciar; fixar com prazo; carrossel; filtros; novos+markSeen; for-you; /you/blocked; testes vistos vermelhos: 13 falhas com os arquivos antigos)
- [x] 12. Web painel: seção nova `announcements` (Comunicados e enquetes, dono+profissional: novo comunicado agora/agendado 15 min/repetir/fixar com prazo/push, agendados com cancelar, enquetes Pn-26 com nova enquete); Moderação (dono) ganhou avisos fixados (subir/desafixar) e posts automáticos. Testes vermelhos vistos (3 falhas com a página antiga).
- [x] 13. App: composer.tsx, poll-block.tsx, feed-ui (menu copiar/ocultar/bloquear/fixar com prazo via action sheet, tipos), mural com carrossel/filtros/novos, community-tabs com contador, for-you.tsx, you/blocked.tsx, org/announcements.tsx, moderação com fixados e automáticos. Sem gaveta nova (usa action sheet e confirm existentes). Lógica testada no api-client.
- [ ] 14. ADR 032, PERMISSIONS, REDESIGN_PROGRESS, lint/typecheck/testes

## Próximo passo

Item 14: ADR 032 (bloqueio global, enquete, comunicados), REDESIGN_PROGRESS Etapa 7, pnpm lint/typecheck, testes api (recriar env do fatia_t394), api-client, web, mobile; commit final sem o HANDOFF.

Arquivos: sharing/{block,announcement}.{service,controller}.ts, post.service.ts (reescrito: pins/posts separados no FeedPage, visibleWhere com bloqueio e ocultar), dto/post.dto.ts, permissions.ts + docs/PERMISSIONS.md (`announcement.publish`), users/account.service.ts (export), testes mural.integration.spec.ts, user-isolation (#394).
