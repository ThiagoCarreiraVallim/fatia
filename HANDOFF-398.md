# HANDOFF #398 — Painel: layout novo, visão geral e busca (⌘K)

Branch `redesign/398-painel-layout`. Banco de teste `fatia_t398` (`.env` local do worktree, fora do git).
Pranchas: `/home/thiago/Documentos/pessoal/fatia/.canvas/project/Pn-01-Visao.dc.html`, `Pn-01b-…`, `Pn2-00*.dc.html`.

## Decisões (do orquestrador + minhas)

- Regras de comunicado = #394. Aqui: editor no painel lateral + prévia (mural / tela bloqueada).
- #311 (tarefas do profissional) fora.
- E-mail do comunicado: mesma preferência `ANNOUNCEMENTS` + link de descadastro com token HMAC
  (`EMAIL_UNSUBSCRIBE_SECRET`), sem login. Sem SMTP ou sem segredo: e-mail indisponível no editor.
- "Entraram e ainda não registraram": só número, via `suppress()` (MIN_CELL) sobre quem tem `statsOptIn`.
- Preferência do menu (recolhido, grupos) e "Recentes" da busca: `localStorage` por usuário (preferência de UI).
- Origem da entrada: `GroupMembership.joinVia` (INVITE, CODE, PAGE); nulo = antes da #398.
- Limite semanal de push de comunicado por comunidade: `ANNOUNCEMENT_PUSH_WEEKLY_LIMIT` (padrão 3).
  Passou do limite: sai no mural sem push.
- "Visitas" não tem dado (check-in da recepção é da #404): gráfico com Treinos registrados e Ativos no dia.
- Busca: `panel.search` (dono, profissional). Telas e planos dependem de permissões próprias, então
  um papel futuro (Recepção, #404) sem elas vê só nomes.
- Itens do menu sem tela ainda ficam escondidos (`ready: false` no catálogo do menu).

## Feito

- migration `20261119100000_panel_overview_announcement_email` (joinVia, alsoEmail, contas, notifiedAt,
  PushTicket.announcementId, User.announcementEmailOptOutAt).
- API: `sharing/panel.service.ts` + `panel.controller.ts` (`GET groups/:id/panel/counts`, `/overview?days=`,
  `/search?q=`), permissões `panel.overview`/`panel.search` (+PERMISSIONS.md). Spec `panel.integration.spec.ts`.
- API: comunicado com e-mail (`notifications/announcement-email.service.ts` + controller público
  `email/announcements/subscription`), limite semanal, `settings`/`recent`, contas pushSent/Delivered/emailSent.
  Spec `announcement-delivery.integration.spec.ts`. Envs no compose, .env.example e .env.production.example.

- user-isolation (bloco #398), export LGPD (opt-out e joinVia), api-client (`panel-shell.ts`).
- Web: `org-shell.tsx` novo (menu em grupos, topo, ⌘K, painel lateral), `panel-search.tsx`, `side-panel.tsx`,
  `panel-prefs.ts`, `announcement-editor.tsx` (usado no topo, na Visão geral e em Comunicados), Visão geral nova,
  `/descadastro` público. Testes web atualizados/novos.
- `docs/REDESIGN_PROGRESS.md`: seção Etapa 8 com o bloco #398.

## Falta

- `pnpm lint`, `pnpm typecheck`, testes api/api-client/web; apagar este arquivo no último commit; relatório final.
