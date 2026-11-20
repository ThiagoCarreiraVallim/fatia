# HANDOFF #405 — correções da revisão adversarial (PR #461)

Branch `redesign/405-biblioteca-enviar` (já no remoto, PR #461 aberto). Banco `fatia_t405` recriado
(migrate + taco + exercises). Spec do revisor: scratchpad `specs/rev405.spec.ts`.

## Decisões

- I1: reenvio da mesma oferta ignora a própria oferta em "depois do plano atual". Aceitar versão
  com início futuro (calendário) com outra aceita em uso: a anterior segue ACEITA (plano e agenda)
  até a véspera; a nova grava a agenda a partir do início dela; um job de hora em hora
  (`settleScheduledVersions`) troca os exercícios e substitui a anterior quando o dia chega.
- I2: "já tem" = oferta deste modelo DESTE autor, nem removida nem terminada (o mesmo `where` do
  envio, `resendTargetWhere`). Recusada conta (vira versão nova, com o recado).
- M1: plano alimentar pela biblioteca: versão/"o que mudou"/substituição só no mesmo modelo.
- M2: envio de plano alimentar com advisory lock por pessoa.
- M3: "depois do plano atual" com plano flexível sem fim: a opção fica desligada na tela para
  essas pessoas (`openEnded`) e a API responde 400.
- M4: lote numa transação só (travas por pessoa em ordem de userId); avisos depois do commit.

## Passos

- [x] 1. Testes vermelhos (plan-send-review.integration.spec.ts + ajuste do spec antigo)
- [x] 2. Implementação API
- [x] 3. api-client/web: `openEnded` desliga "Depois do plano atual"
- [ ] 4. Verdes (api, api-client, web, mobile), docs, merge origin/main, push
