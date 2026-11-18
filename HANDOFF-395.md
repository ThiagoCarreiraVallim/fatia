# HANDOFF #395 — correções da revisão adversarial

Branch `redesign/395-desafios`. Banco de teste `fatia_t395` (env em `$SCRATCH/env395.sh`).
Regra: teste vermelho commitado antes da correção; só commits novos (sem rebase).

## Itens

- [x] migração renomeada para `20261118300000_challenge_kinds_checkins_review`
- [x] B1 fonte dos passos forçada a MANUAL na rota manual e no `log_steps`
- [x] B2 um treino, um check-in; data no fuso do desafio
- [x] B3 sem medalha antes de `finalizedAt` (leaderboard e MCP)
- [x] I1 revisor não decide o próprio check-in (403, fora da fila dele)
- [x] I2 "Vale" regrava a impressão do treino
- [x] I3 duração do treino pelo relógio do servidor
- [x] I4 log de água/passos editado depois do prazo não conta
- [x] I5 sinalizar só com desafio em andamento
- [x] I6 teto de 50 só para membro; detector sempre entra
- [x] I7 MCP leaderboard sem `activity`
- [x] I9 asserção vazia no spec de check-in
- [x] M1..M8
- [x] lint, typecheck, testes, MCP regenerado

## Estado

Todos os itens corrigidos; falta só a verificação final (lint, typecheck, testes) e apagar este arquivo.
