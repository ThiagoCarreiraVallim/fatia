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

| Issue | Título          | Estado           | Superfícies                         |
| ----- | --------------- | ---------------- | ----------------------------------- |
| #388  | Conectar sua IA | pronto na branch | api, db, api-client, web, app, docs |

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

## Etapas seguintes

| Etapa                                   | Issues                                                                                                                                     | Estado       |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| 3 · Nutrição                            | #374 o dia, a refeição e a foto · #375 adicionar comida · #376 metas, nutrientes e plano alimentar                                         | em andamento |
| 4 · Treino A                            | #377 início, sessão e treino feito · #378 planos e exercício · #379 plano recebido, modelos, bloco e agenda                                | mergeado     |
| 5 · Treino B e Progresso                | #380 circuitos · #381 treino livre e histórico · #382 progresso                                                                            | em andamento |
| 6 · IA, plano e MCP                     | #384 chat · #385 foto do prato, configurações e memórias · #386 plano e assinatura · #388 conectar sua IA                                  | em andamento |
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
