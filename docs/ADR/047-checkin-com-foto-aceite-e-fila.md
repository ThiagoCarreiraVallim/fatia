# ADR 047 — Check-in com foto: aceite próprio, sinais do servidor e fila com limite

**Status:** Accepted
**Data:** 2026-11-18
**Complementa:** [ADR 044](./044-desafios-com-revisao.md) (o que a foto é e quem a vê). Esta ADR fixa
como a #395 implementou o aceite, a fila e os sinais; onde as duas divergem, vale o que está
escrito aqui só nos pontos 1, 3 e 4.

## Contexto

A ADR 044 decidiu que a foto de check-in é prova vista só pela pessoa e pela equipe que revisa.
Na implementação da #395 o orquestrador do redesign pediu três coisas a mais: uma ADR própria
para a foto com **categoria de consentimento própria**, **desfoque feito no servidor** e **membros
que sinalizam check-ins, com a fila de revisão limitada**. A 044 já tinha descartado foto borrada
para visitante e dizia que "entrar é o aceite". Esta ADR concilia as duas.

## Decisão

1. **Aceite próprio, fora do `ShareScope`.** Entrar num desafio `PHOTO` ou `POINTS` (os que têm
   check-in com foto) grava `GroupChallengeParticipant.photoConsentAt` e `photoConsentVersion`
   (versão `2026-11-18`). Sem o aceite (`acceptPhotoTerms: true` no `join`) a entrada é recusada
   com `400`, inclusive pelo MCP, que manda a pessoa ao app. Não é uma categoria de
   compartilhamento com a equipe (não abre leitura de dado de saúde, ADR 026): é o aceite de que a
   equipe vê a foto de prova e de quando ela é apagada. Sai no export (ADR 044 §7).
2. **Nenhuma foto é servida a quem não pode vê-la.** A regra do desfoque fica assim: **se um dia
   existir versão borrada, ela nasce no servidor**, nunca no cliente (que vazaria o original).
   Hoje não existe: outro participante e visitante não recebem `photoUrl` nenhum — só "fulano fez
   check-in no dia tal" (ADR 044 §1).
3. **Revisão por `challenge.review`.** Permissão nova, com os mesmos papéis de
   `challenge.manage` (dono, profissional, criador), para que a fila possa ser separada de quem
   cria desafios sem mexer nas rotas. É o "equipe com `challenge.manage`" da ADR 044.
4. **Sinais e fila.** Entram na fila (`ChallengeCheckin.status = FLAGGED`):
   - **Membro sinaliza** "Não parece válido" no check-in de outra pessoa do mesmo desafio, sem ver
     a foto, só com o desafio em andamento: até **3 sinalizações por pessoa a cada 24 h** (`429`
     depois), uma por check-in. A resposta é sempre a mesma (`{ flagged: true }`): quem sinaliza
     não descobre se o check-in já foi anulado, revisado ou se a fila encheu. Limite e teto são
     conferidos sob `pg_advisory_xact_lock` (por pessoa e por desafio).
   - **Sinais do servidor:** treino editado depois do check-in (impressão de início, fim e séries
     mudou); água com a meta lançada de uma vez entre 23 h e 3 h em 3 dias ou mais; passos com
     salto de 10 mil em até 15 min. O motivo do sistema nunca leva número (ml, passos) de ninguém.
   - **Teto:** no máximo **50 itens abertos por desafio vindos de membros**; com esse teto cheio a
     sinalização fica guardada, mas o check-in segue valendo. O detector do servidor **sempre**
     entra: um dia fora do padrão nunca conta sem a equipe olhar.
   - O ponto fica pendente até "Vale" ou "Anular"; anular exige motivo (3 a 280 caracteres),
     apaga a foto na hora e avisa a pessoa. Quem revisa não vê nem decide o próprio check-in
     (`403`); duas decisões ao mesmo tempo, só a primeira vale. "Vale" aceita o treino como está
     (regrava o retrato), e a fila da comunidade é paginada.
5. **Regras do check-in no servidor:** participante de desafio em andamento com check-in; treino
   da própria pessoa que o **servidor** viu terminar nas últimas 2 h (`serverCompletedAt`), com
   20 min ou mais **pelo relógio do servidor** (de `createdAt` a `serverCompletedAt`; o `startedAt`
   e o `completedAt` são do aparelho); treino lançado depois, ou com o `completedAt` reescrito
   (mais de 60 s longe do fim visto pelo servidor), não conta; **um treino vale um check-in** no
   desafio (índice único participante + treino); um por dia **no fuso do desafio** (trocar o fuso
   do aparelho não abre outro dia); foto da própria pessoa, desta comunidade, com propósito
   `challenge_checkin`, ainda sem uso e pedida depois de o treino abrir; a mesma imagem (SHA-256
   depois de reencodar e tirar o EXIF) não vale duas vezes no desafio; carimbo de hora do servidor.
   Água e passos editados depois do prazo do dia (`editedAt`) não contam, e os detectores olham a
   hora da edição.
6. **Resultado e retenção.** O pódio espera a fila do desafio esvaziar ou 24 h depois do fim
   (`resultPending`). A foto é apagada 30 dias depois de `finalizedAt`, ao anular, ao sair do
   desafio, ao sair da comunidade ou ao apagar a conta (ADR 044 §7). A limpeza de órfãos da mídia
   não toca foto ligada a check-in.
7. **Fonte dos passos.** A rota de registro (`POST /steps`, app e web) e o `log_steps` gravam
   sempre `MANUAL`, seja qual for o `source` do corpo (campo aceito e ignorado, para não quebrar
   cliente antigo; o `log_steps` nem o oferece). Hoje o app **não sincroniza** Apple Saúde nem
   Health Connect (`apps/mobile/src/health/health-steps.ts` é só o ponto de extensão), então
   nenhum passo conta em desafio `STEPS` até a sincronização existir. Quando ela chegar, terá rota
   própria, a única que grava fonte automática — e mesmo assim **a fonte automática continua
   dependendo do cliente** (o app declara que leu do Saúde); o servidor não tem como atestar.
   O detector de salto e o prazo do dia são o que resta contra a fraude.
8. **MCP.** Continua sem check-in, sinalização ou revisão (ADR 044 §10).
   `get_my_challenge_progress` lê só o progresso do próprio usuário.

## Consequências

### Positivas

- O aceite é auditável por versão: mudar o texto do aceite é trocar a versão e pedir de novo.
- A fila não cresce sem limite e o membro não vira moderador em massa.
- Os sinais automáticos tiram o grosso da fraude sem expor a foto a ninguém.

### Negativas

- Com o teto de membros cheio, as sinalizações novas ficam guardadas sem ir para a fila até a equipe
  decidir; o painel mostra "N para decidir".
- Os limites (3/24 h, 50, 23 h–3 h, 10 mil em 15 min) são palpites do primeiro ciclo.

### Neutras

- Os desafios antigos (`METRIC` com `WATER_ML`/`STEPS`) continuam pontuando, mas não podem mais
  ser criados; quem não participa deles não vê o ranking (somariam ml e passos).

## Alternativas consideradas

- **Foto borrada para visitantes (canvas).** Rejeitada pela ADR 044; ficou só a regra de onde o
  borrão nasceria.
- **Aceite como categoria do `ShareScope`.** Rejeitada: o `ShareScope` abre leitura de dado de
  saúde a um profissional; a foto de prova é outra coisa, por desafio, e tem prazo.
- **Fila sem teto.** Rejeitada: um desafio grande com sinalização em massa afogaria a equipe.
