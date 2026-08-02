# Superfície de tools MCP — revisão de consolidação

> Insumo da issue #94 (frente 4 da épica #38). A Anthropic favorece conjuntos de tools
> **focados** em vez de amplos, então a contagem importa para a submissão ao diretório de
> conectores. Este doc registra a decisão sobre o que fica, o que sai e por quê.

## Contagem atual

| Domínio                                                     |  Tools | Arquivos                       |
| ----------------------------------------------------------- | -----: | ------------------------------ |
| Workout (exercícios, planos, sessões, séries)               |     31 | `apps/api/src/workout/mcp/`    |
| Progress (peso, passos, água, progresso, dashboard, streak) |     27 | `apps/api/src/progress/mcp/`   |
| Nutrition (alimentos, refeições, itens, metas de nutriente) |     22 | `apps/api/src/nutrition/mcp/`  |
| Goals (metas pessoais)                                      |      6 | `apps/api/src/goals/mcp/`      |
| Meta (perfil)                                               |      3 | `apps/api/src/mcp/tools/meta/` |
| Conta (export e deleção — LGPD)                             |      2 | `apps/api/src/users/mcp/`      |
| Sharing (grupos — lado do aluno)                            |      3 | `apps/api/src/sharing/mcp/`    |
| **Total**                                                   | **91** |                                |

A contagem é verificada por `apps/api/src/mcp/__tests__/tool-catalog.spec.ts`, que também
garante que `docs/MCP.md` bate com o registro real.

## Por que 91 e não ~30

O Fatia é **MCP-first** por decisão de arquitetura (ADR 006): tudo que o PWA faz, o Claude
faz. Isso produz um CRUD completo por entidade — e é o que dá ao conector sua proposta de
valor, já que o usuário consegue operar o app inteiro conversando.

Cortar a superfície pela metade significaria remover capacidade real, não redundância. As
opções abaixo foram avaliadas com isso em mente.

## Tamanho do catálogo servido

O que pesa no contexto não é a contagem de tools, é o payload. Medido no que o registry
serve de fato — `name`, `title`, `description`, `annotations` e o JSON Schema do input das
94 tools: **70,4 k caracteres**, enviados em toda sessão que lista as tools.
O denominador importa. Contar só `name + description + inputSchema` dá 58,7 k e subestima o
catálogo em ~20% — `title` e `annotations` também vão no fio, em toda tool.

Dentro desse total, os exemplos de invocação que a #111 acrescentou às 48 tools de escrita
valem **4.178 caracteres** — média de **87** caracteres por tool, algo em torno de 6% do
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

Hoje são **88** tools que só leem ou gravam dado — custo de IA para a Fatia igual a zero — e
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

### Fica fora do MCP — administração de grupo (#154)

O domínio Sharing entra com **3 tools**, todas do lado do aluno: `list_my_groups`,
`join_group` e `leave_group`. Criar grupo, aprovar entrada e remover membro ficam só em REST.

A ADR 006 diz que tudo que o PWA faz o Claude faz, e a exceção é deliberada: o "PWA" em
questão é o painel do dono da academia, superfície B2B que não é o app do usuário. Manter
essas três operações fora do catálogo é o que garante que **nenhuma tool MCP pode criar um
grupo ou colocar alguém dentro de um** — a superfície conversacional só opera sobre a própria
associação de quem fala. Se o painel do dono virar produto, a decisão se reabre com o
requisito na mão, e não por simetria.

### Fica como está — CRUD por entidade

`log_*` / `get_*` / `list_*` / `update_*` / `delete_*` para refeição, item de refeição,
peso, passos, água, meta, plano, sessão e série.

Parecem repetitivos, mas cada um opera numa entidade distinta com input distinto. Fundir
em algo como `mutate_record({ entity, op, payload })` trocaria 40 schemas tipados por um
schema genérico — exatamente o oposto do que faz uma tool ser legível para um LLM. O custo
de nomes previsíveis é baixo; o de um schema polimórfico é alto.

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

## Revisitar antes da submissão

- [ ] **Medir uso real** por tool na instância hospedada (depende da observabilidade da #39).
      Tool sem nenhuma invocação em 90 dias é candidata a corte — hoje seria decisão no escuro.
- [ ] **`update_timezone` × `update_me`**: `update_me` já aceita `timezone`. A tool dedicada é
      redundante, mas é barata e o fuso é a configuração que mais afeta a leitura de datas.
      Cortar depende do item acima.
- [ ] Se a Anthropic sinalizar um teto de tools na submissão, o primeiro corte é o conjunto
      `delete_*` de logs pontuais (`delete_water_log`, `delete_step_log`), cuja correção
      cabe no `update_*` correspondente.
