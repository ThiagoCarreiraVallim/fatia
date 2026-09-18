# Eval da fronteira de tools — espelho de CRUD × intenção

> O conjunto de tarefas mora em [`apps/agent/eval/tarefas-fronteira.jsonl`](../apps/agent/eval/tarefas-fronteira.jsonl).
> Este documento é o desenho: o que se mede, contra o quê, e o que invalida o número.

## A pergunta

O catálogo MCP do Fatia espelha o modelo de dados: `log_*` / `get_*` / `list_*` / `update_*` /
`delete_*` por entidade. A decisão está registrada e defendida em
[`MCP_TOOL_SURFACE.md`](./MCP_TOOL_SURFACE.md) §"Fica como está — CRUD por entidade", e o
argumento é bom: fundir em `mutate_record({ entity, op, payload })` trocaria schemas tipados por
um schema polimórfico, que é pior de ler para um modelo.

Só que esse argumento responde a "fundir tudo em uma tool genérica?" — e a resposta é não. Ele
**não** responde a "expor intenção em vez de entidade?", que é outra pergunta. `get_today_summary`
já é a segunda coisa, e a própria descrição dela diz o porquê: _"Reduz N chamadas a 1"_. Ela existe
porque alguém percebeu que `get_nutrition_summary` + `get_water_for_date` + `get_steps_for_date` +
`get_streak` é uma composição que o agente estava fazendo à mão, toda vez, pagando round-trip e
token por cada perna.

A pergunta deste eval é se isso vale para o catálogo inteiro, e **quanto**: o ganho de redesenhar a
fronteira é maior ou menor que o ganho de trocar de modelo?

## O eixo não é a contagem de tools

A contagem é consequência. O eixo é o **nível de abstração**: a tool nomeia uma linha de tabela
(`update_meal_item`) ou uma intenção (`corrigir_refeicao`)? Quando ela nomeia a linha, quem compõe
é o agente — e compor custa uma chamada, um round-trip e um contexto a mais por perna. Quando ela
nomeia a intenção, quem compõe é o backend, que já sabe fazer isso porque o PWA faz a mesma
composição do lado de cá.

É granularidade de API com um consumidor novo: um planejador não-determinístico que paga por token.

## Os dois braços

Nenhum dos dois toca banco, service ou regra de negócio. A diferença é **só** qual conjunto de
tools o `/mcp` anuncia, e o que cada uma compõe antes de responder.

| | Braço A (hoje) | Braço B (intenção) |
| --- | --- | --- |
| Tools anunciadas | 103 | 20 |
| Granularidade | uma entidade por tool | uma intenção por tool |
| Quem compõe | o agente, encadeando | o backend, dentro do `execute` |
| Lógica de negócio | a mesma | a mesma |

### Como alternar entre eles

Um header na requisição do `/mcp` — não um deploy, não um branch, não um segundo processo.
`McpToolRegistry.bindAll` já decide **o que registrar** a cada requisição; o recorte por
superfície entra no mesmo lugar em que a autorização já entra, e pelo mesmo motivo: tool não
registrada não aparece no `tools/list` e não existe para o modelo.

Isso é o que torna "uma variável por vez" mecânico em vez de disciplinar. Mesma imagem, mesmo
banco, mesmo modelo, mesmo prompt, mesmas tarefas — um header de diferença.

### As 20 tools do braço B

Derivadas do conjunto de tarefas, não de arquitetura no papel: cada uma existe porque pelo menos
uma tarefa real a pede. Sobre os mesmos services de hoje.

| Tool | Compõe (braço A) |
| --- | --- |
| `consultar_dia` | `get_nutrition_summary` + `get_nutrition_goals` + `get_water_for_date` + `get_steps_for_date` + `get_streak` |
| `consultar_periodo` | os `get_*_history` / `get_*_progress` de um domínio, por janela |
| `consultar_refeicoes` | `list_meals` + `get_meal` |
| `registrar_refeicao` | `search_food` (N) + `log_meal` + `add_meal_item` (N) |
| `corrigir_refeicao` | `list_meals` + `get_meal` + `update_meal_item` / `delete_meal_item` |
| `registrar_alimento_proprio` | `create_custom_food` |
| `definir_meta_nutricional` | `set_nutrition_goals` / `set_nutrient_target` |
| `registrar_medida` | `log_water` / `log_steps` / `log_weight`, resolvendo data relativa |
| `iniciar_treino` | `list_workout_plans` + `get_workout_plan` + `start_workout_session` |
| `registrar_serie` | `get_active_workout_session` + `search_exercise` + `log_set` (N) |
| `encerrar_treino` | `get_active_workout_session` + `finish_workout_session` |
| `consultar_exercicio` | `search_exercise` + `get_last_set_for_exercise` / `get_personal_record` / `get_strength_progress` / `get_cardio_progress` / `get_load_prescription` / `explain_form` |
| `editar_plano_de_treino` | `list_workout_plans` + `search_exercise` + `add_exercise_to_plan` / `remove_exercise_from_plan` / `reorder_plan_exercises` |
| `consultar_metas` | `list_goals` + `get_goal` + `list_achievements` |
| `concluir_meta` | `list_goals` + `complete_goal` |
| `atualizar_perfil` | `update_me` / `update_timezone` |
| `consultar_compartilhamento` | `list_data_sharing` + `list_data_access_log` |
| `gerenciar_compartilhamento` | `list_my_groups` + `grant_data_sharing` / `revoke_data_sharing` |
| `consultar_aluno` | `list_my_students` + `get_student_progress` |
| `exportar_dados` | `export_my_data` |

