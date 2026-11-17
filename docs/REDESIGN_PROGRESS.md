# Acompanhamento do redesign (#367)

Onde está cada sub-issue da história #367: o canvas inteiro, com app, web, painel e site. O arquivo é atualizado a cada issue, para que qualquer sessão saiba onde parou.

**Processo.** O trabalho segue issue por issue, em grupos (etapas):

- Entre uma issue e outra: validação, PR com CI verde e merge automático no `main`.
- No fim de cada grupo: o dono testa o app (Expo Go), o PWA e o painel antes de começar o grupo seguinte.
- Como validar: lint, typecheck e testes; prova de vermelho nos testes novos; capturas da web (Playwright) e do app (emulador) contra a prancha do canvas, incluindo o comportamento descrito no script `x-dc` de cada prancha.

Para ler as pranchas: a cópia local fica em `.canvas/project/<Prancha>.dc.html`, fora do git. O canvas original é o artifact `GvL8GtYkJGjK5e4YovhZ3o`.

**Estados:** `a fazer` · `em andamento` · `validado` · `mergeado` · `testado` (pelo dono).

## Etapa 1: Base (`mergeado`, PR #422)

| Issue | Título                                              | Estado   | Observações                                                                                     |
| ----- | --------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| #368  | Design system: fundamentos, componentes e movimento | mergeado | `@fatia/design` (tokens, contraste, cor de marca)                                               |
| #369  | Navegação: 5 abas, botão da IA e menu               | mergeado | Menu da IA: a tela encolhe até virar notch (Al-H6c5). No app não há "Ver o PRO" (regra da loja) |
| #370  | Dados do redesign × banco, estados e ADRs           | mergeado | `docs/DADOS_REDESIGN.md`                                                                        |

## Etapa 2: Onboarding, Hoje e Você (`mergeado`, PR #424; correções #425)

| Issue | Título                           | Estado   | Superfícies                                       |
| ----- | -------------------------------- | -------- | ------------------------------------------------- |
| #387  | Você e conta                     | mergeado | api, web, app; `fat.ia.br/apagar-conta` no site   |
| #373  | Hoje: resumo, metas, água e peso | mergeado | api, web, app                                     |
| #389  | Lembretes e notificações         | mergeado | api, web, app, MCP                                |
| #371  | Onboarding do aluno              | mergeado | api, web, app; conectores Google e Apple no Logto |

Pendências da etapa 2: cada uma depende de outra issue ou de algo externo.

- **Credenciais:** faltam o cliente OAuth do Google e, da Apple, Service ID, Team ID, Key ID e a chave `.p8`. Depois disso, rodar `pnpm logto:bootstrap`. Sem as credenciais, os botões Google e Apple caem na tela do Logto.
- **Hoje:**
  - "Para fazer", "Novo treino da Helena" e o cartão de evento têm contrato pronto (`today-contracts.ts`), mas a lista volta vazia. Ela é preenchida por #379, #383, #391 e #397.
  - O cartão Hábitos 3/5 depende de #390.
