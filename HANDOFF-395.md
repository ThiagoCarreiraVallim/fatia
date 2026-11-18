# HANDOFF #395 — Desafios: tipos, check-in com foto, pontos, ranking e revisão

Branch `redesign/395-desafios` (parte de `redesign/393-comunidades`). Worktree `.claude/worktrees/395-desafios`.
Banco de teste: `fatia_t395` (env em `$SCRATCH/env395.sh`: `.env` do checkout principal com `/fatia` → `/fatia_t395`).
Pranchas baixadas em `.canvas/project/` (Cm-08..11, Cm-17*, Cm-18, Pn-13).

## Decisões

- ADR 044 (já aceita, comentário do dono na issue) manda: foto só para a pessoa e a equipe; ninguém mais, nem borrada; sem "postar no mural".
- Brief do orquestrador: ADR nova (047) + categoria de consentimento própria; desfoque no servidor; membros sinalizam; fila com limite.
  - Conciliação: ADR 047 complementa a 044. Como nenhum desfoque é servido (044), "desfoque no servidor" vira regra: se um dia houver versão borrada, ela nasce no servidor; hoje o visitante não recebe foto nenhuma.
  - Consentimento próprio: `GroupChallengeParticipant.photoConsentAt/photoConsentVersion` exigido ao entrar em desafio FOTO/PONTOS.
  - Fila: membro sinaliza (até 3 por dia), fila aberta por desafio com teto (50); cheia → 409.
- Modelo: `GroupChallenge.kind` (METRIC legado, PHOTO, WATER, STEPS, NUTRITION, POINTS) + metric; `ChallengeCheckin` (PHOTO/WATER/STEPS, status VALID/FLAGGED/VOIDED); `ChallengeCheckinFlag`; `ChallengeDayScore`; `GroupChallengeWatcher`; `WorkoutSession.createdAt`.

## Feito

- (nada ainda)

## Falta

- tudo
