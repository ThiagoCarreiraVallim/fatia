# Superfície de tools MCP — revisão de consolidação

> Insumo da issue #94 (frente 4 da épica #38). A Anthropic favorece conjuntos de tools
> **focados** em vez de amplos, então a contagem importa para a submissão ao diretório de
> conectores. Este doc registra a decisão sobre o que fica, o que sai e por quê.

## Contagem atual

| Domínio                                                     |   Tools | Arquivos                                    |
| ----------------------------------------------------------- | ------: | ------------------------------------------- |
| Workout (exercícios, planos, sessões, séries, agenda)       |      38 | `apps/api/src/workout/mcp/`                 |
| Progress (peso, passos, água, progresso, dashboard, streak) |      27 | `apps/api/src/progress/mcp/`                |
| Nutrition (alimentos, refeições, itens, metas, plano)       |      28 | `apps/api/src/nutrition/mcp/`               |
| Sharing (grupos, consentimento, plano recebido, painel)     |      12 | `apps/api/src/sharing/mcp/`                 |
| Goals (metas pessoais)                                      |       6 | `apps/api/src/goals/mcp/`                   |
| Meta (perfil)                                               |       3 | `apps/api/src/mcp/tools/meta/`              |
| Conta (export e deleção — LGPD)                             |       2 | `apps/api/src/users/mcp/`                   |
| Avisos (central do sino, #373; preferências de aviso, #389) |       4 | `apps/api/src/notifications/mcp/`           |
| Lembretes pessoais (#389)                                   |       4 | `apps/api/src/notifications/reminders/mcp/` |
| **Total**                                                   | **124** |                                             |

⚠️ Esta tabela é a única contagem da doc **sem guarda automática**: o
`TOOL_COUNT_PATTERN` do `tool-catalog.spec.ts` só enxerga um número colado na palavra `tools`, e
célula de tabela não é. Ela derrapou por isso — dizia 91 com 103 registradas. Quem mexer no
recorte por domínio confere à mão, ou acrescenta o guarda.

A contagem é verificada por `apps/api/src/mcp/__tests__/tool-catalog.spec.ts`, que também
garante que `docs/MCP.md` bate com o registro real.

## Por que uma centena e não ~30

O Fatia é **MCP-first** por decisão de arquitetura (ADR 006): tudo que o PWA faz, o Claude
faz. Isso produz um CRUD completo por entidade — e é o que dá ao conector sua proposta de
valor, já que o usuário consegue operar o app inteiro conversando.

Cortar a superfície pela metade significaria remover capacidade real, não redundância. As
opções abaixo foram avaliadas com isso em mente.

## Tamanho do catálogo servido

O que pesa no contexto não é a contagem de tools, é o payload. Medido no que o registry
serve de fato — `name`, `title`, `description`, `annotations` e o JSON Schema do input das
152 tools: **137,0 k caracteres**, enviados em toda sessão que lista as tools.
O denominador importa. Contar só `name + description + inputSchema` dá 114,1 k e subestima o
catálogo em ~20% — `title` e `annotations` também vão no fio, em toda tool.

Dentro desse total, os exemplos de invocação que a #111 acrescentou às 83 tools de escrita
valem **7.895 caracteres** — média de **87** caracteres por tool, algo em torno de 6% do
catálogo. Os dois números são medidos no código pelo `tool-catalog.spec.ts`, junto com a
contagem: a versão anterior desta frase dizia "4.110 caracteres, média de 91" — estagnada na
medição da #111, feita quando o catálogo tinha 45 delas, e ainda por cima incoerente, porque
aquela divisão não dava 91. Custo de contexto que ninguém confere apodrece igual a contagem de
tools — e apodreceu duas vezes: a média voltou a ficar errada neste mesmo rebase, quando as
tools de grupo entraram e ninguém refez a conta. Agora o teste refaz.

O formato, a isenção de `delete_my_account` e o motivo de o exemplo morar na `description` —
e não em campo separado — estão na §Convenções de [`docs/MCP.md`](./MCP.md).

## Classificação por custo de inferência

Além da contagem, cada tool declara `hostedInference` — se a execução dispara inferência **paga
pela Fatia**. É recorte de custo, não de tamanho, e por isso mora aqui junto do resto.

Hoje são **152** tools que só leem ou gravam dado — custo de IA para a Fatia igual a zero — e
**0** tools com inferência hospedada.

O segundo número é o ponto inteiro. Chamada vinda do cliente MCP do usuário roda no
modelo **dele**: não passa por gateway nosso e não nos custa inferência. Uma tool que chamasse IA
hospedada por dentro inverteria isso sem sintoma — o usuário pede pelo Claude dele, a conta cai
aqui, e o primeiro sinal é a fatura.

`tool-catalog.spec.ts` reprova toda tool que declare `true` fora da lista `HOSTED_INFERENCE_TOOLS`,
vazia hoje. A política — default é **não expor**; a forma aceita é o cliente trazer o resultado
pronto, como `log_meal` já recebe macros calculados pelo Claude — está na
[ADR 018](./ADR/018-inferencia-hospedada-fora-do-mcp.md).

O campo é interno e não vai no fio, então o tamanho do catálogo servido, medido acima, não muda.

## Decisões

### Fica fora do MCP — administração de grupo (#154, #155)

O domínio Sharing entra com **24 tools**. Vinte e duas são do lado do aluno: `list_my_groups`,
`join_group`, `get_group_invite`, `accept_group_invite`, `leave_group`, `set_group_sharing`,
`list_data_sharing`, `grant_data_sharing`, `revoke_data_sharing`, `list_data_access_log` e as
três do conteúdo da comunidade (Fase 7): `list_group_plans`, `adopt_group_plan` e
`list_group_tips`, e as três dos desafios (Fase 8a): `list_group_challenges`,
`get_challenge_leaderboard` e `join_group_challenge`, e as três do mural (Fase 8b): `list_group_posts`,
`create_group_post` e `comment_on_group_post`, e as três do plano de treino recebido (#379):
`list_plan_offers`, `accept_plan_offer` e `decline_plan_offer`. As outras duas são o painel do profissional da #157 — `list_my_students` e
`get_student_progress` —, e as duas **só leem**. Publicar plano pronto e dica é da equipe e
fica só em REST, como o resto do painel. Criar comunidade, editá-la ou apagá-la, aprovar
entrada, remover membro, convidar, revogar convite, transferir a comunidade e comprar ou
atribuir assento ficam só em REST (Fase 5, ADR 025 e 026).

A ADR 006 diz que tudo que o PWA faz o Claude faz, e a exceção é deliberada: o "PWA" em
questão é o painel do dono da academia, superfície B2B que não é o app do usuário. Manter
essas três operações fora do catálogo é o que garante que **nenhuma tool MCP pode criar um
grupo ou colocar alguém dentro de um** — a superfície conversacional só opera sobre a própria
associação de quem fala. Se o painel do dono virar produto, a decisão se reabre com o
requisito na mão, e não por simetria.

O corte é entre **administrar o grupo** e **decidir sobre o próprio dado**, e as quatro tools de
consentimento da #155 caem do segundo lado — por isso entram, e entram justamente aqui: "Claude,
o que a academia consegue ver de mim?" e "quem olhou meu dado?" são as perguntas que a conversa
responde melhor que uma tela. Nenhuma delas lê dado de terceiro: `grant_data_sharing` aponta o
destinatário pela **associação dele no grupo**, e quem amarra essa associação ao grupo do titular
é o `ConsentService`. `tool-delegation.spec.ts` classifica toda tool do catálogo nesse eixo e
reprova a que aceitar a associação de outra pessoa por fora dessa porta.

O painel do profissional (#157) é o terceiro lado, e o único em que uma tool lê dado de outra
pessoa. Entra por dois motivos concretos: "quem dos meus alunos autorizou o quê" e "como a Ana
está indo no treino" são exatamente as perguntas que uma conversa responde melhor que uma tela —
e a leitura já era possível pela REST do painel, então mantê-la fora do MCP não reduziria
superfície nenhuma, só duplicaria caminho. `get_student_progress` está na allowlist de leitura
delegada dos dois specs estruturais, com **uma** categoria por chamada, `readOnlyHint: true` e a
porta única no caminho. O que continua fora é **escrever** em nome de aluno: pela ADR 014 isso
não existe em lugar nenhum do produto — o profissional oferece a partir da conta dele, e o aceite
do aluno roda sob o `userId` do aluno.

### Fica como está — CRUD por entidade

`log_*` / `get_*` / `list_*` / `update_*` / `delete_*` para refeição, item de refeição,
peso, passos, água, meta, plano, sessão e série.

Parecem repetitivos, mas cada um opera numa entidade distinta com input distinto. Fundir
em algo como `mutate_record({ entity, op, payload })` trocaria 40 schemas tipados por um
schema genérico — exatamente o oposto do que faz uma tool ser legível para um LLM. O custo
de nomes previsíveis é baixo; o de um schema polimórfico é alto.

O argumento acima responde a "fundir tudo numa tool genérica?", e a resposta continua sendo não.
Ele **não** responde a "expor intenção em vez de entidade?" — que é outra pergunta, e que
`get_today_summary` ("reduz N chamadas a 1") já responde com sim para um caso. Se vale para o
catálogo inteiro é o que [`eval-fronteira-de-tools.md`](./eval-fronteira-de-tools.md) mede, e até
lá esta seção descreve uma decisão sem medida, não uma medida.

### Fica — `get_personal_record` **e** `list_personal_records`

Sobreposição aparente, propósitos distintos: um responde "meu PR no supino", o outro "meus
PRs". Sem o `list_`, o segundo caso viraria N chamadas.

O mesmo raciocínio vale para `get_water_for_date` × `get_water_history` × `get_water_progress`
e `get_steps_for_date` × `get_steps_history` × `get_steps_progress`: ponto, série e
estatística agregada são perguntas diferentes com custos de resposta diferentes.

### Fica — `get_exercise_details` **e** `explain_form`

`get_exercise_details` recebe ID; `explain_form` recebe nome com busca parcial. A segunda
existe porque o usuário pergunta "como faz agachamento?", não "como faz o exercício 42?".
Sem ela, o Claude teria de fazer `search_exercise` → `get_exercise_details` em toda pergunta
sobre execução.

### Fica — `complete_goal`

É açúcar sobre `update_goal({ status: "completed" })`. Mantida porque "concluí a meta" é uma
intenção frequente e nomeá-la evita que o modelo tenha de conhecer o enum de status.

### Adicionada — `update_workout_session`

Estava documentada em `docs/MCP.md` mas **nunca foi implementada** como tool, embora
`WorkoutSessionService.update` e `PATCH /workout/sessions/:id` existissem. Era um gap real
entre REST e MCP, não uma tool a mais: o PWA conseguia editar as notas de uma sessão e o
Claude não. Exposta em `apps/api/src/workout/mcp/update-workout-session.tool.ts`.

A doc antiga também prometia `startedAt?` no input, que o `UpdateSessionDto` nunca aceitou —
corrigido para refletir o contrato real (`notes` apenas).

### Renomeadas na doc — `start_workout`, `finish_workout`

O código já usava `start_workout_session` e `finish_workout_session`; a doc ficou nos nomes
antigos. Corrigido — e o teste-guarda impede que volte a divergir.

## Planejadas pelo redesign

O redesign (história #367) traz recursos novos do aluno, e pela ADR 006 cada um chega com tool. Os
nomes abaixo são os propostos nas issues; **nenhuma existe ainda**, e por isso não entram na
contagem do topo nem no `MCP.md`. Cada uma entra no PR da sua issue, com teste no `tool-catalog.spec.ts`,
seção no `MCP.md` e a contagem atualizada (ver [`DADOS_REDESIGN.md`](./DADOS_REDESIGN.md)).

Já entregue pelo redesign: `get_weekly_muscle_summary` (#369), a mesma leitura dos cards da aba
Treino (`GET /workout/muscles/week`), com seção no `MCP.md` e na contagem do topo.
Também entregues: `list_inbox` e `mark_inbox_read` (#373), a central de avisos do sino no Hoje
(`GET /users/me/inbox` e `POST /users/me/inbox/read`). Marcar como lido é escrita reversível e
idempotente, por isso `confirmableHint` no chat hospedado; o id do corpo só marca aviso de quem
chama. Também entregues: `list_reminders`, `create_reminder`, `update_reminder`, `delete_reminder`,
`get_notification_settings` e `update_notification_settings` (#389), os lembretes pessoais e as
preferências de aviso, nas mesmas rotas do app (`/users/me/reminders`, `/users/me/quiet-hours`,
`/users/me/notification-settings`). Criar, alterar e mudar preferência são escritas reversíveis
(`confirmableHint`); apagar lembrete é destrutiva. O lembrete de hábito fica fora do schema até os
hábitos (#390). O `get_today_summary` passou a trazer as metas do dia (N de M, por meta), o contrato do
"Para fazer" e os avisos não lidos — a mesma resposta do `GET /dashboard/today`.
Também entregues: `get_nutrition_plan`, `accept_nutrition_plan`, `log_plan_meal`,
`swap_plan_item` e `undo_plan_swap` (#376), o plano alimentar que o profissional enviou, nas
mesmas rotas do app (`/nutrition/plan`). Só a leitura é livre; aceitar (muda as metas do dia),
registrar, trocar e desfazer são escritas reversíveis (`confirmableHint`). Nenhuma tool cria ou
sugere plano: ele é autoral da equipe ([ADR 045](./ADR/045-plano-alimentar-autoral.md)), e o
editor (#407) fica no painel, em REST.
Também entregues: `list_plan_offers`, `accept_plan_offer` e `decline_plan_offer` (#379), o plano de
treino que a equipe enviou, nas mesmas rotas do app (`/plan-offers`), e a agenda de treinos do
aluno, `list_planned_sessions` e `reschedule_planned_session` (`/workout/agenda`, informativa pela
ADR 042). Aceitar, recusar e remarcar são escritas reversíveis (`confirmableHint`); o "Desfazer" da
recusa é o próprio `accept_plan_offer` sobre a versão recusada. `create_training_block` passou a
aceitar `weeks` de 3 a 6. Enviar e atualizar a oferta é da equipe e fica em REST
(`/professional/students/:membershipId/plan-offers`).
Também entregue: `save_session_as_plan` (#381), o "Salvar como plano" do detalhe da sessão
(`POST /workout/sessions/:id/plan`), escrita reversível (`confirmableHint`), idempotente por sessão
(repetir devolve o plano já criado) e só para sessão terminada (a aberta é `CONFLICT`). `list_workout_sessions`
passou a trazer o tipo de cada sessão (`kind`: plano, circuito ou livre, pelo retrato do plano
gravado ao começar, que sobrevive à exclusão do plano) e a filtrar por
ele; a sensação já vinha na linha. O treino livre é o `start_workout_session` sem `planId`, como
sempre — só ficou documentado. O histórico com totais (`GET /workout/history`) é leitura de tela e
não ganhou tool: `list_workout_sessions` responde as mesmas perguntas.

| Recurso                            | Tools propostas                                                                                                                        | Issue |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| Hábitos e visitas                  | `list_habits`, `create_habit`, `log_habit`, `update_habit`, `delete_habit`, `list_gym_visits` (só leitura; o check-in por QR é câmera) | #390  |
| Avaliação física                   | `list_assessments`, `get_assessment`, `log_assessment`, `compare_assessments`, `list_assessment_requests`, `submit_assessment_request` | #383  |
| Agenda da comunidade (ADR 042)     | `list_group_agenda` (leitura), `set_agenda_interest` / `clear_agenda_interest` ("Vou"), `register_agenda_session`                      | #397  |
| Circuitos                          | formato de circuito em `create_workout_plan` e rounds/tempo na sessão (tool própria só se a sessão não comportar)                      | #380  |
| Questionários                      | `list_pending_questionnaires`, `get_questionnaire`, `answer_questionnaire`                                                             | #391  |
| Foto da refeição (ADR 038, item 7) | as tools de refeição **só indicam** se há foto; `delete_meal_photo`; nenhuma tool manda a foto à IA hospedada (ADR 018)                | #374  |
| Desafios por tipo (ADR 044)        | `get_my_challenge_progress`; sem tool de check-in com foto (câmera) nem de revisão (administração)                                     | #395  |

Continua valendo a decisão de cima: **a administração da comunidade fica fora do MCP** — criar e
enviar plano, pedir e registrar avaliação em nome do aluno, criar aula, montar questionário,
revisar check-in, papéis, programas e ofertas — salvo uma ADR nova (#343). O modo automático por
categoria também fica fora: o conector usa a confirmação do cliente da pessoa (ADR 039, item 8).

## Revisitar antes da submissão

- [ ] **Medir uso real** por tool na instância hospedada (depende da observabilidade da #39).
      Tool sem nenhuma invocação em 90 dias é candidata a corte — hoje seria decisão no escuro.
- [ ] **`update_timezone` × `update_me`**: `update_me` já aceita `timezone`. A tool dedicada é
      redundante, mas é barata e o fuso é a configuração que mais afeta a leitura de datas.
      Cortar depende do item acima.
- [ ] Se a Anthropic sinalizar um teto de tools na submissão, o primeiro corte é o conjunto
      `delete_*` de logs pontuais (`delete_water_log`, `delete_step_log`), cuja correção
      cabe no `update_*` correspondente.
