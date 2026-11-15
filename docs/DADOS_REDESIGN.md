# Dados do redesign — tela × banco

Conferência do redesign (história [#367](https://github.com/ThiagoCarreiraVallim/fatia/issues/367),
issue [#370](https://github.com/ThiagoCarreiraVallim/fatia/issues/370)) contra o
`packages/db/prisma/schema.prisma`. Diz o que as telas novas usam e o banco ainda não tem, qual
issue cria cada tabela, quais estados do banco viram tela e onde cada linha do Mapa de telas foi
parar.

**Este documento não cria tabela.** Cada migração entra no PR da issue dona da linha, com as regras
da [§2](#2-dado-novo--issue). As pranchas citadas são as da página "Dados do app" do canvas
(`Dados-Visao`, `Dados-Lacunas`, `Dados-Estados`, `Dados-Conta`, `Dados-Alimentacao`,
`Dados-Treino`, `Dados-IA`, `Dados-Comunidade` e `Mapa`).

Decisões que nasceram desta conferência:

| ADR                                                                 | O que decide                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [040](./ADR/040-navegacao-com-aba-hoje-e-botao-da-ia.md) (revisada) | 5 abas com Você, botão da IA, painel dentro de Comunidade            |
| [041](./ADR/041-tema-claro.md)                                      | Tema claro, escolha Sistema/Escuro/Claro e contraste da cor da marca |
| [042](./ADR/042-agenda-da-comunidade.md)                            | Agenda da comunidade informativa, sem reserva, vaga ou presença      |
| [043](./ADR/043-papeis-da-equipe.md)                                | Papéis da equipe (com nutricionista) e consentimento por papel       |
| [044](./ADR/044-desafios-com-revisao.md)                            | Desafios com pontos e foto de check-in revisada só pela equipe       |
| [045](./ADR/045-plano-alimentar-autoral.md)                         | Plano alimentar autoral do profissional, sem sugestão da IA          |

## 1. O que o Fatia guarda

A prancha `Dados-Visao` agrupa o banco em nove grupos. Os modelos de cada um:

| Grupo                       | Modelos Prisma                                                                                                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Usuário                  | `User` (perfil do onboarding), `UserGoals`, `UserSubscription`                                                                                                                                              |
| 02 Metas                    | `UserGoals` (faixas do dia), `NutrientTarget`, `Goal`, `UserAchievement`                                                                                                                                    |
| 03 Alimentação              | `Food`, `FoodGroup`, `FoodPortion`, `FavoriteFood`, `Meal`, `MealItem`, `MealTemplate`, `MealTemplateItem`                                                                                                  |
| 04 Treino                   | `Exercise`, `WorkoutPlan`, `WorkoutPlanExercise`, `WorkoutSession`, `SessionSet`, `TrainingBlock`, `TrainingBlockWeek`                                                                                      |
| 05 Registros do corpo e dia | `WeightLog`, `StepLog`, `WaterLog`                                                                                                                                                                          |
| 06 Chat com IA              | `Conversation`, `Message`, `UserMemory`, `AiUsage`                                                                                                                                                          |
| 07 Comunidades              | `Group`, `GroupMembership`, `GroupInvite`, `ProfessionalLink`, `ProfessionalAccessLog`, `GroupSeat*`, `GroupPlanTemplate`, `GroupTip`, `GroupExerciseGuide*`, `GroupAgent`, `GroupChallenge*`, `GroupPost*` |
| 08 Notificações             | `NotificationPreference`, `PendingNotice`, `UserDevice`, `PushTicket`, `WebPushSubscription`, `InboxNotice`                                                                                                 |
| 09 Mídia                    | `MediaFile`                                                                                                                                                                                                 |

O que a equipe pode ver é o `ShareScope`: **5 categorias** (`WORKOUT`, `NUTRITION`, `BODY`,
`HABITS`, `GOALS`), mais uma **6ª, "Fotos das refeições"**, que é dado novo
([ADR 038](./ADR/038-foto-da-refeicao-guardada.md), migração em
[#374](https://github.com/ThiagoCarreiraVallim/fatia/issues/374)). A equipe só vê o que o membro
liberou, e toda leitura — inclusive a negada — vai para `ProfessionalAccessLog`
([`PERMISSIONS.md`](./PERMISSIONS.md)). A visão não é tela: é a referência deste índice.

## 2. Dado novo → issue

Igual à tabela da #370. A coluna "Migração em" diz qual PR cria a tabela ou a coluna.

| Dado novo                                       | Campos (resumo do canvas)                                                                                      | Issue                | Migração em                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------- | -------------------------------------------------------------- |
| Lembretes                                       | tipo, intervalo/horários, de/até, dias, ligado; silêncio noturno                                               | #389 (e #371 Onb-08) | #389                                                           |
| Hábitos                                         | hábito, frequência, check do dia, sequência, origem (seu/equipe)                                               | #390                 | #390                                                           |
| Check-in na academia (QR)                       | visita: comunidade, data e hora                                                                                | #390                 | #390                                                           |
| Avaliação física                                | data, quem fez, peso/altura, circunferências, dobras, bioimpedância, pressão, FC; pedido com prazo e repetição | #383                 | #383                                                           |
| Telefone para WhatsApp                          | número + permissão "equipe pode me chamar"; o Fatia não guarda conversas                                       | #387, #401, #402     | #387                                                           |
| Plano enviado ao aluno                          | quem enviou, versão, o que mudou, aceito/recusado                                                              | #379, #405           | #379                                                           |
| Plano alimentar do nutri                        | opções por refeição e escolha da semana                                                                        | #376, #407           | #376 — migrado (`20261115081152_nutrition_plan`, ADR 045)      |
| Foto da refeição                                | arquivo ligado à refeição, preferência "guardar fotos", categoria "Fotos das refeições"                        | #374, #385, #387     | #374                                                           |
| Cota diária da IA                               | uso do dia por pessoa (pode ficar só no servidor)                                                              | #385, #386           | **nenhuma** — derivada de `AiUsage` (abaixo)                   |
| Circuito                                        | formato (AMRAP, EMOM, Tabata, For Time), duração, trabalho/descanso, rounds, exercícios                        | #380                 | #380                                                           |
| Humor do treino (observação com atalhos)        | observação da sessão                                                                                           | #377                 | **nenhuma** — é `WorkoutSession.notes` (abaixo)                |
| Origem do alimento (selo)                       | TACO / código de barras / seu                                                                                  | #375                 | **nenhuma** — `Food.source` + selo da sessão (abaixo)          |
| Marca da comunidade                             | cor, capa, textos, página de boas-vindas                                                                       | #372, #410           | #372 (cor e capa), #410 (páginas)                              |
| Enquete, comunicado, "Para você"                | mural                                                                                                          | #394                 | #394                                                           |
| Desafio com check-in por foto, pontos e revisão | tipos, pontuação, revisão pela equipe                                                                          | #395                 | #395 ([ADR 044](./ADR/044-desafios-com-revisao.md))            |
| Agenda da comunidade                            | aulas e eventos, "Vou", sem reserva/vaga/presença                                                              | #397                 | #397 ([ADR 042](./ADR/042-agenda-da-comunidade.md))            |
| Questionários                                   | perguntas, envio, resposta, vencimento                                                                         | #391                 | #391                                                           |
| Programas, ofertas, parceiros, automações       | painel                                                                                                         | #403, #409, #393     | #403 (programas, ofertas), #393 (parceiros), #409 (automações) |
| Papéis da equipe (incl. nutricionista)          | permissões por papel                                                                                           | #404                 | #404 ([ADR 043](./ADR/043-papeis-da-equipe.md))                |

### Regra para toda migração desta tabela

Tabela ou coluna nova com dado de uma pessoa entra, **no mesmo PR da issue dona**:

1. no export LGPD — `AccountService.exportData` (montado pelo link de `POST /users/me/exports`, em
   `account.service.ts`) e a tool `export_my_data`;
2. na exclusão — `DELETE /users/me` (cascata a partir de `User` ou hook de exclusão, como o do
   Asaas) e a tool `delete_my_account`;
3. no `apps/api/src/common/__tests__/user-isolation.spec.ts`, contra Postgres real: o recurso de
   outra pessoa responde `NOT_FOUND`, igual a inexistente;
4. no [`DATA_RETENTION.md`](./DATA_RETENTION.md), com onde fica e por quanto tempo.

Id que vem no corpo da requisição (exercício do circuito, refeição da foto, hábito do check-in) é
amarrado ao dono ou ao pai da URL antes de gravar ([ADR 010](./ADR/010-row-level-security.md)).
Migração destrutiva exige ADR.

### As três linhas que não viram tabela

- **Cota diária da IA.** Já existe, derivada de `AiUsage`: a soma do dia (janela UTC) em
  `costMicros` contra `AI_QUOTA_DAILY_MICROS` (`apps/api/src/ai/ai-quota.ts`,
  `ai-usage.service.ts`), lida em `GET /chat/quota` (`spentMicros`, `limitMicros`, `usedRatio`,
  `resetsAt`, `allowed`). A cota é de **custo**, não de número de mensagens: a tela de limites da
  #385 e o bloco PRO da #386 mostram proporção ("80% do dia") e a hora de renovar, nunca "N
  mensagens restantes". Sem tabela nova.
- **Humor do treino.** "Como foi o treino?" grava em `WorkoutSession.notes`; os atalhos (emoji e
  frases) só preenchem o texto (#377). Sem coluna nova.
- **Origem do alimento.** O selo lê `Food.source` (`TACO`, `CUSTOM` = "seu"). O selo "código de
  barras" é só do resultado da sessão, que não é guardado; o alimento criado a partir do código ou da
  foto do rótulo nasce `CUSTOM` ([ADR 017](./ADR/017-open-food-facts-para-industrializado.md),
  nota do redesign). `USDA` continua no enum sem uso ([ADR 005](./ADR/005-taco-sem-usda-v1.md)).
  Guardar o selo exigiria migração e revisão da ADR 017.

### Telas sem prancha

As telas que o Mapa marca "a fazer" sem prancha ficam **fora da história 1**, em issues P2
(`priority: low`) próprias — ver [§6](#6-conferência-do-mapa).

## 3. Corrigido nas telas

Divergências que o canvas já corrigiu para seguir o banco (`Dados-Lacunas`). Não são trabalho de
schema; a issue da tela usa o campo indicado.

| O que a tela mostra           | Prancha / tela                     | Campo do banco                                                                      | Issue      |
| ----------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- | ---------- |
| Tipos de notificação          | Notificações, Onb-09               | `NotificationKind` (13 desde a #389, em três grupos; ADR 033) + `PendingNotice`     | #389, #371 |
| Categoria "metas"             | Onb-03, Equipe · O que você vê     | `ShareScope.GOALS` (5 categorias; a 6ª é dado novo)                                 | #371, #404 |
| Nível de atividade            | Onb-06 Rotina, Retomada            | `ActivityLevel` (5: SEDENTARY…VERY_ACTIVE)                                          | #371       |
| Nome do usuário               | Onb-01 Conta                       | `User.name`                                                                         | #371       |
| Origem dos passos             | Saúde do celular, Registrar passos | `StepSource` (8 valores) com selo no registro                                       | #371, #373 |
| Assinatura cancelada          | Meu plano: estados                 | `SubscriptionStatus` (5)                                                            | #386       |
| Objetivo expirado e arquivado | Metas pessoais                     | `GoalStatus` (4)                                                                    | #382       |
| Avaliação da resposta         | Ferramentas e confirmação          | `Message.review` (`like`/`dislike`), `reviewReasons`, `reviewNote`                  | #384       |
| Série de cardio               | Cardio                             | `SessionSet.durationSeconds`, `distanceMeters`, `avgHeartRate`, `kcalBurned`        | #377, #381 |
| Conquistas                    | Conquistas, Progresso              | `UserAchievement` (`key`, `unlockedAt`, `context`)                                  | #382       |
| Bloco de treino               | Periodização                       | `TrainingBlock` (`kind`, `weeksTotal`, `status`) + `TrainingBlockWeek`              | #379       |
| Origem do alimento            | Adicionar item                     | `Food.source` + selo de sessão para código de barras (§2)                           | #375       |
| Como foi o treino             | Fim do treino                      | `WorkoutSession.notes`                                                              | #377       |
| Favorito de exercício         | Como fazer                         | não existe: favorito só de alimento (`FavoriteFood`)                                | #378       |
| Tipo de comunidade            | Criar comunidade, Checklist        | `GroupType`, `GroupVisibility`, `JoinPolicy`, `PostPolicy`, `requiredSharingScopes` | #372       |

## 4. Estados que viram tela

Cada valor de status precisa de um jeito de aparecer (`Dados-Estados`). A issue dona tem o estado
nas caixas de escopo; o que faltava foi comentado nela.

| Grupo              | Valor do banco                                     | Na tela                                  | Issue dona                                      |
| ------------------ | -------------------------------------------------- | ---------------------------------------- | ----------------------------------------------- |
| Assinatura         | `SubscriptionStatus.PENDING`                       | "Aguardando pagamento" + abrir pagamento | #386 (app `(app)/plan`, web `(app)/plan`)       |
|                    | `ACTIVE`                                           | PRO com data de renovação                | #386                                            |
|                    | `PAST_DUE`                                         | banner da carência: "segue até…"         | #386                                            |
|                    | `CANCELED` (ou `cancelAtPeriodEnd`)                | "Acaba em 4 dez", sem cobrar de novo     | #386                                            |
|                    | `EXPIRED`                                          | volta ao Free, nada se perde             | #386                                            |
| Objetivo pessoal   | `GoalStatus.active`                                | barra de progresso                       | #382 (`(app)/goals`)                            |
|                    | `completed`                                        | selo e confete                           | #382                                            |
|                    | `expired`                                          | prazo passou: renovar ou arquivar        | #382                                            |
|                    | `archived`                                         | sai da lista, fica no histórico          | #382                                            |
| Membro             | `MembershipStatus.INVITED`                         | convite pendente                         | #401 (painel `org/[groupId]`)                   |
|                    | `ACTIVE`                                           | membro normal                            | #401                                            |
|                    | `LEFT`                                             | some da lista; dados param de ir         | #401                                            |
|                    | `REMOVED`                                          | removido pela equipe                     | #401                                            |
|                    | `BANNED`                                           | não volta pelo link                      | #401                                            |
| Fatura de assentos | `SeatInvoiceStatus.PENDING`                        | a vencer                                 | #403 (painel, Assentos)                         |
|                    | `PAID`                                             | recibo                                   | #403                                            |
|                    | `OVERDUE`                                          | aviso no topo do painel                  | #403                                            |
|                    | `VOID`                                             | riscada                                  | #403                                            |
| Bloco de treino    | `TrainingBlockStatus.active`                       | semana atual em destaque                 | #379                                            |
|                    | `completed`                                        | resumo do bloco                          | #379                                            |
|                    | `abandoned`                                        | oferece recomeçar                        | #379                                            |
| Desafio            | sem `endedEarlyAt`/`finalizedAt`, dentro da janela | placar ao vivo                           | #395                                            |
|                    | `GroupChallenge.endedEarlyAt` preenchido           | aviso: a equipe encerrou                 | #395                                            |
|                    | `finalizedAt` preenchido                           | pódio e medalhas                         | #395                                            |
| Mídia              | `MediaStatus.PENDING`                              | barra ou brilho sobre a imagem           | todo upload: #374, #385, #394, #395, #408, #410 |
|                    | `READY`                                            | imagem final                             | idem                                            |
| Post e denúncia    | `GroupPost.pinnedAt`                               | fica no topo                             | #394                                            |
|                    | `GroupPost.removedAt`                              | "Removido pela moderação"                | #394                                            |
|                    | `GroupPostReport` sem `resolvedAt`                 | vai para a fila                          | #394                                            |
|                    | `GroupPostReport.resolvedAt`                       | some da fila                             | #394                                            |

Os seis enums batem com o schema: `SubscriptionStatus` 5, `GoalStatus` 4, `MembershipStatus` 5,
`SeatInvoiceStatus` 4, `TrainingBlockStatus` 3, `MediaStatus` 2. Desafio e post/denúncia saem de
campos de data dos modelos, não de enum.

## 5. Detalhe por grupo

### Conta e metas (`Dados-Conta`)

- **`User`** e o perfil do onboarding: `name`, `sex` (`BiologicalSex`), `birthDate`, `heightCm`,
  `activityLevel` (`ActivityLevel`), `objective` (`BodyObjective`), `onboardedAt` — Onb 4–7 (#371),
  Perfil e Apagar conta (#387). A retomada (Onb-Retomada) guarda `onboardingStep` (a etapa em que a
  pessoa está) e `onboardingDraft` (as metas ainda não aceitas e a escolha app/equipe); o cartão
  "Primeiros passos" (Onb-11) usa `firstStepsSince` e `firstStepsDoneAt`, e o que está feito é
  lido dos dados (refeição, treino, comunidade, desafio), sem tabela própria (#371).
- **`UserSubscription`**: `tier` (`PlanTier`), `interval` (`BillingInterval`), `source`
  (`SubscriptionSource`: `ASAAS` na web, `APPLE`, `GOOGLE`, `MANUAL`), `status`
  (`SubscriptionStatus`), `currentPeriodEnd`, `graceEndsAt`, `cancelAtPeriodEnd`, `paymentUrl` —
  Meu plano, teste e PRO pela comunidade (#386). O "teste grátis" não é um status: a #386 decide se
  ele é uma assinatura `ACTIVE` com período curto ou outra origem ([`BILLING.md`](./BILLING.md)).
- **`UserGoals`** em faixas (kcal e macros min/máx, treinos por semana, passos, água) — Hoje e
  Metas do dia (#373, #376). **`NutrientTarget`** — Nutrientes (#376). **`Goal`** (`GoalKind`,
  `GoalStatus`) e **`UserAchievement`** — Metas pessoais e Conquistas (#382).

### Alimentação e registros (`Dados-Alimentacao`)

- **`Food`** com `source` (`FoodSource`: `TACO`, `USDA`, `CUSTOM`). O canvas mostra TACO / código
  de barras / seu: ver §2. **`FoodPortion`** (medidas caseiras), **`FavoriteFood`** — #375.
- **`Meal`** e **`MealItem`** (com `nutrients`, `portionLabel`, `portionQuantity`) — #374. A foto
  opcional é `MediaFile` ligado à refeição (dado novo, #374, ADR 038).
- **`MealTemplate`** (refeição salva; `fromTemplateId` quando veio de plano da comunidade) — #374,
  #396.
- **`WeightLog`**, **`StepLog`** (`StepSource` com 8 valores; no dia, vale o maior registro) e
  **`WaterLog`** — #373.

### Treino (`Dados-Treino`)

- **`Exercise`**: origem catálogo (`createdByUserId` nulo), da pessoa, cópia (`clonedFromId`) ou da
  comunidade (`groupOwned`, `groupId`) — #378, #396.
- **`WorkoutPlan`** / **`WorkoutPlanExercise`** — #378. **`WorkoutSession`**: `notes` = "Como foi o
  treino?", `exerciseOrder` e `removedExerciseIds` — #377, #381.
- **`SessionSet`**: `rpe` de 6 a 10 (o emoji é só da tela), cardio com `durationSeconds`,
  `distanceMeters`, `avgHeartRate`, `kcalBurned` — #377.
- **Circuito** é dado novo, sem tabela aqui (#380).
- **`TrainingBlock`** / **`TrainingBlockWeek`** ([ADR 019](./ADR/019-periodizacao-intencao-materializada-andamento-derivado.md)) — #379.

### IA, avisos e mídia (`Dados-IA`)

- **`Conversation`** (geral ou do agente da comunidade, `agentGroupId`), **`Message`** (`tools` →
  chips e cartões; `review`, `reviewReasons`, `reviewNote`), **`UserMemory`** — #384, #385.
- **`NotificationPreference`** (`NotificationKind`) e **`PendingNotice`** (aviso agrupado) — #389.
- **`Reminder`** (`ReminderKind`, `ReminderMode`) e o silêncio noturno em `User` — entregues na
  #389; o lembrete de hábito espera a #390.
- **`InboxNotice`** — a central de avisos do sino no Hoje (#373): cada aviso enviado, com `readAt`.
- **`MediaFile`** (`MediaKind`, `bytes`, `width`, `height`, `MediaStatus`).
- Foto: **só a foto que vira refeição é guardada, com consentimento** (ADR 038). Foto de rótulo,
  foto de pergunta e áudio do ditado são descartados ([ADR 020](./ADR/020-foto-e-audio-trafegam-sem-persistencia.md)).
  Foto de desafio é outra regra ([ADR 044](./ADR/044-desafios-com-revisao.md)).

### Comunidade (`Dados-Comunidade`)

- **`Group`**: `type` (`GroupType` SPONSORED/SOCIAL), `visibility`, `joinPolicy`, `postPolicy`,
  equipamentos, `requiredSharingScopes` — #372, #393.
- **`GroupMembership`**: `role` (`GroupRole` OWNER/PROFESSIONAL/CREATOR/MEMBER), `status`
  (`MembershipStatus`, 5), `consentScopes`, `statsOptIn`, `displayName` — #401.
- **`ShareScope`** com 5 valores (a nota "o guia fala em 4" do canvas já foi corrigida).
- **`GroupInvite`** — #401, #416. **`ProfessionalLink`** + **`ProfessionalAccessLog`** (inclui as
  leituras negadas, `denied`) — #402, #404.
- **`GroupSeatPool`**, **`GroupSeatAssignment`**, **`GroupSeatInvoice`**, **`GroupSeatAdjustment`** —
  #403.
- **`GroupPlanTemplate`**, **`GroupTip`**, **`GroupExerciseGuide`** (+ `Photo`), **`GroupAgent`** —
  #396, #405, #408, #411.
- **`GroupChallenge`** / **`GroupChallengeParticipant`** (`ChallengeMetric`, 7 valores). O "nunca
  peso ou foto" do canvas é revisto pela [ADR 044](./ADR/044-desafios-com-revisao.md) só no ponto
  foto: foto é prova de check-in revisada pela equipe, nunca no ranking — #395.
- **`GroupPost`**, **`GroupPostImage`**, **`GroupPostReaction`**, **`GroupPostComment`**,
  **`GroupPostReport`** (`ReportReason`, 5) — #394.
- Papéis novos (nutricionista) — [ADR 043](./ADR/043-papeis-da-equipe.md), #404.

## 6. Conferência do Mapa

### a) Toda prancha tem exatamente uma dona

Método: as pranchas são as chaves de `boards` no `canvas.json` do canvas (341). A dona é a issue
que lista a prancha na primeira coluna da tabela "Pranchas do canvas", entre #367 e #418. Prancha
citada em prosa (dependência, sobra) não conta.

```bash
node scripts/check-canvas-map.mjs <caminho>/.canvas/project/canvas.json 367 418
```

Resultado em 2026-11-14: **341 pranchas, 341 com exatamente uma dona, 0 sem dona, 0 com duas, 0
citadas numa issue e ausentes do canvas.** O script sai com código 1 se isso mudar; rodar de novo
antes do merge da história.

### b) Linhas "a fazer", "a integrar" e "parcial"

Placar do Mapa: 37 de 45 telas P0 e 84 de 117 linhas desenhadas. Destino de cada linha que não
está "feito":

| Linha                                                                                                  | Estado no Mapa | Destino                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.16 Privacidade e Termos                                                                              | a fazer        | issue P2 nova [#420](https://github.com/ThiagoCarreiraVallim/fatia/issues/420), fora da história 1                                                   |
| 2.28 Receitas                                                                                          | a fazer        | [#334](https://github.com/ThiagoCarreiraVallim/fatia/issues/334) (`discussion`, aguarda ADR)                                                         |
| 2.29 Fotos de progresso                                                                                | a fazer        | [#300](https://github.com/ThiagoCarreiraVallim/fatia/issues/300) (`discussion`, aguarda ADR)                                                         |
| 2.33 Lista de compras                                                                                  | a fazer        | [#335](https://github.com/ThiagoCarreiraVallim/fatia/issues/335) (já P2, aberta)                                                                     |
| 2.34–2.40 (saciedade, micronutrientes, widgets, convide amigos, cancelar PRO, Strava/Garmin, importar) | a fazer        | fora da história 1, sem issue nova nesta conferência                                                                                                 |
| 3.8 Desafio por times                                                                                  | a fazer        | [#329](https://github.com/ThiagoCarreiraVallim/fatia/issues/329) (já P2, aberta)                                                                     |
| 3.9 Consentimento por papel                                                                            | parcial        | #404 e #372, [ADR 043](./ADR/043-papeis-da-equipe.md)                                                                                                |
| 4.6 Alunos em risco                                                                                    | a integrar     | #399                                                                                                                                                 |
| 4.7 Marca                                                                                              | a integrar     | #372 e #410, [ADR 041](./ADR/041-tema-claro.md) (contraste)                                                                                          |
| 4.8 Comunicados                                                                                        | a integrar     | #394 e #398                                                                                                                                          |
| 4.10 Indicações                                                                                        | a integrar     | #400 (Origens)                                                                                                                                       |
| 4.11 Modo da comunidade                                                                                | a integrar     | #372 e #413                                                                                                                                          |
| 4.15 IA Lite × PRO                                                                                     | parcial        | #403                                                                                                                                                 |
| 4.24 Desafio aberto + interessados                                                                     | a fazer        | [#318](https://github.com/ThiagoCarreiraVallim/fatia/issues/318)                                                                                     |
| 4.32 Tarefas                                                                                           | a fazer        | [#311](https://github.com/ThiagoCarreiraVallim/fatia/issues/311) (já P2, aberta)                                                                     |
| 4.34 Papel nutricionista                                                                               | a fazer        | #404, ADR 043                                                                                                                                        |
| 4.35 Integração academia, 4.36 Rede                                                                    | a fazer        | fora da história 1                                                                                                                                   |
| 4.39 Plano do profissional                                                                             | a fazer        | [#296](https://github.com/ThiagoCarreiraVallim/fatia/issues/296) (`discussion`)                                                                      |
| 5.9 Checkout de oferta                                                                                 | parcial        | issue P2 nova [#421](https://github.com/ThiagoCarreiraVallim/fatia/issues/421); a caixa "checkout público por link" da #403 passa a apontar para ela |
| 5.11–5.13 (página de alimento, calculadoras, diretório)                                                | a fazer        | fora da história 1                                                                                                                                   |
| 6.7 E-mail resumo semanal                                                                              | a fazer        | #390 e #418                                                                                                                                          |
| 6.8 E-mail comunicado                                                                                  | a fazer        | #394                                                                                                                                                 |
| 6.9 E-mail compra                                                                                      | a fazer        | #403                                                                                                                                                 |
| 6.10 Widgets                                                                                           | a fazer        | fora da história 1                                                                                                                                   |

As linhas 2.22, 2.23 e 4.21 (mensagens) estão "removido" no Mapa: o contato com a equipe é o link
do WhatsApp, e o Fatia não guarda a conversa (§2, telefone).

### c) Decisões 0.x do Mapa

- **Tema:** escuro padrão, paleta clara pronta → [ADR 041](./ADR/041-tema-claro.md) (o claro entra
  funcional, seguindo o sistema).
- **Barra:** Hoje · Nutrição · Treino · Comunidade · Você e o botão redondo da IA à direita; some
  nas tarefas de foco; Você é uma tela só, com seções → revisão da
  [ADR 040](./ADR/040-navegacao-com-aba-hoje-e-botao-da-ia.md).
- **Equipe:** mesma barra; o painel fica dentro da aba Comunidade ("Mural | Painel") → ADR 040.
- As pranchas de agenda (`Pn-39*`, `Pn-M5`, `Cm-23*`, `Cm-24*`, `Al-H1b`) são da #397 →
  [ADR 042](./ADR/042-agenda-da-comunidade.md).