São 20, e não os "12 a 15" que o desenho inicial supunha. O número saiu das tarefas: espremer
abaixo disso exigiria um parâmetro `tipo` polimórfico, que é exatamente o desenho que a
`MCP_TOOL_SURFACE.md` descarta com razão. 103 → 20 já é o corte que a tese prevê; forçar 103 → 12
seria trocar um erro de granularidade por outro.

**As anotações continuam obrigatórias no braço B.** `readOnlyHint`, `destructiveHint` e
`confirmableHint` são o que a política de 3 camadas ([ADR 022](./ADR/022-classificacao-3-camadas-do-chat.md))
deriva, e `tool-catalog.spec.ts` as exige. Uma tool de intenção que compõe leitura **e** escrita
não teria anotação honesta — por isso `corrigir_refeicao` é confirmável inteira, e não "leitura que
às vezes grava".

## O que se mede

Seis métricas, e onde cada uma já existe:

| # | Métrica | Estado |
| --- | --- | --- |
| 1 | Acertou **qual** tool | falta o comparador de sequência |
| 2 | Acertou **como** (parâmetros) | falta |
| 3 | Chamadas por tarefa | o agente já conta rodada e tool por rodada |
| 4 | Tokens até a primeira resposta útil | `events.usage` já emite `input_units` / `output_units` |
| 5 | Latência p50 / p95 | `McpMetricsService` já grava histograma por tool; falta agregar por tarefa |
| 6 | Tool destrutiva invocada indevidamente | falta o rótulo de armadilha por tarefa — já está no `.jsonl` |

O que **não** se mede: se a resposta ficou boa. É outra pergunta e não se responde contando
tokens.

### A métrica 3 tem um piso conhecido antes de qualquer modelo rodar

Cada tarefa do `.jsonl` declara `passos_min_a` e `passos_min_b`: o menor número de chamadas que
resolve aquele pedido em cada braço, contado à mão sobre o catálogo real. Somados nas 43 tarefas:
**57 chamadas no braço A, 41 no braço B**.

Esse é o piso estrutural — o que a fronteira muda antes de o modelo entrar. O que o eval mede por
cima disso é o **excesso**: quantas chamadas o agente gasta acima do mínimo, em cada braço. Um
modelo que gasta 90 onde o piso é 57 está pagando 33 chamadas de imposto de composição; o mesmo
modelo no braço B tem 16 chamadas a menos de piso e, a hipótese diz, menos excesso também, porque
há menos encadeamento onde errar.

Separar piso de excesso é o que impede a conclusão preguiçosa. Se o braço B ganhar só o piso, o
achado é "a fachada corta chamadas" — verdadeiro e sem graça. Se cortar também o excesso, o achado
é "a fronteira muda o comportamento do planejador", que é a tese.

### A métrica 6 precisa do braço sem política

A política de 3 camadas já **impede** que `delete_my_account` chegue ao modelo no chat hospedado:
ela é RESTRICTED, não entra no `tools/list`, e `exigir_permitida` recusa mesmo se o modelo inventar
o nome. Medir a métrica 6 contra o chat hospedado mediria a política, não a fronteira — e daria
zero nos dois braços.

O que a métrica 6 descreve é o **cliente MCP externo**, que recebe as 103 sem recorte nenhum. Por
isso ela roda num terceiro braço, com o catálogo cru dos dois lados, e as oito tarefas com campo
`armadilha` no `.jsonl` são o instrumento: cada uma nomeia a tool destrutiva que fica a uma
alucinação de distância do pedido legítimo.

`risco-exportar` ("quero levar meus dados embora") é o caso central: o vizinho semântico de "apaga
tudo" é `export_my_data`, e discriminar os dois é exatamente o que a superfície larga dificulta.

## Rigor

- **Uma variável por vez.** Não mudar recorte e descrição na mesma rodada. O header existe para
  isso.
- **Repetição.** 5 execuções por tarefa, reportando dispersão junto da média. Variância maior que o
  ganho é ausência de ganho, e precisa aparecer no slide.
- **Congelar o conjunto.** Mexer nas tarefas depois de começar a medir destrói a comparação. O
  `.jsonl` segue a mesma disciplina do eval de reconhecimento: o que muda o conjunto muda a
  impressão digital dele.
- **Distratores.** O braço B tem 20 tools; o A tem 103. Comparar seleção entre conjuntos de tamanho
  diferente já é a medida, mas dentro de cada braço vale conferir se a tarefa tem vizinho próximo —
  `agua-hoje` tem dois (`get_water_history`, `get_water_progress`) e está marcado.
- **Mesmo modelo, mesma temperatura, mesmas tarefas entre braços.** O que varia é o header.

### O ledger vale aqui igual

O eval de reconhecimento de refeição recusa repetir uma medição com o mesmo prompt, o mesmo modelo
e o mesmo conjunto, e grava cada medição publicada num `.jsonl` versionado
(ver [`apps/agent/eval/README.md`](../apps/agent/eval/README.md)). A razão é a mesma aqui: "rodar
de novo, quem sabe melhora" é vazamento, e só vira visível se ficar no diff.

## Fora de escopo

**Retrieval de tools** (`find_tools` semântico, padrão RAG-MCP) e **execução de código com MCP**.
Os dois são a continuação natural, e os dois mudariam mais de uma variável de uma vez. Execução de
código pede cautela extra: ela reintroduz, por outro caminho, a superfície destrutiva que a ADR 022
fecha.

## O que isso não prova

Que o desenho de intenção é melhor **em geral**. Prova, no máximo, que neste catálogo, com estas 43
tarefas e estes modelos, a fronteira mexeu mais que o modelo — ou que não mexeu. A versão genérica
da tese já foi publicada (_Agent-First Tool APIs_, arXiv 2605.10555); o que não existe publicado é
a medida em cima de um catálogo de produto com histórico, e é essa que este eval produz.
