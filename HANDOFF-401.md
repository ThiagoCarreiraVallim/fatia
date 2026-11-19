# HANDOFF #401 — correções da revisão adversarial

Branch `redesign/401-membros-convites`. Banco `fatia_t401` (`t401env.sh` no scratchpad).
Feature já pronta (ver docs/REDESIGN_PROGRESS.md, bloco #401). Agora: 15 itens da revisão.

## Feito

(nada ainda)

## Falta

1 corrida reenvio/renew (updateMany condicional) + guards resend/accompanied-by
2 ativação por convite fora; cartão e joinedNoFirstLog mesma população; só % ou valor
3 convite de equipe: sem noExpiry, maxUses obrigatório, ≤30 dias (service + invite-panel)
4 teto por (grupo,e-mail) 5/30d; bloqueio após recusa; create aplica filtro pendente; msg sem "revogue"
5 bulk + audit no mesmo $transaction; assignMany idem; targetCount real
6 panel.service pendingInvite = filtro da página
7 código de entrada: recusar accompaniedBy/giveSeat/noExpiry (400)
8 acompanhante só para alvo MEMBER
9 assento no aceite em try/catch; update do aceite com declinedAt null
10 freshLink reaproveita link de 10 min; aviso na UI
11 exclusão revoga convites abertos criados pela conta
12 InvitePreview.expiresAt string|null
13 e-mail fixo 30 dias
14 segredos: blocos repetidos, LINK != UNSUBSCRIBE, teste placeholder tamanho certo
15 testes: concorrência reenvio/renew/assento; url nulo revogado/vencido; HMAC revogado no aceite
