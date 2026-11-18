# HANDOFF #395 — correções da revisão adversarial

Branch `redesign/395-desafios`. Banco de teste `fatia_t395` (env em `$SCRATCH/env395.sh`).
Regra: teste vermelho commitado antes da correção; só commits novos (sem rebase).

## Itens

- [ ] migração renomeada para `20261118300000_challenge_kinds_checkins_review`
- [ ] B1 fonte dos passos forçada a MANUAL na rota manual e no `log_steps`
- [ ] B2 um treino, um check-in; data no fuso do desafio
- [ ] B3 sem medalha antes de `finalizedAt` (leaderboard e MCP)
- [ ] I1 revisor não decide o próprio check-in (403, fora da fila dele)
- [ ] I2 "Vale" regrava a impressão do treino
- [ ] I3 duração do treino pelo relógio do servidor
- [ ] I4 log de água/passos editado depois do prazo não conta
- [ ] I5 sinalizar só com desafio em andamento
- [ ] I6 teto de 50 só para membro; detector sempre entra
- [ ] I7 MCP leaderboard sem `activity`
- [ ] I9 asserção vazia no spec de check-in
- [ ] M1..M8
- [ ] lint, typecheck, testes, MCP regenerado
