# HANDOFF #404 — equipe, papéis e permissões

Banco de teste: `fatia_t404` (`source <scratchpad>/env.sh` ou montar a URL do `.env` do principal com o `sed` do brief).

## Decisões (registrar no REDESIGN_PROGRESS)

- Ordem de autoridade: ADR 043 > prancha Pn-19 > mais restritivo.
- Enum `GroupRole`: + `ADMIN` (depois de OWNER) e `RECEPTION` (depois de CREATOR). Nenhum dos dois recebe vínculo.
- `TeamSpecialty` (TRAINING, NUTRITION, PHYSIO, OTHER) em `GroupMembership.specialty`, só PROFESSIONAL. NUTRITION recorta o vínculo para NUTRITION, GOALS, BODY, MEAL_PHOTOS (na criação, no estreitamento ao trocar a especialidade e na porta).
- `Group.proSeeOnlyAssigned`: profissional só lê (porta) e só lista quem ele acompanha (`accompaniedById`).
- `GroupMembership.panelSeenAt`: "último acesso" (carimbado pelos contadores do painel, no máximo a cada 5 min).
- Matriz: ADMIN = OWNER menos billing._, group.delete, group.transfer, insights.read, benefit.manage, ficha/planos/notas/revisar. RECEPTION = group.read, member.list (só nome/papel/status), member.approve (só como membro), content.read, challenge.join, post._, announcement.publish, panel.overview, panel.search, benefit.read. CREATOR perde content.moderate (prancha + ADR 043).
- ADMIN não mexe em OWNER nem ADMIN, não dá papel ADMIN (convite, aprovação, troca).
- Tabela da tela vem de `GET /groups/:groupId/permissions` (linhas em `PERMISSION_SUMMARY` no `permissions.ts`).
- Trilha: `members.role`, `members.specialty`, `members.accompany` (também o individual), `group.pro_see_only_assigned`; histórico só para o dono.

## Estado

- [ ] testes vermelhos (commit test)
- [ ] migration + permissions + services
- [ ] api-client + web (tela Equipe)
- [ ] MCP list_data_sharing / list_data_access_log
- [ ] docs (PERMISSIONS, REDESIGN_PROGRESS)
- [ ] lint/typecheck/testes

## Próximo passo

Escrever os testes vermelhos.
