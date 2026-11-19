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

| Issue | Título                   | Estado           | Superfícies                                                   |
| ----- | ------------------------ | ---------------- | ------------------------------------------------------------- |
| #381  | Treino livre e histórico | mergeado (#437)  | api, MCP (1 tool nova), api-client, web, app                  |
| #382  | Progresso                | mergeado (#438)  | api, MCP (1 tool nova), api-client, web, app                  |
| #380  | Circuitos                | pronto na branch | api, db, MCP (1 tool nova e 1 ampliada), api-client, web, app |

Pendências da #381 (branch `redesign/381-treino-livre-historico`, sem migration):

- **Tipo da sessão é derivado, não gravado:** `plan` com `planId`, `free` sem. `circuit` é o ponto de extensão da #380 (`helpers/session-kind.ts`, `HISTORY_FILTERS`, `sessionHero` e o detalhe `history/[id]`): a #380 já ligou a aba "Circuitos" do Al-T10 e a tela Al-T11c. Plano apagado deixa a sessão sem `planId`, e ela passa a aparecer como livre.
- **Rotas e MCP:** `GET /workout/history` (totais, filtro `kind`, cursor), `GET /workout/sessions?kind=`, `POST /workout/sessions/:id/plan`; o resumo da sessão ganhou `kind`, as séries de cada exercício, kcal e o recorde de antes. MCP `save_session_as_plan` (152 tools; 153 com o `get_consistency` da #382) e `list_workout_sessions` com `kind` e sensação.
- **Treino livre (Al-T17b):** monta antes de começar; a sessão só nasce no "Iniciar treino". Os escolhidos sem série ficam só no cliente (o cache `pending` da sessão), como na #377: fechar o app antes da primeira série os perde.
- **Recorde de distância do cardio:** passou a somar as séries da sessão (como o resumo já fazia), em vez da maior série. Pode conflitar com a #382 (progresso), que lê os mesmos recordes.
- **Desvios do canvas:** o detalhe tem "Corrigir séries deste treino" (leva à sessão), porque a tela antiga de sessão concluída era o único lugar de corrigir; cartão de cardio e selo de recorde usam `text-background` para contrastar nos dois temas.
- **Ainda não conferido:** capturas contra as pranchas (o dono faz a passada visual).

Pendências da #380 (branch `redesign/380-circuitos`, migration `20261116053800_workout_circuits`):

- **Modelo:** circuito é um `WorkoutPlan` com `kind = CIRCUIT` e um `CircuitConfig` 1:1 (formato e só os campos dele). Os itens são `WorkoutPlanExercise` com `repUnit` (reps ou segundos) e `targetReps` numérico. A sessão congela o circuito em `WorkoutSession.circuit` (JSON v1: definição, `startedAt`, toques com horário, resultado e a última vez).
- **Relógio:** funções puras em `packages/design/src/circuit-timer.ts` (o api-client reexporta; a API usa o `dist/`), por horário (nunca por tique). Cada toque vai para `PUT /workout/sessions/:id/circuit`, e outra aba ou o app retomam do mesmo ponto. "Encerrar" (`POST .../circuit/finish`) é idempotente e atômico; o servidor conta o resultado de novo pelos toques (o do cliente é dica) e cria uma `SessionSet` por exercício por round, minuto ou intervalo. Sem toques (`log_circuit_result`), `checkCircuitResultBounds` confere as faixas (rounds do AMRAP no tempo, um tempo por round, tempo final do For Time, até 2.400 séries). Os toques valem de 1 min antes a 6 h depois do começo da sessão; o teto de 2.000 guarda o último lugar para o "end".
- **MCP:** `create_workout_plan` aceita `circuit` e `exercises` com `reps` ou `seconds`; `log_circuit_result` (nova) registra um circuito feito, fechando a sessão aberta ou criando uma terminada. Não há `update_circuit`: editar é pela tela.
- **Integração com a #381:** a sessão com circuito é `kind: circuit` (filtro "Circuitos" no Al-T10, linha "4 rounds + 2 · 4 exercícios"), o detalhe `history/[id]` mostra o Al-T11c com "Repetir circuito" (`sessionDetailBody`), "Salvar como plano" recusa circuito (400) e some da tela, e o `log_circuit_result` grava o retrato `fromPlan`/`planName`. `finish_workout_session` numa sessão de circuito sem resultado é 409 apontando `log_circuit_result`; a sessão que fechou assim antes ainda recebe o resultado. Exercício pessoal apagado com um circuito aberto: as séries dele ficam de fora no fim (o resultado guarda o total). A comparação com a última vez só vale para o mesmo formato, configuração e exercícios. O fim do circuito (relógio, `log` e `log_circuit_result`) dispara os `WORKOUT_FINISHED_HOOKS` da #382 depois do commit, como o fim normal: conquistas na hora. A sequência por dia ativo e a constância contam o circuito concluído como qualquer treino (`circuit-achievements.integration.spec.ts`).
- **Desvios do canvas:**
  - Números do Novo circuito digitáveis, além do −/+.
  - "Encerrar" pede confirmação.
  - O card da aba Circuitos abre o editor (o "Começar" leva ao relógio). O "Circuito" do Treino leva à aba Circuitos quando já há circuito, e ao Novo circuito quando não há.
  - Tocar num exercício adiante no AMRAP/For Time marca também os anteriores do round.
  - O For Time tem "Pular descanso" no descanso entre rounds (a prancha não desenha esse estado).
  - O AMRAP terminado pelo tempo mostra o fim no desenho do Al-T4e ("rounds + exercícios").
- **Contas escolhidas:** o Tabata conta o último descanso no total (8 × 20/10 = 4 min, como a prancha); pular fase conta a fase como feita; a série do Tabata grava os segundos de trabalho; `targetReps` em faixa vira o maior número.
- **Passe visual (prints em `~/.cache/fatia-vis/380/cmp-<prancha>.png`, prancha | web | app):**
  - Corrigido: o card da aba Circuitos mostra todos os exercícios com o nome inteiro (`circuitExerciseChips`), como no `C()` da prancha; o corte em três e em duas palavras ("Thruster com") era o do plano.
  - Corrigido: no app, o brilho dos intervalos é um gradiente radial em SVG (era um bloco de borda dura) e os pontos ficam no pé da tela, como no Al-T4b/T4d.
  - Corrigido: na web, os cartões do resultado (Al-T11c e Treino feito) têm uma coluna por cartão; na primeira vez, sem comparação, a linha não fica com buraco. Os rótulos "Exercícios" e "Tempo de cada round" usam a fonte do corpo, não a dos títulos.
  - Desvios de propósito: "Encerrar circuito" no AMRAP e no For Time (o Al-T4c diz "Encerrar"), com confirmação; "Salvar treino" verde e sem o botão de pausa morto no fim de todos os formatos (o Al-T4e desenha claro, o T4b/T4d verde); o selo do formato usa a cor do formato também no relógio (o Al-T4d desenha o EMOM azul, o Al-T6 laranja); o selo do relógio mostra o nome do circuito; a linha do exercício da vez no app é tinta lisa (sem `expo-linear-gradient`); o subtítulo do exercício no Al-T11c usa a linha de grupo do resto do treino.
  - Os relógios de AMRAP, EMOM e Tabata foram conferidos com uma sessão falsa (rota interceptada na web, dado em memória no app), sem gravar nada; o For Time rodou de ponta a ponta.
  - Pendência: o relógio aberto no app não acompanha toques feitos em outro aparelho enquanto fica aberto; retoma certo ao abrir de novo.
  - Depois de trocar para esta branch, rode `pnpm install` (o api-client passou a depender do `@fatia/design`) e reinicie o `next dev`: o cache do webpack guarda o `circuitState` como ausente.
- **Ainda não conferido:** som e avisos no aparelho (no Expo Go do Android não há avisos do sistema: o relógio só apita com a tela acesa).

Pendências da #382 (branch `redesign/382-progresso`, migration `20261116050000_achievement_workouts_100`, só dados):

- **Sequência:** um cálculo só (`ConsistencyService`) para `GET /streak`, o Hoje, `get_streak`, `get_day_overview` e as conquistas. A tolerância de faltas da #147 continua. As sub-sequências (nutrição, treino em semanas, passos) saíram do `StreakSummary`, junto com os `StreakCard` mortos da web e do app. O desafio `ACTIVE_DAYS` da comunidade não mudou: é comparação entre pessoas, com regra própria.
- **Constância (G12):** `GET /progress/consistency?range=month|quarter|year` e o MCP `get_consistency`, derivados na leitura, sem tabela. Água conta a soma do dia; passos contam o maior registro (ADR 007). Água e passos sem `UserGoals` ficam "sem meta". O treino conta contra a meta semanal. O recorde é por período (o maior entre o histórico e a janela).
- **Conquistas (G11):** catálogo de 10 com `condition` e `progress` (o "faltam 58"). A tela reavalia (`POST /achievements/evaluate`) antes de listar, como o Hoje; se a contagem já bateu e ainda não gravou, mostra desbloqueada. A `workouts_100` vale retroativa pela migration e também no fim de cada treino (`WORKOUT_FINISHED_HOOKS`, num módulo global para não criar ciclo de módulos).
- **Recordes (G5):** `GET /workout/records` virou `{ records, highlight }`. "Maior evolução do mês" usa os últimos 30 dias corridos, não o mês do calendário, em % de 1RM estimado. Só entram séries de treino concluído. O recorde de distância do cardio soma as séries da sessão, como na #381. `listPersonalRecords` do api-client segue devolvendo a lista.
- **Metas (G9/G10):**
  - "Vencida" é derivada na leitura (`effectiveStatus`). O PATCH com prazo futuro volta a meta para ativa.
  - São três abas, como no canvas: Ativas, Concluídas e Arquivadas. A issue fala em quatro; a vencida fica nas ativas, com o selo.
  - Concluir, arquivar e apagar perguntam antes. "Só a arquivada pode ser apagada" é regra de tela: o servidor (`DELETE /goals/:id`) e o chat (`delete_goal`) continuam apagando qualquer meta.
  - Prazo: no passado volta 400 ("O prazo não pode estar no passado."), no criar e no editar, pela REST e pelo MCP. Só a data (`"2026-12-31"`) vale até o fim desse dia no fuso da pessoa. A vencida continua achável pelo `mark_goal_done`.
  - Metas marcadas à mão (% de gordura e "Outra") ganham "Atualizar". "Outra" também ganhou o campo Unidade.
  - O rodapé não fala de gordura: a % só se atualiza sozinha com a #383.
- **Metas de água e passos valem para trás:** a constância (G12) e a sequência leem a meta atual de `UserGoals` para todos os dias, inclusive os antigos. Mudar a meta reescreve o passado. É comportamento conhecido; guardar o histórico de metas fica para depois.
- **Gráficos (G6):**
  - Cardio usa `GET /progress/cardio` sem `exerciseId`, que soma todo o cardio da sessão. O ritmo somado divide só o tempo das séries com distância (a bike sem distância não puxa o ritmo); as kcal somam tudo.
  - Força usa o exercício de maior 1RM até a pessoa escolher outro.
- **Passe visual (prints em `~/.cache/fatia-vis/382/cmp-<prancha>.png`, prancha | web | app):**
  - O Progresso (G1) não repete o título no topo (`untitled` em `navigation.ts`); a tendência de Força é o volume médio por sessão (`strengthTrend`), para a semana corrente incompleta não puxar para baixo.
  - Desvios de propósito: o G7 abre com o último peso como dica (placeholder), não preenchido, para não gravar um registro repetido sem querer; o G1 mostra "—" em gordura até a #383; o G6 mantém o botão "Registrar peso"; as conquistas são 10 (a prancha desenha 9); as folhas do app abrem em 85%.
  - Treinos na constância pode passar do total (17/16): o denominador é a meta semanal × semanas cheias, e treinar a mais conta. A barra para em 100%.
  - Ganhou "Registrar peso" e "Registrar passos", que não estão no canvas.
- **Registrar peso (G7):** uma folha com Peso e Passos (`body-log-sheet`), aberta pelo menu da IA, pelo Hoje (passos) e pelo "Peso atual" de Você. O miolo é o das gavetas de antes, com `embedded`.
  - O valor é digitável e tem − e +.
  - Apagar continua com "Desfazer", sem pergunta, como nos registros pequenos.
  - O que veio do celular mostra o selo de origem e não se edita nem apaga dali.
- **% de gordura no G1:** o cartão fica sem link e com "—" até a #383 (Al-G2). O ponto de extensão está em `progress-screen.tsx`, em `progress/index.tsx` do app e no `case GoalKind.body_fat` de `goals.service.ts`.
- **App sem calendário nativo:** "Escolher" prazo e "Novo prazo" são datas digitadas (DD/MM/AAAA, `parseDayInput`).
- **Dica da constância:** é só o lado bom. O "Sábado é o que mais falha" da prancha saiu.
- **Ainda não conferido:** as capturas contra as pranchas. O dono faz a passada visual.

## Etapa 6: IA, plano e MCP (em andamento)

| Issue | Título                                                 | Estado           | Superfícies                                                     |
| ----- | ------------------------------------------------------ | ---------------- | --------------------------------------------------------------- |
| #384  | Chat com IA: conversas, cartões, estados e ferramentas | pronto na branch | api, db, agente, MCP (contrato de cartão), api-client, web, app |
| #385  | IA: foto do prato, configurações, memórias e limites   | pronto na branch | api, db, agente, MCP (`save_memory`), api-client, web, app      |
| #386  | Plano e assinatura                                     | pronto na branch | api, db, api-client, web, app, site, e-mail e push              |
| #388  | Conectar sua IA                                        | pronto na branch | api, db, api-client, web, app, docs                             |

Pendências da #384 (branch `redesign/384-chat`, migrations `20261117110000_ai_consent_and_web_search` e `20261117110100_chat_photos_in_media_file`; envs novas `AGENT_CHAT_PAUSE_AFTER_TOOLS`, padrão 14, e `AI_CONSENT_PROVIDER`/`AI_CONSENT_MODEL`/`AI_CONSENT_SEARCH_ENGINE`, vazias = o destino de hoje):

- **Contrato de cartão:** toda tool declara o formato do cartão (`card` no `McpToolDef`), sem Tabela padrão para quem não mapeou (decisão do dono durante a issue). Leitura → um dos 12 formatos de consulta; confirmável → `confirm` (o cartão Gravar/Ajustar; `refresh_achievements` → `badges`); restrita → `appOnly { screen, path }`. As tools do agente também: `web_search` → fontes, `ask_user` → pergunta, `open_in_app` → só no app (`AGENT_LOCAL_TOOLS`). `tool-catalog.spec.ts` reprova tool sem formato; o agente descarta `kind` desconhecido em vez de virar Tabela. Servido em `GET /chat/tool-catalog`. Não vai no fio do MCP: `SHA_ENTIDADE`, contagem e docs do MCP não mudaram (specs rodados depois do merge e do contrato).
- **Produtores:** toda tool de leitura desenha o cartão que declara. As 22 que não tinham produtor (métricas, barras, linhas do tempo, faixas, progresso, comparações, placar) e `refresh_achievements` ganharam `artifact()`; Tabela e Lista genéricas desenham qualquer resultado com o que mostrar (objeto único vira rótulo/valor, nome aninhado resolvido, coluna sem número). `chat-card-coverage.spec.ts` roda toda tool com `card` contra uma amostra realista e reprova formato sem produtor (44 de 70 casos estavam vermelhos antes). Cliente: formato desconhecido (ou sem o campo principal) vira o aviso "Este cartão precisa de uma versão mais nova do Fatia.", no PWA e no app.
- **Só no app:** a IA nunca apaga, sai ou autoriza; chama `open_in_app`, que emite o cartão "… é pelo app" com "Abrir <tela>" (link montado por `appOnlyHref` sobre `ROUTES`; sem o parâmetro, a tela-mãe).
- **Busca na web (só OpenRouter):** tool local `web_search` **sem argumento**: o modelo principal só decide buscar. A pergunta é escrita numa chamada à parte que vê só a última fala da pessoa (sem citação, perfil, memórias nem histórico), depois passa pelo filtro de e-mail, telefone e documento; a mesma pergunta aparece no aceite e é buscada. Chamada separada ao OpenRouter com o plugin `web` (engine `exa`), só com esse texto. Cobra 1 busca antes de sair, mesmo sem `usage` ou parada no meio. Modo `off | ask | on` vem da API a cada turno; `ask` pausa com `web_consent` ("Buscar na web?", com a pergunta à vista). O aceite diz que a retenção zero não cobre a busca. Fontes num cartão. Cada busca cobra na cota (`AiUsage` `web_search`, modelo `openrouter-web-search`).
- **Aceites:** `AiConsent` (chat e busca, com versão) e `User.webSearchEnabled`. Toda chamada do `HostedAiService` (turno, ditado, foto do prato, rótulo) exige o aceite do chat: sem ele, 403 `AI_CONSENT_REQUIRED`, e o PWA e o app abrem o aceite (no chat, no ditado, na foto, no rótulo e no onboarding); carregando ou sem conseguir ler, o campo não aparece. O 403 diz "atualize o app" para o app antigo, que só mostra a mensagem. Os nomes (provedor, modelo, busca) vêm das envs `AI_CONSENT_*` pela API, e o aceite gravado leva os nomes: trocar um pede o aceite de novo. O texto tem hash amarrado à versão (`2026-11-17`) num teste. No lote, a busca conta como decisão e o aceite dela só é gravado no Enviar, se a escolha final for concordar. Entram no export de dados. A chave do globo no topo liga e desliga a busca. A `/privacy` descreve a busca nova.
- **Fila e parada:** depois de uma resposta com erro, a fila para e cada item ganha Enviar/Descartar (nada sai sozinho); "Tentar de novo" reenvia a pergunta que falhou. `POST …/stop` responde só depois de o turno fechar (teto de 10 s), a fila espera essa resposta, e o turno que esbarra no 409 `CHAT_RUN_IN_PROGRESS` tenta de novo com espera crescente. No app, o envio confere parada e conversa depois de subir a foto.
- **Foto do chat passageira:** some em 24 h, presa à mensagem ou não; só fica a que virou refeição (`promoteChatPhotoToMeal`, gancho para a #385, com "guardar as fotos" ligado). A ADR 046 foi emendada para ceder à 038. As fotos entram no export LGPD, na mensagem, com link assinado.
- **Lista de conversas:** a prévia tira a citação (`> …`) da frente.
- **Pausa "Continuo?":** depois de `AGENT_CHAT_PAUSE_AFTER_TOOLS` consultas no turno ("Já consultei N coisas. Continuo?"), com Continuar e Parar aqui; 0 desliga.
- **Merge de `feat/chat-fotos-busca-fila-cartoes`:** ficaram a fila de mensagens, citar trecho, o retry do `/mcp` em falha temporária e a foto do chat no R2 (ADR renumerada para **046**, migration renomeada para ordenar depois das da main). A busca da branch (tool de servidor dentro da chamada do modelo, sem aceite, com a conversa inteira no contexto) saiu; ficou a cobrança por busca dela.
- **Conversas antigas:** o dono liberou apagar mensagens e conversas antigas se o schema limpo pedisse. Não foi preciso: os formatos novos moram no mesmo `metadata.artifacts`, e as conversas antigas abrem como antes. **Nada foi apagado.**
- **Tela (web e app):** linhas da tool com "Consultando …", "· nada encontrado" (neutro), "· não deu certo" (vermelho, detalhe num toque), "· você recusou"; 2+ consultas seguidas viram "Consultei N coisas" (nunca com falha); o cartão da última resposta fica aberto e o das antigas recolhe numa linha com ✓ e o resultado; confirmação Gravar/Ajustar com contorno verde, inválida em vermelho sem Gravar, lote "Enviar N decisões"; respostas rápidas; lista Hoje/Esta semana/Antes com a última fala; motivo "Demorou"; "Ouvindo… O áudio vira texto e é descartado."; plano "n de m passos"; "Você" na fala. O app ganhou os motivos do 👎 (`ChatSession.explainVote`), que só o PWA tinha.
- **Desvios de propósito:**
  - Ajustar recusa a escrita (nada é gravado) e a correção vai pelo campo: a prancha não diz o que o Ajustar faz.
  - Sem o "Abrir"/"Abrir dia" no canto de cada cartão de consulta: só ficam Baixar (arquivo), Ver vídeo (instruções) e Abrir (só no app).
  - O ícone do cartão é o do formato, não o da área.
  - No app a escrita feita recolhe como "· gravado", sem a hora (o app não guarda a hora de cada fala); no PWA, "· gravado às HH:MM".
  - "Agora não" do aceite sai do chat (web volta ao início, app volta uma tela).
  - O anel do progresso no app é um círculo cheio com o número, sem o arco parcial.
  - O topo da conversa mantém globo, memórias, conversas e nova conversa, em vez de um botão só.
  - Campo numérico de pergunta é digitável, sem stepper.
  - O cartão da resposta antiga fica como foi decidido; só o da última resposta fica aberto.
  - Ficam o tempo da resposta e a barra de ações (copiar, citar, 👍/👎) embaixo de cada resposta.
  - O cartão de confirmação não ganha respostas rápidas embaixo: a decisão é no cartão.
  - Sem o selo de iniciais do treinador ("TD") na lista: o resumo da conversa não traz a comunidade.
  - A conversa nova se chama "Nova conversa" até ser aberta de novo (o título vem do servidor depois do primeiro turno).
  - No PWA, o Gravar abre com o foco (anel), para dar para confirmar pelo teclado.
  - O placar usa a inicial como avatar.
  - O ditado (Al-M17) só aparece com `dictation` ligado na disponibilidade do chat; no banco dev está desligado, e a gravação não foi capturada (só o campo da conversa nova).
- **Fora do escopo:** o "Avisando a Helena… Entregue" do CH3 e a execução do Desfazer do "Gravado" (só o componente existe; a #385 emite e executa).
- **Passada visual (2026-11-17):** IA-Estados, IA-Cartoes, IA-Conversas, Al-M6, Al-M16, Al-M17, Al-M20 a Al-M23 comparadas lado a lado (prancha, web, app), escuro e uma amostra no claro.
  - Web e app: linha da tool em pílula cinza da largura da conversa, com selo e o desfecho em negrito; a escrita à espera do sim não ganha linha; a busca diz "Pesquisei na web · N sites" e o aviso "Só a pergunta vai…"; a resposta interrompida virou pílula com pausa.
  - Cartões: Gravar/Continuar/Responder em pílula clara e Ajustar/Parar aqui cinza; pergunta em azul com "Responder"; pausa "Está mais longo que o previsto"; aceites lado a lado (verde e cinza), sem ícone.
  - A primeira fala é o título da conversa (grande, à direita, com linha embaixo); as seguintes, balão.
  - Campo com a câmera dentro e borda verde, "Responda ou peça outra coisa".
  - Linha do tempo sem eixos, com três datas e "em N dias"; meta com ponto de milhar; "Só no app" no cartão só do app.
  - Lista (Al-M6): no app, "Conversas", linhas sem cartão, seção em caixa normal, busca com lupa, ponto verde "Esperando você" e giro "pensando", botão de opções e o atalho "Nova conversa…" embaixo; o PWA ganhou o mesmo ponto e giro na gaveta.
  - O topo da conversa no app mostra o título dela; o nome "Fatia" só aparece para agente de comunidade.
  - A prévia da lista sai sem a marcação do markdown.

Pendências da #386 (branch `redesign/386-plano`, migration `20261117100000_pro_trial_reminders_community`, env nova `BILLING_PRO_TRIAL_DAYS`, padrão 7):

- **Regra das lojas (o app nunca vende fora da loja):** a tela sai de `planStatusView(plan, { surface, canPurchase, now })` no api-client. Com `surface: 'app'` ela nunca devolve pagar, cancelar, preço da web, Pix, boleto nem link (teste com mutação vista falhar). Sem compra no app (`EXPO_PUBLIC_IAP_ENABLED`), a oferta é "O PRO vem pela sua comunidade" + "Tenho código", sem preço. O `webManageNote` ("entre pelo navegador") saiu.
- **Assinatura da web vista no app:** mostra o estado e as datas, com "Fora do app" e "mandamos por e-mail como resolver", **sem botão** (o texto da prancha Al-M13). Quem resolve é o e-mail Ex-03, que leva ao Meu plano da web. O push de cobrança não leva preço, Pix nem link.
- **Loja:** quem assina pela loja resolve na loja nas duas superfícies (Al-M13d), e nunca recebe cobrança nem lembrete de pagamento do Fatia. Só recebe o "a loja não conseguiu cobrar" e o "o teste está acabando".
- **Decisão: o aviso de fim do teste da loja fica** (a prancha Al-M3 promete), mas diz só "se não quiser continuar, cancele nas assinaturas da loja", com o link da tela de assinaturas da loja. Nunca leva preço, link nem instrução de pagamento do Fatia (teste em `billing-reminders.spec.ts`).
- **Teste de 7 dias, uma vez por pessoa** (`User.proTrialStartedAt`):
  - Na web, o primeiro checkout de quem é elegível já é o teste: `TRIALING`, a primeira cobrança vence no fim e nada é cobrado hoje. Nada é cobrado sozinho, nem no cartão: a pessoa paga a primeira cobrança até o fim do teste (Pix, boleto ou cartão), na página de pagamento, que a tela mostra durante o teste.
  - A reserva do teste é da mesma transação que grava a linha, sob uma trava por pessoa (`pg_advisory_xact_lock`): Asaas fora do ar não gasta o teste, assinatura criada no Asaas que não chega ao banco é cancelada lá, e duas abas não abrem duas assinaturas.
  - Teste vencido há 4 dias sem pagamento: a rodada dos avisos cancela no Asaas e grava `EXPIRED`. O checkout cancela no Asaas toda assinatura viva da pessoa antes de criar a nova; webhook da antiga não mexe na nova. Teste cancelado ou vencido volta a ver o formulário ("Voltar ao PRO"; com cobrança aberta, "Pagar" e "Assinar de novo").
  - Na loja, vem do `period_type: TRIAL` da RevenueCat.
  - O app só promete o teste quando o pacote da loja tem oferta introdutória grátis **e** a pessoa é elegível. Quem decide e cobra é a loja.
  - Teste sem pagamento volta ao Free sem carência.
  - Limites (documentados em BILLING.md, sem código): a elegibilidade da oferta da loja é por conta da loja, não do Fatia; quem apaga e recria a conta volta a ser elegível na web.
- **Forma de pagamento:** Pix, boleto ou cartão escolhidos antes (Si-04), gravados em `paymentMethod`. Trocar período ou forma cancela o pendente. O cartão recebe "vence em breve" e "vence hoje" como Pix e boleto.
- **Avisos (Ex-03):** `BillingReminderJob` de hora em hora, a partir das 9h no fuso da pessoa; o "hoje" e o fim do teste também são do fuso dela (Cuiabá, Rio Branco e EUA testados). Fuso inválido cai em São Paulo e uma assinatura que falha não para a rodada; `PATCH /me` e o `update_timezone` do MCP recusam fuso que não existe. `BillingReminder` é gravado antes do envio, com unique por assinatura, tipo e vencimento. Push com `NotificationKind.BILLING`, sem chave na tela de Notificações.
- **PRO pela comunidade:** `GroupSeatPool.mode = ALL_MEMBERS` (só papel MEMBER). O programa é o pool com `programName` e data final. Para dev e E2E: `pnpm billing:grant-group <slug> [--until AAAA-MM-DD] [--program "Nome"] [--revoke]`; o `--until` vale até 23:59:59.999 desse dia em São Paulo. `grant-group`, `grant-pro` e `grant-seat` mostram antes o que mudam e recusam produção sem `--i-know-this-is-production`. O painel vê só se o membro tem PRO pela comunidade, nunca como uma assinatura pessoal foi paga (`user-isolation.spec.ts`).
- **Site (Si-04):** `fat.ia.br/pro` não tem sessão. Ele escolhe período e forma de pagamento e manda para `app/assinar`, que passa pelo login quando preciso e chega ao Meu plano com a escolha (`?periodo=&pagamento=`). O CPF é digitado na web e vai direto ao Asaas. Os preços do site saem do mesmo `BILLING_PRO_*_CENTS` (build args).
- **Renomeados ao tocar:** `plano` → `plan`, `precos` → `prices`, `processarWebhookAsaas` → `handleAsaasWebhook`, `cancelar` → `cancel`, `sincronizar` → `sync`, `encerrarAntesDeApagar` → `cancelBeforeAccountDeletion` (agora também no meio do teste).
- **Desvios do canvas:**
  - O M3 (início do teste) é uma folha de 85% sobre o M2, não uma tela.
  - "Tenho código" no chat leva à Comunidade com a folha do código aberta (`/community?join=1`). No Meu plano, a folha abre ali mesmo.
  - O M2 ganhou "Restaurar compras" (exigência da loja).
  - Na web, o Si-04 fica dentro do Meu plano: período, CPF, forma de pagamento e teste. O pendente ganhou "Trocar a forma de pagamento".
  - O "Pagar com Pix" do M13b/c é o link da cobrança no Asaas, que mostra o Pix (o Fatia não gera QR). Só aparece na web.
  - Os preços do M2 no app são os da loja, não os da web.
  - O selo do Você mostra "Teste · n dias".
  - O cabeçalho do Meu plano é o da tela ("‹ Meu plano"), não o "X" com o selo Free do M2: a mesma tela mostra todos os estados.
  - No app, o cartão de uma assinatura vencida (Expirada, IA pausada) vem sem botão: a oferta da loja ou da comunidade logo abaixo já tem a ação. A IA pausada pela carência "terminou" no fim da carência.
  - O M5 mantém, abaixo do cartão laranja, o cartão do estado ("PRO · Comunidade", "Abrir a IA") e a lista "Seu PRO inclui"; o programa mostra a data e os dias que faltam, sem a barra de progresso.
  - O M13 não tem as abas de estado (são o tweak da prancha) nem o push de exemplo do M13b/c.
  - Os botões das pranchas sem ícone no app ("Tenho código", "Pagar com Pix"): o `Button` do app não tem ícone.
  - Si-04 no site: o CPF é pedido na tela seguinte (o Meu plano da web), porque o site é estático e não tem sessão; a mesma página empilha em uma coluna no celular.
  - Ex-03: sem a imagem do logo (nenhum e-mail do Fatia carrega imagem remota) e com o texto da regra do teste (nada é cobrado sozinho): "Abrir pagamento" no lugar de "Continuar no PRO", sem a contagem de refeições, e "Não conseguimos confirmar o pagamento" no atraso, porque nem sempre é cartão.
- **Passada visual** (prints em `~/.cache/fatia-vis/386/cmp-<prancha>.png`, prancha | web | app; site e e-mail contra Si-04 e Ex-03) feita, com o demo em cada estado pelo banco de dev. A oferta da loja (M2 com compra, M3) só foi conferida por código e testes: o Expo Go não tem a RevenueCat nem pacotes da loja.
- **Fora do escopo:**
  - E-mail de checkout pendente.
  - Aviso no app quando o teste da loja converte.
  - O "Regularizado" do M13b como estado próprio: depois do pagamento a tela volta ao "Ativa".
- **Ainda não conferido:**
  - Compra real na loja (exige build de desenvolvimento e contas de teste).
  - Checkout no sandbox do Asaas.

Pendências da #388 (branch `redesign/388-conectar-ia`, migration `20261117000000_mcp_oauth_connections`):

- **Decisões:**
  - Vínculo pessoa × app de IA: tabelas novas `McpOAuthConnection` (pessoa, cliente DCR, `lastUsedAt`) e `McpOAuthConnectionToken` (SHA-256 dos access e refresh tokens de cada conexão, com validade, podados ao vencer). A `McpOAuthAuthorization` não serve: é apagada minutos depois do login. A conexão nasce só na troca do code (cliente da autorização, dono pelo `sub` do token que o Logto emitiu). O refresh acha a conexão pelo hash do refresh token apresentado e nunca cria linha; o `client_id` do corpo não decide nada. Gravar a conexão roda depois da resposta (sem `await`) e nunca derruba nem atrasa o login da IA.
  - "Último acesso": cada chamada ao `/mcp` acha a conexão pelo hash do Bearer entre os access tokens válidos dela e atualiza `lastUsedAt` (no máximo uma escrita por minuto). Vários aparelhos no mesmo cliente contam. Quem conectou antes da tabela só aparece depois de conectar de novo.
  - "Conectado" só com último acesso nos últimos 30 dias (`CONNECTED_WINDOW_DAYS`); mais velha, "<IA> conectado antes", com o teste à mão. Sem revogação, o Fatia não sabe quando a pessoa removeu o conector.
  - `GET /users/me/mcp-connections` devolve `serverUrl` e as conexões da própria pessoa (`clientName`, `connectedAt`, `lastUsedAt`). Isolamento em `user-isolation.spec.ts`, inclusive o fluxo OAuth inteiro (DCR → token → guard → toque), o refresh com o `client_id` do app de outra pessoa (não cria linha) e o refresh sem `client_id`.
  - Endereço do servidor: `API_PUBLIC_URL` + `/mcp`, servido pela API. É o `resource` do metadata para quem chega pelo endereço público (`public-url.spec.ts`). Sem env nova; nenhuma tela escreve o endereço.
  - Sem revogação no Fatia: a tela diz "para desconectar, remova o conector no app da sua IA".
  - Erros do Logto no `/oauth/token` passam a sair no formato da RFC 6749 (`OAuthError`); antes, um refresh vencido voltava como 401 do Nest. `invalid_grant` só quando o Logto disse isso: Logto fora do ar vira `temporarily_unavailable` (503) e configuração errada do facade (`invalid_client`, `invalid_target`…) vira `server_error` (500), para o Claude não jogar fora o refresh token.
  - O `?tutorial=` da Ajuda marca o tutorial como assistido, como o toque na lista, e sai da URL ao fechar.
  - O export de dados (LGPD) leva as conexões, sem os hashes.
  - Entrada: Você › IA › Conectar sua IA, rota `/profile/connect` no app e na web (o app usava `/profile/tokens`, apagada). "Minha IA (MCP)" do menu da IA também leva para lá.
  - Qual IA é qual: pelo `client_name` do registro (`claude` → Claude, `chatgpt`/`openai` → ChatGPT, o resto → Outro app). A tela abre na IA da conexão mais recente.
- **Diferenças de propósito em relação às pranchas:**
  - O endereço é o da configuração (`https://api.<domínio>/mcp`), não o `https://fatia.app/mcp` da prancha.
  - Al-V6c: "você pode desconectar em Configurações da IA" virou "para desconectar, remova o conector no app da sua IA". A prancha troca o teste pelo cartão de conectado; aqui o cartão fica acima, e o teste (com "Ele responde algo como:") e o "Não funcionou?" continuam embaixo, porque o "Conectado" pode estar velho. O exemplo de resposta vem sem "3 de 5 hábitos" (Hábitos é a #390).
  - Al-V6d: "Ver o tutorial com imagens" virou "Ver o tutorial" (a Ajuda ainda é só texto, #415); ele abre o tutorial "Conectar ao Claude ou ChatGPT" direto (`/you/help?tutorial=conectar-sua-ia`), que ganhou o que fazer quando não funciona. A terceira verificação muda com a IA escolhida.
  - Al-V6e: a prancha só chega lá pelo tweak; na tela, o "Não funcionou" tem "Meu app não aceita MCP". "Exportar dados" já exporta (o mesmo link de 24 h de Você). Os dois cartões têm um X para voltar ao teste.
  - O aviso de privacidade (a IA de fora só lê o que é seu, e passa pela política dela) não está na prancha; a issue pede.
  - O primeiro passo vem aberto ao entrar e ao trocar de IA; copiar o endereço abre o "Entre e autorize".
  - Se não deu para copiar (navegador na web; recusa ou `false` do `expo-clipboard` no app), a tela diz para copiar à mão.
  - O selo "grátis" é o `done` do DS (contorno, minúsculo), não o `bdg ok` cheio em caixa-alta da prancha: no claro o verde sobre véu não passa 4,5:1. O cartão de conectado usa o verde a 10% (a prancha usa 16%), pelo mesmo motivo.
  - Passada visual (prints de web e app contra Al-V6 a Al-V6e) feita: textos de apoio em 12/13 px como `b3`/`b2`, título em 700, cartões com o respiro da prancha, teste em `s2`, botões dos cartões visíveis sobre o cartão na web, endereço em monoespaçada no app e verde de texto (`primary-text`) no claro.
- **Falta:**
  - **ChatGPT precisa de teste com conta real antes do lançamento:** os passos seguem a prancha, mas falta confirmar que o ChatGPT faz DCR com PKCE contra o facade, em que plano o modo desenvolvedor existe, e que `client_name` ele manda (se não tiver "ChatGPT"/"OpenAI", a conexão aparece em "Outro app").
  - Domínio de produção do endereço (a história de Produção).

Pendências da #385 (branch `redesign/385-ia-config`, sobre a #384; migrations `20261117120000_ai_write_modes_and_memory_category` e `20261118090000_ai_auto_write_hardening`; nenhuma env nova, a credencial é a `AGENT_API_KEY` que já existe):

- **Modo por categoria (ADR 039):** Registros do dia, Treino, Metas e Memórias, padrão Perguntar antes. A API decide (`toolModes` a cada turno) e confere de novo no `/mcp` com o header `x-fatia-auto-write`: modo, até 5 gravações por resposta, até 10 itens, nunca apagar; fora disso volta ao cartão de confirmação. Cada gravação automática guarda o "antes" (`AiAutoWrite`) e tem inversa por tool; "Gravado" com Desfazer (`POST /chat/auto-writes/:id/undo`, dono, uma vez, 24 h). Desligado tira as escritas da categoria do catálogo. Cobrança, equipe e mural não têm categoria: sempre pedem OK.
- **Endurecimento da revisão (ADR 039, nota de 2026-11-18):**
  - Cada gravação automática guarda também o "depois". O Desfazer recusa com `AUTO_WRITE_CHANGED` se o registro ou os filhos mudaram.
  - Num timeout o agente consulta pelo `toolCallId` e nunca abre o cartão.
  - O header só vale com `X-Fatia-Agent-Key` e com o token de um turno ativo.
  - O teto de 5 conta por mensagem da pessoa, atravessando a retomada e o "Continuar".
  - `toolCallId` repetido é idempotente.
  - As cópias somem em 24 h, ao desfazer ou quando o registro é apagado.
  - O cartão mostra os erros, lembra "Desfeito" ao recarregar e mostra antes → depois.
  - Falha ao gravar a escolha de guardar a foto avisa e deixa tentar de novo.
- **Config da IA (Al-M24):** engrenagem no topo do chat (web e app), com as categorias (toque gira o modo), "Nunca é automático", busca na web (a mesma preferência do globo) e Mais (memórias com "n de 50", Usar sua própria IA, Meu plano).
- **Memórias (Al-M9):** `category` (preferência, rotina, treino, hábito) e data; "n de 50"; com 50 a IA pede para apagar uma; "Apagar todas" com confirmação (`DELETE /chat/memories`, sem tool no MCP); a equipe nunca lê.
- **Estados (Al-M11):** cota com "volta amanhã às 00:00", "Registrar à mão" e campo "Volta amanhã"; fora do ar com "Sua mensagem ficou salva" e Tentar de novo; interrompida com Continuar; "Pode sair da tela" enquanto pensa (o aviso de pronto já existia).
- **Foto do prato (Al-M12, Al-M10):** PWA por arquivo em `/nutrition/photo` (o menu da IA já apontava para lá); aviso do provedor (o nome vem de `AiConsentStatus.processor`, como no aceite do chat) com "Como tratamos seus dados" antes da primeira foto, que é o aceite do chat (o 403 `AI_CONSENT_REQUIRED` traz o aviso de volta); revisão com desmarcar, ±10 g, total, aviso de 20–30% e "Gravar no almoço"; "Vai para:" troca a refeição. Permissão da câmera e da galeria reescritas (a foto só fica com permissão).
- **MCP:** `save_memory` ganhou `category` (opcional); números e `SHA_ENTIDADE` regerados pelos specs. Nenhuma tool lê ou muda o modo.
- **Desvios de propósito:**
  - Só grava sozinha a tool com inversa exata; as outras de uma categoria em Automático continuam pedindo OK (criar plano, bloco, exercício próprio, copiar dia, entre outras).
  - A pergunta de guardar a foto vem antes do reconhecimento, não depois: é nele que a API guarda.
  - A escolha do agente segue na conversa nova, não na Config da IA.
  - A câmera do app não ganhou as abas Prato/Rótulo nem o "Tirar outra" depois do disparo: o rótulo continua no alimento próprio; o "Tirar outra" está no aviso do provedor.
  - O texto da permissão da câmera inclui os códigos de barras, que a prancha não cita.
  - O botão da IA no menu não gira com a resposta em segundo plano; fica o "Respondendo…" que já existia no PWA.
  - A revisão da foto (Al-M10) fica na tela da foto, e não no fio do chat com chips e campo de correção: no PWA, logo abaixo da foto; no app, na gaveta de revisão da #374. A conversa sobre a foto continua possível pelo chat.
  - A Config da IA não tem a escolha do agente ("Com quem você conversa"): ela fica na conversa nova, como já registrado acima.
  - Com a IA fora do ar o campo segue ligado (só o texto muda para "Indisponível"): a mensagem fica salva e "Tentar de novo" reenvia; a prancha apaga o campo.
  - "Continuar" da resposta interrompida fica dentro da própria barra "Resposta interrompida", e não num cartão "Está mais longo que o previsto" com "Parar aqui": parar já é o botão de parar do campo.
  - "Pensando…" antes do primeiro token é um cartão com o aviso de segundo plano; depois que o texto começa, fica só o indicador.
- **Foto do chat que vira refeição:** a #384 deixou o gancho `MediaService.promoteChatPhotoToMeal` (só com "guardar as fotos" ligado), mas a #385 ainda não o chama quando o chat grava uma refeição a partir da foto da mensagem. A foto do chat segue passageira (24 h, #384).
- **Passada visual (Al-M12, Al-M10, Al-M24, Al-M9, Al-M11):** web e app conferidos contra as pranchas; cota e fora do ar do app conferidos com estado forçado (a cota fica desligada no dev).

Sobras da conferência da etapa 6 (branch `fix/chat-etapa6-sobras`, sem migration nem env nova):

- **Cartão de barras:** até 7 barras, um rótulo por barra; acima disso, início, meio e fim, como a linha do tempo. "2026-10-19" e "19/10" saem como "19 out".
- **Teclado no Android:** o chat e o menu da IA sobem pelo quanto o teclado cobre (`useKeyboardOverlap`, sem módulo nativo). O iOS segue no `KeyboardAvoidingView`.
- **Parar antes do primeiro token:** mostra "Resposta interrompida" com Continuar, no web e no app.
- **Pendência:** essa linha não volta ao recarregar a conversa. A API não grava turno vazio (`completeTurn`), e as duas telas descartam linha vazia do histórico. Parar no meio da resposta volta normalmente.

## Etapa 7: Comunidade no app (em andamento)

| Issue | Título                                                                | Estado           | Superfícies                                              |
| ----- | --------------------------------------------------------------------- | ---------------- | -------------------------------------------------------- |
| #393  | Comunidade: minhas comunidades, entrar com código, sobre e benefícios | mergeado (#446)  | api, db, MCP (1 tool nova), api-client, web, app         |
| #394  | Mural: posts, comunicados, enquetes, denúncia, bloqueio e Para você   | mergeado (#447)  | api, db, MCP, api-client, web, app, docs                 |
| #396  | Conteúdo da equipe no app: planos, dicas e guias de exercício         | pronto na branch | api, db, MCP (1 tool nova), agente, api-client, web, app |

#393 (branch `redesign/393-comunidades`, migration `20261118100000_community_entry_code_benefits`; nenhuma env nova):

- **Código de entrada (Cm-02):** é um `GroupInvite` com `code` legível (8 caracteres, sem 0/O/1/I/L), gerado em Convites ("Gerar código de entrada", web e app), só de membro, vale até 1 ano, revogável na lista. **Não é aprovação:** segue a `joinPolicy` (aberta entra, com aprovação vira pedido); comunidade só por convite não gera código (409) e o código dela dá 404. **O slug só vale como código em comunidade pública** (`visibility=PUBLIC`): ele não se revoga, então em comunidade privada só se entra por código gerado ou convite, e o cartão do código não devolve o slug. A Academia Demo (privada) ganhou o código `DEMO2026` no `seed-demo`. Cada entrada soma um uso no convite na mesma transação (o último uso disputado por dois só deixa um entrar; teste de corrida). Preview e join têm teto real por usuário (`UserThrottlerGuard`: 30 e 20 por minuto; o `@Throttle` sozinho era inerte, o `ThrottlerModule` não é `APP_GUARD`), e o `join_group` do MCP tem teto próprio (10 tentativas em 10 minutos). **Não é cupom:** não tem comissão (#287) nem indicação (#332). `previewBySlug` virou `previewByCode`; `join` recebe `{ code }` (aceita `slug` ainda).
- **QR:** o link do QR é `${WEB_ORIGIN}/community?join=1&code=X`; `parseCommunityEntry` lê código, esse link, o link de convite (`/c/<token>`, que entra pelo caminho do convite) e o token puro. No app a câmera (`expo-camera`, a mesma do onboarding) lê; na web não há leitura de QR, o link serve colado. Inválido, vencido, revogado e só-por-convite dão a mesma frase ("Código ou link inválido. Peça um novo à equipe."). O painel mostra o código e o link do QR em texto, sem desenhar o QR (não há biblioteca de QR no projeto).
- **Oferta de PRO no cartão (Cm-02):** `proOffer` é `ALL_MEMBERS` ("A academia libera o PRO para todos os membros."), `SEATS` com vaga ("A academia pode liberar o PRO: a equipe distribui os assentos.") ou `null`, pela regra do portão (`resolveAiEntitlement`). **"PRO pago pela academia" (Cm-01/Cm-04)** e o "se sair, volta ao Free" usam `proPaidByThisGroup`: a fonte do PRO valendo é `GROUP` e o pool é desta comunidade; assinatura própria valendo vence o assento.
- **Minhas comunidades (Cm-01):** `MyGroup` ganhou `visibility`, `timezone`, `memberCount`, `newPostCount`, `forYouCount` e `challenge { id, title, rank }`. "Posts novos" conta desde `GroupMembership.feedSeenAt`, gravado quando a pessoa abre o mural (o `markSeen` da #394, chamado pela web e pelo app; ler a lista não grava, porque o mural mostra a faixa de posts novos antes). "Para você" conta só as ofertas de plano pendentes da comunidade.
- **Sobre (Cm-04):** cada categoria grava na hora (chave), a obrigatória fica travada com cadeado; números da comunidade num checkbox. A equipe vem de `GET /groups/:id/team` (quem da equipe, o que vê de mim, último acesso em `ProfessionalAccessLog` não negado, só do próprio membro), em seções por papel, com busca, "viu hoje" e "Ver toda a equipe (N)". "Quem olhou seus dados" mostra os 5 últimos, inclusive o negado.
- **Benefícios (Cm-22, Pn-28):** `GroupPartnerBenefit` (parceiro, logo opcional pelo storage com propósito `benefit_logo`, desconto, cupom **ou** link https, validade em dia). O membro vê os ativos e os vencidos de ontem (sem cupom nem link), no fuso da comunidade; a entrada em Sobre só aparece com benefício ativo. Cupom copia (guardado como digitado, só sem espaço nas pontas), link abre fora; no vencido só logo e título ficam apagados. Editar manda a validade só quando ela muda, então dá para corrigir o texto de um vencido. **Só o dono cadastra** (`benefit.manage`; `benefit.read` para todos os papéis), no painel da web (tabela + painel lateral com prévia e logo) e no app (formulário com validade em escolhas prontas, sem logo). MCP: `list_group_benefits` (leitura, cartão lista) — 155 tools, `SHA_ENTIDADE` novo.
- **Isolamento:** benefício é sempre buscado por `{ id, groupId }` da URL; o logo passa por `media.resolveForGroup`. `user-isolation.spec.ts` cobre benefícios e a equipe vista pelo membro.
- **Desvios de propósito:**
  - Sem "Rever boas-vindas" em Sobre: depende da #410.
  - A posição no desafio diz "ontem"/"hoje" em vez do dia da semana.
  - O cartão do convite (link `/c/…`) não mostra a oferta do PRO: o preview do convite não traz o pool.
  - A tool `join_group` do MCP manteve a descrição, mas aceita código.
  - O consentimento de entrada segue o `ConsentForm` atual (#371 não mexeu nele).
  - Cm-02: o QR não abre dentro da folha (a prancha tem as abas QR Code/Código com o visor); no app é o botão "Ler QR Code", que abre a câmera em tela cheia, e o campo do código fica sempre à vista. Na web não há QR.
  - Cm-02: código de uma comunidade em que a pessoa já está (ou já pediu) mostra "você é membro"/"aguardando aprovação" e "Abrir a comunidade"/"Ver o pedido", em vez de pedir de novo (`alreadyInView`). A prancha não tem esse caso.
  - Cm-22: "Copiado" fica no contorno neutro com o check, não no verde suave da prancha (o verde sobre verde a 10% não passa contraste no tema claro). Os benefícios vêm por validade, o que vence antes primeiro.
  - Pn-28c: com o editor aberto a tabela fica só com parceiro, validade e "Editar" (a prancha espreme as seis colunas; em 1440 px o link quebrava letra a letra e o "Editar" saía da tela).
  - Pn-28/28b: a moldura do painel (barra lateral com grupos, busca, "Ver no app") é a do `/org` atual, que é de outra issue; o "Benefício" fica ao lado do título, não na barra do topo.
  - Capa do cartão patrocinado no app é a cor chapada, sem o degradê da web (sem `expo-linear-gradient` no projeto).
- **Passada visual (2026-11-18):** prints lado a lado em `~/.cache/fatia-vis/393/cmp-*.png` (escuro; Pn-28 só web: o app estava logado como membro). Corrigido nela: cor da comunidade nos botões dos benefícios e não no monograma do parceiro, título repetido em Benefícios, cupom em fonte fixa no app, link cortado e colunas do painel com o editor aberto, avatar da patrocinada na cor dela (o do app deixava a capa vazar), quem já é membro não refaz o pedido, erro e "Sair" em `text-danger` no app (o `text-destructive` escuro é #93000a), texto do checkbox de estatísticas em Sobre no app.
- **Falta:** prints no tema claro e do painel de benefícios no app (logado como dono); desenhar o QR no painel (#414/#416); abrir o link do QR direto no app (universal link, história de Produção). Fora da #393: `text-destructive` em texto continua em ~50 lugares do app (escuro ilegível) e o `Checkbox` do app não mostra o `label`.

#394 (branch `redesign/394-mural`, migrations `20261118100000_mural_polls_blocks` e `20261118100100_mural_review_fixes`; nenhuma env nova):

- **Bloqueio global (ADR 032, emenda):** `UserBlock`, nos dois sentidos e em todas as comunidades. Some post, comentário, reação (e a contagem), comunicado em nome da pessoa, Para você e os avisos de comentário, reação e comunicado entre os dois. O post em nome da comunidade continua visível, mas comentar ou reagir nele não avisa o autor bloqueado. Quem foi bloqueado não é avisado. O id que vem no corpo (`postId`, `commentId`) é amarrado à comunidade do pedido. Lista com Desbloquear em Você > Conta > Pessoas bloqueadas (web e app). O export LGPD leva os bloqueios feitos, não os recebidos. Coberto em `mural.integration.spec.ts` e `user-isolation.spec.ts`.
- **Ocultar post** (só para mim), **filtros** (Tudo, Equipe, Conteúdo novo, Membros) e **posts novos** desde a última visita (`feedSeenAt`; abrir o mural marca a visita).
- **Avisos fixados em carrossel:** `pinOrder` (o novo entra na frente) e prazo de 3 dias, 7 dias ou sem prazo (até 90). Teto de 3, garantido com `pg_advisory_xact_lock` por comunidade em tudo que fixa (fixar, post fixado, comunicado fixado, reordenar): pedidos ao mesmo tempo não furam o teto. O comunicado agendado com o carrossel cheio tira o último. A ordem e o desafixar ficam na Moderação; reordenar um topo com mais de 3 (de antes da trava) devolve o excesso ao mural.
- **Enquetes:** de 2 a 4 opções, prazo de 1 dia, 3 dias ou 1 semana (a API aceita até 30), voto anônimo, que troca de opção até o prazo mas não se apaga (sem rota de tirar o voto). **Nada de resultado com menos de 5 votos de outras pessoas, para ninguém, inclusive a equipe**: a API não manda nem o total nem as %. Quem votou só vê com 5 votos além do seu (senão, tirando o próprio voto, dava para deduzir o de alguém); com a enquete encerrada vale o mesmo teto. O painel vê desde o quinto voto, também sem contar o voto de quem olha. Quem fecha: o autor, quem modera e quem comunica.
- **Comunicados** (`announcement.publish`: dono e profissional, em `PERMISSIONS.md`): agora ou agendado em blocos de 15 minutos (até 365 dias à frente), repetir todo dia, toda semana ou todo mês, fixar com prazo e notificação (`ANNOUNCEMENTS`, que a pessoa desliga nas preferências de notificação). Job de minuto com reivindicação condicional, sem disparo duplo entre instâncias. Agendados com Cancelar.
  - A repetição conta do primeiro horário (`anchorAt`) no fuso da comunidade (`Group.timezone`): todo mês no dia 31 cai no último dia dos meses curtos e volta ao 31; 22h em São Paulo não escorrega de dia; diário e semanal seguem a hora local.
  - Depois de uma queda, os atrasados viram um disparo só e o próximo fica no futuro.
  - Erro passageiro volta o `nextRunAt` ao horário previsto e conta a tentativa (`attempts`, teto 5). Só cancela de vez quando quem agendou saiu ou perdeu o papel de comunicar, conferido no disparo. Mudar o papel para um sem `announcement.publish`, banir, remover ou sair cancela os agendados da pessoa.
- **Posts automáticos:** plano publicado, dica nova, exercício novo e desafio criado viram post `AUTO` com botão para o conteúdo, sem duplicar (unique `groupId`+`autoKind`+`autoRefId` no banco; a corrida cai no P2002). Ligam e desligam por tipo na Moderação (`Group.autoPosts`).
  - **Decisão:** as comunidades que já existiam antes da `20261118100100` começam com os automáticos **desligados** (opt-in: o dono liga na Moderação), para o mural delas não começar a postar sozinho sem aviso. As criadas depois começam ligadas.
- **Para você** (`GET groups/:id/for-you`): plano de treino e plano alimentar mandados só para a pessoa (para fazer e já resolvido, levando às telas que já existem), comunicados dos últimos 30 dias com "não lido" (o que a pessoa ocultou fica de fora, e o que ela mesma mandou não conta como novo), e o conteúdo publicado mais novo. A aba mostra o número do que falta.
- **Composer:** Post ou Enquete, Escrever ou Prévia, barra de formatação, e o markdown-lite ganhou título (`#`) e citação (`>`). A equipe escolhe publicar como ela ou como a comunidade e fixar como aviso (por 7 dias). Some quando a política é "só a equipe" e a pessoa não é da equipe.
- **Menu do post:** Copiar link, Ocultar, Bloquear (com o texto da prancha Cm-07) e Denunciar; os motivos seguem a prancha ("Desinformação de saúde"). A denúncia vai para a fila da equipe, como já era.
- **MCP:** `get_group_poll`, `vote_group_poll`, `list_blocked_users`, `block_user` e `unblock_user`, todas com cartão (lista com `artifact()` ou confirmação) e rótulo de prévia. `create_group_post` aceita enquete e `list_group_posts` aceita `filter`. Comunicar, criar enquete como equipe e moderar ficam só no painel. Números regenerados pelos specs depois do merge da #393 (160 tools, 149,1 k, 125,1 k, 8.821) e `SHA_ENTIDADE` novo.
- **Desvios de propósito:**
  - Comunicados e enquetes ganharam a seção **Comunicados e enquetes** no painel, para dono e profissional. A Moderação, que é só do dono, ficou com os avisos fixados, os posts automáticos, quem publica, as denúncias, os removidos e os banidos. A prancha Pn-14 junta tudo em "Mural e avisos", mas o profissional comunica e não modera.
  - A aba **Agenda** da Cm-03 não aparece até a #397. A aba "Planos e dicas" virou **Conteúdo**, como na prancha.
  - O painel "Recomendado para você" da Cm-20 mostra os dois modelos e a dica mais novos da comunidade, sem personalização ("combina com a sua meta").
  - Comentários abrem sob o post (web e app), em vez da tela Cm-05 separada.
  - No app, a barra de formatação acrescenta no fim do texto (como o script da prancha); na web, insere no cursor. O horário do comunicado no app é escolhido em chips de dia e de horário, sem seletor nativo.
  - Copiar link no app copia o link do app (`expo-linking`), que abre o mural.
  - O "Fixar como aviso" do composer fixa por 7 dias; outros prazos pelo menu do post ou pelo comunicado.
  - Na Enquete, o composer (web e app) tem um "Contexto da enquete" opcional com Escrever e Prévia, que a Cm-06b não tem.
  - Os avisos do carrossel levam reações e Comentar, como os posts; a Cm-03 empilha os avisos sem rodapé.
  - A Cm-07 é a denúncia em folha; no app, a denúncia abre sob o post, com os mesmos motivos. O menu e a confirmação de bloqueio são folhas que cobrem a barra de baixo.
- **Passada visual (web, 390 e 1440, e app no emulador, tema escuro):** prancha | web | app em `~/.cache/fatia-vis/394/cmp-*.png` (Cm-03, 05, 06, 06b, 07, 20, 21, 21b, 21c, 21d, Pn-01b, Pn-14, Pn-26, Pn-26b). Corrigido nela: o composer começa fechado na linha "Escreva para a comunidade…" (Cm-03); o aviso fixado sem título aparece na Moderação pela primeira linha sem marcação; `text-destructive` virou `text-danger` no composer e na Moderação do app; a enquete encerrada dizia "encerrada · Encerrada" (agora `pollFooter`); no app, as reações de um post quebravam linha sozinhas (a fileira não quebra mais; quem desce é o Comentar); o ciclo de import `feed-ui` ↔ `poll-block` saiu para `feed-keys.ts`. O menu nunca cobre botão de folha ou de formulário (Cancelar e Publicar ficam acima da barra ao rolar). A engrenagem dobrada no topo do app é o botão "Tools" do Expo Go, não do app. O aviso de ciclo `ai-menu` ↔ `food-search-drawer` no LogBox é anterior à #394.
- **Falta (fora do escopo, registrado):**
  - **E-mail do comunicado:** não há descadastro com link na comunidade. Só notificação e mural.
  - Partes da #315 sem prancha: segmentar o comunicado por grupo de membros, imagem e link interno no comunicado, limite semanal e métricas de abertura.
  - Para você: avaliação pedida (#383) e questionário (#391) entram quando essas issues criarem os dados. "Também aparece no Hoje" fica para a issue do Hoje.
  - Posts automáticos de resultado de desafio e de membro novo (prancha Pn-14) dependem de dado que ainda não existe (pódio fechado e consentimento do apelido).
  - Aba Agenda (#397).

#396 (branch `redesign/396-conteudo-equipe`, sobre a main com a #393 e a #394; migration `20261118200000_user_goals_history`; nenhuma env nova; nenhuma permissão nova):

- **Decisão: aplicar plano da equipe pede confirmação com o antes e o depois.** Na tela, a folha "O que entra na sua conta?" (Cm-14) mostra as metas de agora ao lado das do plano, e as metas só mudam se a pessoa marcar; marcando, e se já houver metas, avisa "Suas metas de agora ficam no histórico.". No chat, o cartão de confirmação do `adopt_group_plan` com `applyGoals` traz uma linha por faixa ("Calorias: 2500–2800 → 1800–2000", "(igual)", "sem meta → …"). O modo automático da ADR 039 ainda não existe no código, então a tool continua sempre confirmável.
- **Decisão: o histórico de metas é mantido.** Tabela nova `UserGoalsHistory` com a linha anterior inteira. Todo caminho que troca metas passa por `upsertWithHistory(tx, …)`: tela de metas e MCP (`manual`), onboarding refeito (`manual`), plano da comunidade (`group_plan`, com `templateId` em SetNull e o título) e plano alimentar aceito (`nutrition_plan`). Dentro de uma transação, a linha das metas é travada (`SELECT … FOR UPDATE`) antes de ler o "antes"; só grava histórico se algum campo enviado muda, e duas trocas iguais ao mesmo tempo deixam uma linha só. O `upsert` devolve `{ goals, previous, historyWritten }`; a adoção devolve `previousGoals` e `goalsHistoryWritten`, e a frase "As de antes ficaram no histórico." só sai quando o histórico foi gravado. Entra no export LGPD (`nutritionGoalsHistory`) e em `DATA_RETENTION.md`. Não há tela do histórico ainda. (`store-review-account.ts`, a conta de revisão das lojas, grava metas direto no seed e não passa pelo histórico.)
- **Aba Conteúdo (Cm-12):** "Planos e dicas" virou "Conteúdo" nas abas da comunidade, com título igual ao nome da comunidade e o (i) para Sobre. Plano: "treino · 4 exercícios · intermediário · Bruno". Dica: "Fixada · hábitos", título e o começo do texto; a dica inteira saiu da lista e abre na própria tela. Exercícios: guia com foto, "pernas · máquina · guia da academia", e embaixo "Equipamentos da academia" (só leitura).
- **Plano (Cm-13):** "Por Bruno (dono)" com o papel de hoje de quem fez (`authorRole`, `null` se saiu). Exercício com guia da mesma comunidade ganha o selo "guia", que abre o guia da academia (`exerciseId`/`hasGuide` em cada exercício do plano). Adotar treino não sai da tela: aparece "Em Meus planos" com "Abrir" (também no 409 de quem já tinha adotado).
- **Dica (Cm-15):** `GET /groups/:id/tips/:tipId` (só publicada, da comunidade da URL). Byline "Bruno · dono · 3 nov" no fuso do aparelho. Atalho pelo assunto (`tipShortcut`): água/hidratação abre o registro de água ali mesmo; dica de treino leva ao Treino; o resto não tem botão.
- **Guia da academia (Cm-16):** `GET /groups/:id/exercises/:exerciseId` e `GET /groups/:id/equipment` (`content.read`). Vídeo (no app, abre no navegador, como no resto do app: sem player nativo para não quebrar o Expo Go), fotos em miniatura (na web, com vídeo, a foto tocada abre embaixo dele), "Dica de Helena", "Como fazer" (o detalhe do Fatia) e "Pôr num treino".
- **MCP:** `list_group_exercise_guides` (leitura, cartão lista, nunca devolve URL de mídia) — 161 tools, `SHA_ENTIDADE` novo. O prompt do chat cita a tool; a descrição do `adopt_group_plan` diz que as partes são separadas e que as metas antigas ficam no histórico.
- **Isolamento:** tudo buscado pelo `groupId` da URL com membro ativo; id de dica, guia ou plano de outra comunidade dá 404 pela URL da sua. `user-isolation.spec.ts` cobre quem é de fora, ids cruzados e quem saiu (perde mídia e guia, fica com as cópias de plano e refeições e com o export).
- **Desvios de propósito:**
  - "Pôr num treino" abre um seletor dos meus planos (o que já tem o exercício aparece desligado com "já tem"), e não o fluxo Al-T8 da prancha: é um toque a menos e evita repetir o exercício.
  - O antes e depois mostra quatro faixas (com carboidrato); a prancha mostra três.
  - O botão Adotar continua logo depois da descrição (decisão anterior de usabilidade), e não preso ao pé da tela.
- **Conferência visual (2026-11-18):** prints lado a lado prancha | web | app de Cm-12 a Cm-16 e do "Pôr num treino", escuro e claro na web, em `~/.cache/fatia-vis/396/cmp-*.png`. Corrigido na passada: cabeçalho "Plano da academia" com os selos de tipo e nível e o nome grande (Cm-13); cabeçalho "Guia da academia", músculo e equipamento em selos e a dica com as iniciais de quem escreveu (Cm-16); avatar na assinatura da dica (Cm-15); "agora" e "plano" em colunas na folha do app (Cm-14). Menu escondido sob todas as folhas (adotar, água, Como fazer, Pôr num treino); sem texto escuro no escuro.
- **Desvios visuais de propósito:** o topo da comunidade segue o das outras abas (nome e o (i) de Sobre, e não avatar e botão "Sobre"); na web, as abas Planos/Dicas/Exercícios ficam compactas, como nas outras telas da web; o plano sem capa não tem o degradê da prancha; na web, "O que entra na sua conta?" é o diálogo central do projeto, e no app é folha; na web, "Registrar água" fica logo depois do texto (no app, preso ao pé); o vídeo toca na própria página na web e abre no navegador no app; a legenda do "Como fazer" embaixo dos botões saiu (o botão já diz o que faz).
- **Falta:** tela do histórico de metas; o e2e `content.spec.ts` foi ajustado à dica em tela própria e ao aviso "Em Meus planos", mas não rodou aqui.

## Etapas seguintes

| Etapa                                   | Issues                                                                                                                                     | Estado       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 3 · Nutrição                            | #374 o dia, a refeição e a foto · #375 adicionar comida · #376 metas, nutrientes e plano alimentar                                         | em andamento |
| 4 · Treino A                            | #377 início, sessão e treino feito · #378 planos e exercício · #379 plano recebido, modelos, bloco e agenda                                | mergeado     |
| 5 · Treino B e Progresso                | #380 circuitos · #381 treino livre e histórico · #382 progresso                                                                            | em andamento |
| 6 · IA, plano e MCP                     | #384 chat · #385 foto do prato, configurações e memórias · #386 plano e assinatura · #388 conectar sua IA                                  | em andamento |
| 7 · Comunidade no app                   | #393 comunidades e código · #394 mural · #395 desafios · #396 conteúdo da equipe                                                           | em andamento |
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
- **Etapa 5 (#382):**
  - Sequência = dia ativo em todo lugar. Um dia é ativo com ao menos uma área cumprida: refeição, treino, água na meta ou passos na meta. Um cálculo só, sem dois números de sequência.
  - Conquistas: catálogo fechado em 10, com "100 treinos". O contador é N/10, e quem já tem 100 treinos ganha a conquista pela migration.
- **Etapa 6 (#388):**
  - Sem revogação no Fatia: o texto manda remover o conector no app da IA.
  - O endereço do servidor vem da configuração (o `resource` do metadata, com path), nunca escrito no código.
  - Os passos do ChatGPT seguem a prancha; falta o teste com conta real antes do lançamento.
  - "Último acesso" com a autorização ligada à pessoa; a rota lista só as conexões de quem pede.
  - Entrada por Você › IA › Conectar sua IA, no app e na web.
- **Sempre:**
  - O app não vende fora da loja.
  - A foto só é guardada quando vira refeição, com consentimento (ADR 038).
  - Nada de módulo nativo que quebre o Expo Go sem fallback.

## Como retomar

1. Abrir este arquivo e achar a primeira issue em `a fazer` ou `em andamento`.
2. Criar a branch `redesign/<issue>-<slug>` a partir do `main` e baixar as pranchas da issue (`gh issue view <n>`) para `.canvas/project/`.
3. Implementar, validar, abrir a PR (`Closes #n`) e fazer o merge com CI verde. Atualizar este arquivo na mesma PR.
4. No fim da etapa: roteiro de teste para o dono e parada.
