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

- db: migração `20261118100000_challenge_kinds_checkins_review` (7bbfa94e)
- social: `challenge-days.ts` + `ScoreboardService.dayFacts` (29f1cbe3)
- api: ChallengeService reescrito, ChallengeCheckinService, rotas, permissão `challenge.review`, mídia `challenge_checkin`, retenção (f0c5600e, d0957bbb)
- api-client: tipos/helpers/rotas (770be8cb)
- web e mobile delegados a subagentes (HANDOFF-395-web.md / HANDOFF-395-mobile.md, commits só em apps/web e apps/mobile)

## Falta

- user-isolation.spec (foto/checkin de outro desafio/grupo/usuário, fila por membro, resolve por URL alheia, flag por desafio alheio)
- export LGPD (account.service: kind + check-ins)
- MCP: descrições, `get_my_challenge_progress` + card, regenerar contagens pelos specs
- docs: ADR 047, notas 027/044, DATA_RETENTION, THREAT_MODEL, REDESIGN_PROGRESS (#395)
- verificação final (lint, typecheck, testes), apagar HANDOFFs
