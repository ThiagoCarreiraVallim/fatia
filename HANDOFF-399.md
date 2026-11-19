# HANDOFF #399 — correções da revisão adversarial

Base: f28fb4d2 (feature completa). Lista do coordenador: F1–F10, suspeitos, merge origin/main, REDESIGN_PROGRESS.
Regra: test(...) vermelho commitado antes de fix(...). Banco fatia_t399. Sem push.

## Feito

(nada ainda)

- API: F1 (unique sessionId+authorId+groupId, migration 20261119400000 ajustada; banco recriado), F2 (trava advisory + tx), F3, F4 (comentário do tipo), F5 (sessão, meta e Desfazer da IA), F6 (url /org/<g>/review/at-risk), F8 (code points no service e DTO), joinedAt→createdAt, try/catch no digest. Teste antigo do digest dependia da hora: corrigido.
