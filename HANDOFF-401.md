# HANDOFF #401 — Painel: membros, convites e ativação pendente

Branch `redesign/401-membros-convites`, worktree `.claude/worktrees/401-membros-convites`.
Banco de testes: `fatia_t401` (script `t401env.sh` no scratchpad monta o `DATABASE_URL`;
recriar: DROP/CREATE via `prisma db execute`, `migrate deploy`, `seed:taco`, `seed:exercises`).
Pranchas baixadas em `/home/thiago/Documentos/pessoal/fatia/.canvas/project/` (Pn-04*, Pn-06*, Pn-22*, Ex-01).

## Decisões (orquestrador + minhas)

- "Sem prazo" só para link/QR; e-mail nominal vence em 30 dias (fixo), uma vez. `Ex-01` e notas mudam conforme o tipo.
- "Convites sem aceite": lista nominal fica; só os totais pequenos (< 5) somem.
- Ativação pendente: convite por e-mail sem aceite há 2 dias ou mais; expira em 30.
- Importação por planilha/sistema (#340, #322) fora.
- Minhas:
  - Ativação = 1º **treino** em até 48 h depois de entrar, só entre membros com `statsOptIn` (AGGREGATION_POLICY §6 e §7: refeição/peso não agregam), mesma regra de dois lados (`binarySplit`) da #398.
  - Link copiável depois: token do link (sem e-mail) é derivado `HMAC(INVITE_LINK_SECRET, id)`; o banco segue só com o hash. Sem o segredo, o link só aparece na criação (como antes). Env nova `INVITE_LINK_SECRET`.
  - Reenviar troca o token (o link do e-mail anterior deixa de valer). Limite: `sendCount` até 5 envios por convite + intervalo de 10 min.
  - WhatsApp na ativação: gera link novo (sem e-mail) e mostra a mensagem num diálogo com Copiar / Abrir WhatsApp (clipboard depois de await é bloqueado).
  - "Acompanhado por" = `GroupMembership.accompaniedById` (profissional/dono ativo do mesmo grupo). Permissão nova `member.assign` (dono).
  - Ações em massa: `POST groups/:id/members/bulk` (accompany | seat | unseat), até 100 ids, `GroupAuditLog`.

## Feito

- (nada ainda)

## Falta (ordem)

1. Migration `20261119200000_invites_origin_activation` + schema.
2. API: invite create/batch (label, origin, noExpiry, accompaniedBy, giveSeat), accept (joinedViaInviteId, accompaniedBy, seat, acceptedAt), decline, overview, pending, resend em lote, renew; members (joinedVia, accompaniedBy, saíram), accompany, bulk; LGPD; e-mail Ex-01; testes vermelhos antes.
3. api-client: tipos, orgApi, NAV (`activation`), textos; testes.
4. Web: Membros (Pn-04/04b/04c/04d), Convites (Pn-06/06b), Ativação (Pn-22*); testes.
5. Docs: PERMISSIONS.md, REDESIGN_PROGRESS (Etapa 8), DATA_RETENTION se preciso, envs.
6. lint/typecheck/testes verdes; apagar este arquivo no último commit.

## Fora (dependências)

- #404 papéis de equipe novos (Administrador, Recepção) em "Entra como"; "Última visita" (check-in da recepção).
- #403 assentos: "Dar assento" bloqueia e leva para a tela de Assentos atual.
- #416 aceitar convite na web (redesign) e #372 recusa no Onb-E1 (API de recusa pronta aqui).
- WhatsApp do membro (número autorizado): não há campo de telefone; #338 etapa 1 só o botão de mensagem.
- "Enviar" em massa (Pn-18), "Pedir avaliação" (#383/#402).