- **Você:** a tela não mostra as linhas que pertencem a issues futuras: Sua semana (#382), Avaliações (#383), Conquistas, IA (#385), Hábitos (#390) e Saúde do celular. Elas estão registradas em `navigation.ts` e na ADR 040.
- **Ajuda:** os tutoriais são só texto. Vídeos e o site de ajuda ficam com #415.
- **Lembretes:**
  - O lembrete de hábito (Al-V3c) depende de #390. `ReminderKind.HABIT` existe, mas a API recusa esse tipo por enquanto.
  - Os tipos de aviso novos (plano recebido, avaliação, questionário, comunicados, agenda, aniversário) já têm a chave na tela, mas ainda nada os envia. Cada emissor vem com a sua issue.
- **Onboarding:**
  - Onb-02b fica com #410, e Cm-04-Sobre com #393 (hoje o código entra com consentimento inline).
  - Onb-P1, saúde do celular, precisa de um dev build com Health Connect e HealthKit. A etapa aparece sozinha quando a integração estiver disponível.
  - Na web, o QR da recepção não é lido: só dá para digitar o código.
  - O teste grátis pela web leva a `/plan` (#386).
  - A categoria "Fotos das refeições" da Onb-03 entrou no enum `ShareScope` com a #374 (`MEAL_PHOTOS`).
- **Revisão de segurança (etapa 2):** sem bloqueante.
  - Corrigido:
    - o token do link de exportação não aparece mais no log nem no span;
    - o limite de baixas conta por link (antes contava por IP);
    - o link dura só mais 15 min depois da primeira baixa;
    - os tutoriais vistos têm limite de linhas.
  - Em aberto:
    - limitar as fotos de perfil pendentes por pessoa (upload `user_avatar`);
    - o job de lembretes varre todos os lembretes a cada minuto (filtrar por próximo envio);
    - conferir que o conector Google do Logto descarta e-mail com `email_verified=false` antes de ligar o vínculo automático de contas.
- **Decisão "segue o canvas":**
  - Em Unidades, só carga e distância: peso fica em kg e estatura em cm.
  - Em Lembretes, a tela tem só a chave do silêncio noturno. A API já aceita mudar o horário.

## Etapa 3: Nutrição (`mergeado`, aguardando teste do dono)

| Issue | Título                              | Estado          | Superfícies                                          |
| ----- | ----------------------------------- | --------------- | ---------------------------------------------------- |
| #374  | O dia, a refeição e a foto guardada | mergeado (#427) | api, db, MCP, api-client, web, app                   |
| #375  | Adicionar comida                    | mergeado (#429) | api, db, MCP (2 tools), agente, api-client, web, app |
| #376  | Metas, nutrientes e plano alimentar | mergeado (#428) | api, db, MCP (5 tools), api-client, web, app         |

Validação da etapa: revisão adversarial em cada PR (defeitos achados e corrigidos antes do merge: refeição perdida quando a foto expirava, "comi isso" duplicado, aviso de troca falso, leitura de rótulo derrubada por um campo, chave de nutriente livre, UPC-A × EAN-13); capturas em `e2e/tests/etapa03-telas.spec.ts` (`UI_STAGE=etapa-03`, 15 de 15, axe sem grave).

Pendências da #374 (branch `redesign/374-nutricao-dia-refeicao`):

- **Plano alimentar:** o cartão do lanche do plano ("Comi isso" / "Trocar") tem só o contrato (`PlannedMealSuggestion`, `PlannedMealSlot`); sem plano não desenha nada. Quem preenche é a #376.
- **Foto:** só refeição nova recebe a foto; somar itens por foto a uma refeição que já existe descarta a imagem. A foto do chat fica com a #385. O PWA não tem câmera de refeição: a pergunta "Guardar as fotos das refeições?" está no app, e a preferência fica em Você nos dois.
- **Trocar tipo e hora da refeição** (o lápis e o relógio do Al-N8) e a estrela de favorito do Al-N14 ficam para a #375/#376. O "+ Nutriente" leva às metas de nutrientes até a Al-N7 (#376).
- **Removidos:** anel de calorias, bento de macros, card de metas de nutrientes, timeline e drawer de ações da refeição (web e app), trocados pelas telas novas.
- **Foto em refeição existente:** foto tirada para adicionar itens a uma refeição existente não é ligada (o app não manda `photoFileId`; a limpeza a apaga).
- **Capturas** (Playwright e emulador) contra as pranchas: não feitas nesta sessão.

Pendências da #375 (branch `redesign/375-busca-quantidade-alimentos`):

- **Fora desta issue (ficam com a #374):** trocar tipo e hora da refeição (lápis e relógio do Al-N8) e a estrela de favorito do Al-N14.
- **Benchmark do rótulo:** os casos (`apps/agent/src/fatia_agent/eval/label_cases.py`) e o manifesto de exemplo estão prontos; falta rodar contra fotos reais de rótulo, que não vão ao repositório.
- **Desvio do canvas:** porção, macros e micronutrientes digitáveis (vírgula decimal, teclado numérico) em vez de "−/+"; o vínculo ao código é caixa explícita, desmarcada no cadastro à mão e marcada quando o cadastro vem de um código lido; guardar o produto lido em Meus alimentos já liga o código.
- **Sem "Lidos" (ADR 017):** a aba e o item "lido no código" não existem; o produto do Open Food Facts não é guardado.
- **Capturas** (Playwright e emulador) contra as pranchas e o teste da aba Rótulo no Expo Go: não feitos nesta sessão.

Pendências da #376:

- **Editor e envio:** o plano entra por `NutritionPlanService.send` (seed do demo). O editor da equipe é a #407; o envio e a notificação `PLAN_RECEIVED` ficam com a #405.
- **#374:** o "comi isso" e a troca gravam `MealItem.source = PLAN`. O cartão do plano no dia (`PlannedMealSuggestion`) segue só com contrato: preencher é tocar a tela do dia, fora desta issue.
- **Agregados:** nenhum agregado da equipe sobre planos ainda; quando vier, `MIN_CELL` 5.
- **Desvio do canvas:** metas e nutrientes são digitáveis em vez de "−/+"; o aviso da troca usa o nome sem artigo ("Helena vê no seu diário").

## Etapa 4: Treino A (`mergeado`, PRs #431, #433 e #434; aguardando teste do dono)

| Issue | Título                                     | Estado   | Superfícies                                        |
| ----- | ------------------------------------------ | -------- | -------------------------------------------------- |
| #377  | Início, sessão em andamento e treino feito | mergeado | api, db, MCP (1 tool), api-client, web, app        |
| #378  | Planos, adicionar e configurar exercício   | mergeado | api, db, MCP (1 tool nova), api-client, web, app   |
| #379  | Plano recebido, modelos, bloco e agenda    | mergeado | api, db, MCP (5 tools novas), api-client, web, app |

Pendências da #377 (branch `redesign/377-treino-sessao`, migration `20261116000000_workout_feeling_and_checkin`):

- **Sensação:** a escala de 5 (😎 Leve a 🥵 No limite) grava `SessionSet.rpe` 6–10 por série e `WorkoutSession.feeling` 1–5 no fim. A sensação por exercício é derivada da última série, sem tabela própria.
- **Perguntas pós-treino (T5b):** conjunto fixo (cansaço e dor), mostrado só a quem compartilha o treino com a equipe. A equipe lê pela leitura de treino já registrada no `ProfessionalAccessLog`. As perguntas editáveis ficam com a #391. Ainda falta o alerta de dor para a equipe.
- **Fora desta issue:** a estrela de favorito do T9 e as telas de plano e adicionar exercício ficam com a #378. O aviso de plano recebido fica com a #379 (só o ponto de extensão). Circuito e Modelos ficam com a #380 e a #379. O check-in de desafio também ficou de fora.
- **Desvios do canvas:**
  - Carga e repetições são digitáveis (vírgula decimal), além do −/+.
  - A observação entra no treino feito (T5), não no fim do treino.
  - No app, o vídeo abre no navegador do app; na web, toca na página.
  - O reordenar fica no Treino atual (T17), com setas, nos dois.
  - "+ Série" sem série para copiar leva à sessão; a API recusa série sem repetições, tempo nem distância.
  - Carga, volume e máximo estimado saem na unidade da pessoa (kg ou lb); carga 0 é peso do corpo e não vira recorde.
  - O T9 não tem "Erros comuns".
- **Concorrência:** a série é idempotente pela `clientKey`. Duas séries com chaves diferentes enviadas ao mesmo tempo ainda podem repetir o `setNumber`.
- **Capturas** (Playwright e emulador) contra as pranchas: não feitas nesta sessão.

Pendências da #378 (branch `redesign/378-planos-exercicio`):

- **Variante do Configurar:** a issue deixou em aberto. Entrou a A (Al-T21) como padrão, a tabela da B (Al-T21b) atrás de "Configurar série por série" e a D (Al-T21d) para cardio. A C (compacta) não entrou.
- **Desvios do canvas:** números digitáveis (vírgula, teclado numérico) além do −/+; o tipo de carga é "unidade da pessoa × peso do corpo" (sem kg/lb lado a lado); "Início/Fim" do cardio é a ordem na lista; distância só em km; "Salvar alterações" do Al-T7 virou o check de concluir, porque cada mudança já grava; o Novo plano não configura antes de criar (o Configurar fica no plano criado); remover exercício e excluir plano perguntam antes.
- **Para a #377:** a sessão e o plano expõem `restSeconds`, `technique`, `biSetWithNext`, `startLoadKg`, `loadMode`, `repUnit`, `notes`, `cardio*`, `sets` e `planExerciseId` em `PlannedExercise`. Exercício repetido no plano segue bloqueado (409 "Esse exercício já está no plano"; o lote pula o que já está), porque a sessão agrupa séries, ordem e remoção por `exerciseId`.
- **Para a #379:** o snapshot v1 leva a configuração nova. Não há regra de plano recebido só leitura (ADR 014: o plano adotado é da pessoa).
- **Exercício repetido no plano:** pendente para outra issue. Exige a sessão (`session-view`, `use-session-layout`, `removedExerciseIds`) passar a agrupar por `planExerciseId`.
- **Fora desta issue:** aba Circuitos do Al-T6 (#380); "Modelos das comunidades" e "Começar de um modelo" levam à lista de comunidades até a #379 dar a tela própria.
- **Capturas** contra as pranchas: feitas na web e no app, com as telas T6, T7, T7 editando, T8, T8b, T19, T21, T21b e T21d. Ainda diferente da prancha:
  - o título é "Planos de treino", porque a aba Circuitos ainda não existe;
  - o card de plano recebido virou o card do bloco ativo;
  - cada exercício tem setas para subir e para descer;
  - o descanso também aceita segundos digitados;
  - o T8 mantém "Na minha academia";
  - o T8 e o T21 abrem no app como folhas a 85% da tela, como as outras do app, e não em tela cheia;
  - a imagem do exercício é um placeholder.

## Etapa 5: Treino B e Progresso (em andamento)

| Issue | Título                   | Estado           | Superfícies                                  |
| ----- | ------------------------ | ---------------- | -------------------------------------------- |
| #381  | Treino livre e histórico | pronto na branch | api, MCP (1 tool nova), api-client, web, app |

Pendências da #381 (branch `redesign/381-treino-livre-historico`, sem migration):

- **Tipo da sessão é derivado, não gravado:** `plan` com `planId`, `free` sem. `circuit` é o ponto de extensão da #380 (`helpers/session-kind.ts`, `HISTORY_FILTERS`, `sessionHero` e o detalhe `history/[id]`): nenhuma sessão é circuito ainda, e a aba "Circuitos" do Al-T10 e a tela Al-T11c entram com a #380. Plano apagado deixa a sessão sem `planId`, e ela passa a aparecer como livre.
- **Rotas e MCP:** `GET /workout/history` (totais, filtro `kind`, cursor), `GET /workout/sessions?kind=`, `POST /workout/sessions/:id/plan`; o resumo da sessão ganhou `kind`, as séries de cada exercício, kcal e o recorde de antes. MCP `save_session_as_plan` (152 tools) e `list_workout_sessions` com `kind` e sensação.
- **Treino livre (Al-T17b):** monta antes de começar; a sessão só nasce no "Iniciar treino". Os escolhidos sem série ficam só no cliente (o cache `pending` da sessão), como na #377: fechar o app antes da primeira série os perde.
- **Recorde de distância do cardio:** passou a somar as séries da sessão (como o resumo já fazia), em vez da maior série. Pode conflitar com a #382 (progresso), que lê os mesmos recordes.
- **Desvios do canvas:** o detalhe tem "Corrigir séries deste treino" (leva à sessão), porque a tela antiga de sessão concluída era o único lugar de corrigir; cartão de cardio e selo de recorde usam `text-background` para contrastar nos dois temas.
- **Ainda não conferido:** capturas contra as pranchas (o dono faz a passada visual).

| Issue | Título    | Estado       | Superfícies                                                   |
| ----- | --------- | ------------ | ------------------------------------------------------------- |
| #380  | Circuitos | em andamento | api, db, MCP (1 tool nova e 1 ampliada), api-client, web, app |

Pendências da #380 (branch `redesign/380-circuitos`, migration `20261116053800_workout_circuits`):

- **Modelo:** circuito é um `WorkoutPlan` com `kind = CIRCUIT` e um `CircuitConfig` 1:1 (formato e só os campos dele). Os itens são `WorkoutPlanExercise` com `repUnit` (reps ou segundos) e `targetReps` numérico. A sessão congela o circuito em `WorkoutSession.circuit` (JSON v1: definição, `startedAt`, toques com horário, resultado e a última vez).
- **Relógio:** funções puras em `packages/api-client/src/workout/circuit-timer.ts`, por horário (nunca por tique). Cada toque vai para `PUT /workout/sessions/:id/circuit`, e outra aba ou o app retomam do mesmo ponto. "Encerrar" (`POST .../circuit/finish`) é idempotente; o servidor confere o resultado contra o circuito e cria uma `SessionSet` por exercício por round, minuto ou intervalo.
- **MCP:** `create_workout_plan` aceita `circuit` e `exercises` com `reps` ou `seconds`; `log_circuit_result` (nova) registra um circuito feito, fechando a sessão aberta ou criando uma terminada. Não há `update_circuit`: editar é pela tela.
- **Para a #381 (Al-T11c):** `GET /workout/sessions/:id/summary` traz `circuit` (`CircuitSummaryView`: rounds, parcial, tempo de cada round, média, tempo final, intervalos, total de reps, total por exercício, a última vez e a comparação). Os blocos prontos são `CircuitResultBlocks` (web e app).
- **Desvios do canvas:**
  - Números do Novo circuito digitáveis, além do −/+.
  - "Encerrar" pede confirmação.
  - O card da aba Circuitos abre o editor (o "Começar" leva ao relógio). O "Circuito" do Treino leva à aba Circuitos quando já há circuito, e ao Novo circuito quando não há.
  - Tocar num exercício adiante no AMRAP/For Time marca também os anteriores do round.
  - O For Time tem "Pular descanso" no descanso entre rounds (a prancha não desenha esse estado).
  - O AMRAP terminado pelo tempo mostra o fim no desenho do Al-T4e ("rounds + exercícios").
- **Contas escolhidas:** o Tabata conta o último descanso no total (8 × 20/10 = 4 min, como a prancha); pular fase conta a fase como feita; a série do Tabata grava os segundos de trabalho; `targetReps` em faixa vira o maior número.
- **Ainda não conferido:** capturas contra as pranchas (o dono faz a passada visual); som e avisos no aparelho (no Expo Go do Android não há avisos do sistema: o relógio só apita com a tela acesa).

## Etapas seguintes

| Etapa                                   | Issues                                                                                                                                     | Estado       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 3 · Nutrição                            | #374 o dia, a refeição e a foto · #375 adicionar comida · #376 metas, nutrientes e plano alimentar                                         | em andamento |
| 4 · Treino A                            | #377 início, sessão e treino feito · #378 planos e exercício · #379 plano recebido, modelos, bloco e agenda                                | mergeado     |
| 5 · Treino B e Progresso                | #380 circuitos · #381 treino livre e histórico · #382 progresso                                                                            | em andamento |
| 6 · IA, plano e MCP                     | #384 chat · #385 foto do prato, configurações e memórias · #386 plano e assinatura · #388 conectar sua IA                                  | a fazer      |
| 7 · Comunidade no app                   | #393 comunidades e código · #394 mural · #395 desafios · #396 conteúdo da equipe                                                           | a fazer      |
| 8 · Painel base                         | #398 layout e ⌘K · #399 para revisar · #400 relatório · #401 membros · #402 ficha                                                          | a fazer      |
| 9 · Painel: conta e conteúdo            | #403 assentos e faturas · #404 equipe · #405 biblioteca · #406 editor de treino · #407 editor de alimentação · #408 dicas e catálogo       | a fazer      |
| 10 · Painel: IA, configuração e celular | #409 automações · #410 boas-vindas · #411 assistente · #412 demo · #413 configurações · #414 painel no celular · #372 onboarding da equipe | a fazer      |
| 11 · Aluno e equipe                     | #383 avaliação · #390 semana, hábitos e QR · #391 questionários · #392 cards · #397 agenda                                                 | a fazer      |
| 12 · Site e fora de tela                | #415 site · #416 página pública e convite · #417 e-mail e lojas                                                                            | a fazer      |

A #418 ("Sobras das issues absorvidas") é revisada no fim da história.

## Regras de usabilidade e reaproveitamento

- **O canvas é base de design, não a fonte de verdade.** Interação, formulários e botões seguem a usabilidade. Por exemplo, altura e peso são digitáveis, além do − e do +.
- **A figura humana com músculos usa sempre o SVG anatômico completo:** o `MuscleDiagram` da explicação do exercício, em web e app. A silhueta simplificada (`cards/body-silhouette.tsx`) foi apagada na #377: "Seus músculos hoje", "Músculos de hoje" e a aba Músculos do exercício usam o `MuscleDiagram`, que ganhou cores por músculo.

- **Toda tela só fica pronta depois do print lado a lado com a prancha** (web e app), como manda `docs/VISUAL_CHECK.md`. As ferramentas são `scripts/render-board.mjs`, `scripts/shot-web.mjs` e `scripts/emu-shot.sh`. Em toda tela, confira:
  - a estrutura: header, botões do topo, cards e ordem;
  - que o menu e o botão da IA nunca ficam sobre botões de modal;
  - que não há texto preto no tema escuro.

Pendências da #379 (branch `redesign/379-plano-recebido-agenda`, migration `20261116020000_plan_offers_and_agenda`):

- **Plano recebido:** `PlanOffer` com versões (`PlanOfferVersion`). A equipe manda e atualiza por `POST /professional/students/:membershipId/plan-offers[/:offerId/versions]`, só com `ProfessionalLink` ativo. O aluno aceita, recusa e desfaz em `/plan-offers`. Recusar não mexe no vínculo nem nos consentimentos. O aceite copia pelo `PlanMaterializerService` (ADR 014); a atualização aceita reescreve os exercícios do mesmo plano.
- **Avisos:** envio e atualização vão ao aluno (`PLAN_RECEIVED`); aceite, recusa e "manteve a versão atual" vão a quem mandou (`COMMUNITY`).
- **Agenda:** `PlannedSession` nasce só do aceite de plano de calendário. "Feito" e "não feito" são lidos do treino concluído, nunca gravados.
- **Modelos:** `GET /groups/templates` agrupa por comunidade os planos publicados; adotar segue o fluxo da comunidade.
- **MCP:** `list_plan_offers`, `accept_plan_offer`, `decline_plan_offer`, `list_planned_sessions`, `reschedule_planned_session`; `create_training_block` aceita `weeks` 3–6. A administração da equipe fica fora do MCP.
- **Ainda não conferido:** capturas contra as pranchas (o dono faz a passada visual); a tela da equipe para mandar o plano (só o endpoint mínimo).

## Decisões do dono

- **Etapa 1:**
  - O canvas vence `docs/DESIGN.md`: Sora/Manrope e proteína `#6EA3FF`.
  - Tema claro só como tokens.
  - 5 abas, com a ADR 040 emendada.
- **Etapa 2:**
  - O preço do PRO vem do plano real (loja ou banco), nunca fixo.
  - Login com Google e Apple juntos.
  - Onde a issue diverge da prancha, **segue o canvas**.
  - Apagar conta pela web: página simples no estilo Al-V8.
- **Etapa 4 (#379):**
  - Calendário × flexível: a oferta tem `schedule`. Aceitar plano de calendário gera as sessões da agenda; o flexível não gera linha, e o app só calcula a próxima sessão.
  - "O que mudou": diff por exercício entre o snapshot aceito e o novo (novo, removido, alterado em séries, repetições e descanso). A pessoa aceita a atualização ou mantém a versão atual; nada muda sem aceite.
  - Bloco de semanas: de 3 a 6, com os focos de hoje. A última é deload; o meio é acúmulo e depois pico (3: acúmulo, pico, deload; 6: acúmulo ×3, pico ×2, deload). Os blocos de 4 semanas não mudam; seguem as regras da ADR 019, inclusive o deload por sinal.
  - "Remarcar" na agenda: qualquer dia de hoje até o fim do plano, nunca depois. Só informativo, sem presença nem reserva.
- **Etapa 5 (#381):**
  - Cardio é o exercício com `muscleGroup` cardio (a regra que já existia), sem campo novo. Cardio é exercício, não tipo de treino.
  - "Salvar como plano" de uma sessão com cardio grava a distância e o tempo feitos como a meta de cardio do exercício do plano (a configuração da #378).
- **Etapa 5 (#380):**
  - Só AMRAP, EMOM, Tabata e For Time. Superset e giant set, e carga em % de 1RM, ficam para depois; a faixa de repetições (mín–máx) já existe desde a #378.
  - EMOM e Tabata dividem a mesma tela de intervalos (Al-T4b e Al-T4d).
  - O Al-T4e é um estado da tela do For Time (Al-T4c), não uma tela à parte.
  - Na web, manter a tela acesa não é confiável (Wake Lock negado, iOS antigo, aba no fundo): o relógio segue certo pelos horários, e a tela avisa quando o navegador não tem a API. No app, `expo-keep-awake`, háptico, som por `expo-audio` e avisos do sistema com o app no fundo, tudo com fallback no Expo Go.
- **Sempre:**
  - O app não vende fora da loja.
  - A foto só é guardada quando vira refeição, com consentimento (ADR 038).
  - Nada de módulo nativo que quebre o Expo Go sem fallback.

## Como retomar

1. Abrir este arquivo e achar a primeira issue em `a fazer` ou `em andamento`.
2. Criar a branch `redesign/<issue>-<slug>` a partir do `main` e baixar as pranchas da issue (`gh issue view <n>`) para `.canvas/project/`.
3. Implementar, validar, abrir a PR (`Closes #n`) e fazer o merge com CI verde. Atualizar este arquivo na mesma PR.
4. No fim da etapa: roteiro de teste para o dono e parada.
