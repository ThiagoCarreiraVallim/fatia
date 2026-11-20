# HANDOFF #403 — correções da revisão do PR #460

Branch `redesign/403-assentos-faturas` (já no remoto, PR #460 aberto; não mergear).
Banco de teste `fatia_t403` (`export $(cat $HOME/.cache/fatia-vis/403/t403.env)`, jest `--maxWorkers=4`); apagar no fim.
Spec do revisor: scratchpad `specs/rev403.spec.ts` (A, B, C).

Cada item: commit `test(...)` vermelho, depois `fix(...)`.

1. [x] Assento de programa vale pela janela do programa, sem olhar fim/cancelamento do pool; `create` recusa pool cancelado/encerrado (409 claro).
2. [x] Sair do desafio revoga o assento do programa; `fillFromChallenge` revoga quem não está mais e dá a vaga ao próximo.
3. [x] Tirar "Ativaram em 48 h" (api, api-client, web) até a #421; diferença intencional no REDESIGN_PROGRESS.
4. [x] Programa estornado/contestado/apagado (`chargeStatus` CANCELED) não dá PRO; painel coerente.
5. [x] Cobrança órfã: transação falhou depois da cobrança → cancelar no Asaas.
6. [x] `PLAN_ENDED` com refId da versão (o visto não gruda).
7. [x] REDESIGN_PROGRESS: compras com `userId` nulo/anonimização ficam para a #421.

Depois: lint/typecheck/testes api, api-client, web; `git merge origin/main`; marcadores; apagar este arquivo; `git push`.
