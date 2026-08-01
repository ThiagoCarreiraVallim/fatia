# Guia de validação do conector — Fatia

> Roteiro para exercitar as **87 tools** do conector ponta a ponta, exigido pelo
> "before you submit" da submissão ao diretório (issue #171).
>
> Serve para duas coisas: você rodar antes de submeter, e o reviewer da Anthropic
> seguir depois. As duas audiências precisam do mesmo caminho.

## Conta de teste

|              |                                                              |
| ------------ | ------------------------------------------------------------ |
| **App**      | `https://app.fat.ia.br`                                      |
| **Conector** | `https://api.fat.ia.br/mcp`                                  |
| **Usuário**  | `Tester`                                                     |
| **Senha**    | fornecida no campo de credenciais do formulário de submissão |

> ⚠️ A senha **não fica neste arquivo**. O repositório é público sob licença MIT —
> commitar a senha daria a qualquer pessoa uma conta funcionando na instância de
> produção. O portal de submissão tem campo próprio para credenciais de teste.

## Como conectar

1. No Claude: **Settings → Connectors → Add custom connector**
2. Cole `https://api.fat.ia.br/mcp`
3. O Claude abre a tela de login do Fatia — entre com a conta acima e autorize

Não há client ID, secret nem token para copiar: o servidor registra o cliente
sozinho por Dynamic Client Registration. **Se o Claude pedir alguma credencial
além do login, é bug** — reporte antes de seguir.

## Antes de começar: a ordem importa

O roteiro está ordenado para que cada leitura tenha o que ler. Rodar fora de
ordem faz tools legítimas devolverem vazio, o que parece defeito e não é.

Concretamente: a conta de teste chega com nutrição, peso, passos, água e metas
povoados, mas **sem treino**. O bloco 3 cria plano e sessão justamente para que
os 30 tools de treino tenham contra o que responder. Não pule.

## Como marcar

Cada tool tem uma linha na tabela do fim. Marque conforme executa.

- 🔍 **leitura** — não altera nada, pode repetir à vontade
- ✏️ **escrita** — cria ou altera; o Claude executa sem pedir confirmação
- 🗑️ **destrutiva** — apaga; o Claude **sempre** pede confirmação antes

Se o Claude executar uma 🗑️ sem confirmar, ou pedir confirmação numa ✏️, a
anotação da tool está errada — vale reportar.

---

## Bloco 1 — Perfil e conta

Frases para dizer ao Claude:

```
Quem sou eu no Fatia?
Meu nome é Tester e tenho 1,75 m
Meu fuso horário é America/Sao_Paulo
```

Confere: o nome e a altura voltam no `get_me` seguinte.

## Bloco 2 — Nutrição

```
Busca "arroz" no catálogo de alimentos
Quais grupos de alimentos existem?
Comi 150 g de arroz cozido e 100 g de feijão carioca no almoço
Quantas calorias eu comi hoje?
Mostra minhas refeições de hoje
Acrescenta 120 g de frango grelhado nesse almoço
Muda o frango para 180 g
Qual meu resumo nutricional da semana?
Define minha meta de proteína em 160 g por dia
Quais são minhas metas de nutrientes?
Cria um alimento chamado "Whey da marca X" com 24 g de proteína por 30 g
```

Confere: os totais mudam a cada item acrescentado, e o alimento custom aparece
na busca seguinte.

> **Idempotência:** registrar a mesma refeição duas vezes (mesmo horário, mesmo
> tipo, mesmos itens) devolve `CONFLICT` apontando a refeição existente, em vez
> de duplicar. É comportamento esperado, não erro — vale testar de propósito.

## Bloco 3 — Treino (cria o que os blocos seguintes leem)

**Não pule este bloco.** A conta chega sem treino nenhum.

```
Busca o exercício "supino"
Quais exercícios existem para peito?
Me explica a execução do agachamento
Cria um plano de treino chamado "Push A"
Adiciona supino reto ao Push A, 4 séries de 8
Adiciona desenvolvimento militar ao Push A, 3 séries de 10
Reordena para o desenvolvimento vir primeiro
Começa o treino Push A
Supino 4 séries de 8 com 70 kg
Desenvolvimento 3 séries de 10 com 30 kg
Corri 5 km em 27 minutos
Qual foi minha última carga no supino?
Termina o treino
```

Confere: ao iniciar, o Claude deve trazer os exercícios do plano já preenchidos;
ao terminar, deve resumir volume e duração.

## Bloco 4 — Progresso

Agora que há treino registrado, estas respondem com dado real:

```
Quanto eu progredi no supino?
Qual meu recorde no supino?
Lista meus recordes pessoais
Pesei 78,4 kg hoje
Como está minha evolução de peso?
Bebi 500 ml de água
Quanto de água eu bebi hoje?
Andei 8500 passos hoje
Como está minha média de passos esse mês?
Qual meu resumo de hoje?
E o da semana?
```

## Bloco 5 — Metas

```
Quero chegar a 75 kg até dezembro
Como estão minhas metas?
Atualiza meu peso atual na meta para 78,4
Marca a meta de treinar 4x por semana como concluída
```

## Bloco 6 — Conta e LGPD

```
Exporta todos os meus dados
```

Confere: volta um JSON com refeições, treinos, pesos, passos, metas e perfil.

> ⚠️ **Não execute `delete_my_account` na conta de teste** — ela apaga tudo, sem
> volta, e o reviewer seguinte fica sem conta. A tool exige a confirmação literal
> `DELETAR MINHA CONTA`, então não dispara por acidente. Para validá-la, crie uma
> conta descartável em `https://app.fat.ia.br` e apague essa.

## Bloco 7 — Exclusões

Deixadas por último de propósito: apagam o que os blocos anteriores criaram.

```
Apaga o registro de água de hoje
Apaga o registro de passos de hoje
Apaga o peso que registrei hoje
Remove o desenvolvimento militar do plano Push A
Apaga a série de desenvolvimento
Apaga a sessão de treino de hoje
Apaga o plano Push A
Remove o alimento "Whey da marca X"
Apaga a meta de chegar a 75 kg
Remove a meta de proteína
Apaga o almoço de hoje
```

Confere: o Claude **pede confirmação em cada uma**. Se executar direto, a
anotação `destructiveHint` não chegou ao cliente.

---

## O que caracteriza falha

Do critério de review: _"Every tool must return a successful response when called
with valid parameters."_ E erro genérico reprova.

Reporte se encontrar:

- erro sem detalhe — `Internal Server Error`, `Bad Request` sem dizer o quê
- tool que responde vazio onde deveria haver dado (verifique a ordem dos blocos antes)
- 🗑️ executada sem confirmação, ou ✏️ pedindo confirmação
- qualquer pedido de credencial além do login inicial

Os erros do Fatia trazem categoria e o que fazer, por exemplo:

```
[NOT_FOUND] Goal not found
O recurso não existe ou não pertence a este usuário. Confirme o ID com a tool de listagem correspondente.
```

## Checklist das 87 tools

### Perfil (3)

|  ✔  | Tool              | O que é                | Tipo       |
| :-: | ----------------- | ---------------------- | ---------- |
|  ☐  | `get_me`          | Ver meu perfil         | 🔍 leitura |
|  ☐  | `update_me`       | Atualizar meu perfil   | ✏️ escrita |
|  ☐  | `update_timezone` | Atualizar fuso horário | ✏️ escrita |

### Nutrição (22)

|  ✔  | Tool                     | O que é                          | Tipo          |
| :-: | ------------------------ | -------------------------------- | ------------- |
|  ☐  | `add_meal_item`          | Adicionar item à refeição        | ✏️ escrita    |
|  ☐  | `create_custom_food`     | Criar alimento personalizado     | ✏️ escrita    |
|  ☐  | `delete_custom_food`     | Excluir alimento personalizado   | 🗑️ destrutiva |
|  ☐  | `delete_meal`            | Excluir refeição                 | 🗑️ destrutiva |
|  ☐  | `delete_meal_item`       | Excluir item da refeição         | 🗑️ destrutiva |
|  ☐  | `delete_nutrient_target` | Excluir meta de nutriente        | 🗑️ destrutiva |
|  ☐  | `get_food`               | Ver alimento                     | 🔍 leitura    |
|  ☐  | `get_meal`               | Ver refeição                     | 🔍 leitura    |
|  ☐  | `get_nutrient_summary`   | Resumo de nutrientes do dia      | 🔍 leitura    |
|  ☐  | `get_nutrition_goals`    | Ver metas nutricionais           | 🔍 leitura    |
|  ☐  | `get_nutrition_history`  | Histórico de nutrição            | 🔍 leitura    |
|  ☐  | `get_nutrition_summary`  | Resumo nutricional do dia        | 🔍 leitura    |
|  ☐  | `list_food_groups`       | Listar grupos de alimentos       | 🔍 leitura    |
|  ☐  | `list_meals`             | Listar refeições                 | 🔍 leitura    |
|  ☐  | `list_nutrient_targets`  | Listar metas de nutrientes       | 🔍 leitura    |
|  ☐  | `log_meal`               | Registrar refeição               | ✏️ escrita    |
|  ☐  | `search_food`            | Buscar alimento                  | 🔍 leitura    |
|  ☐  | `set_nutrient_target`    | Definir meta de nutriente        | ✏️ escrita    |
|  ☐  | `set_nutrition_goals`    | Definir metas nutricionais       | ✏️ escrita    |
|  ☐  | `update_custom_food`     | Atualizar alimento personalizado | ✏️ escrita    |
|  ☐  | `update_meal`            | Atualizar refeição               | ✏️ escrita    |
|  ☐  | `update_meal_item`       | Atualizar item da refeição       | ✏️ escrita    |

### Treino (30)

|  ✔  | Tool                         | O que é                           | Tipo          |
| :-: | ---------------------------- | --------------------------------- | ------------- |
|  ☐  | `add_exercise_to_plan`       | Adicionar exercício ao plano      | ✏️ escrita    |
|  ☐  | `clone_exercise`             | Duplicar exercício                | ✏️ escrita    |
|  ☐  | `create_custom_exercise`     | Criar exercício personalizado     | ✏️ escrita    |
|  ☐  | `create_workout_plan`        | Criar plano de treino             | ✏️ escrita    |
|  ☐  | `delete_custom_exercise`     | Excluir exercício personalizado   | 🗑️ destrutiva |
|  ☐  | `delete_set`                 | Excluir série                     | 🗑️ destrutiva |
|  ☐  | `delete_workout_plan`        | Excluir plano de treino           | 🗑️ destrutiva |
|  ☐  | `delete_workout_session`     | Excluir sessão de treino          | 🗑️ destrutiva |
|  ☐  | `explain_form`               | Explicar execução do exercício    | 🔍 leitura    |
|  ☐  | `finish_workout_session`     | Finalizar treino                  | ✏️ escrita    |
|  ☐  | `get_active_workout_session` | Ver treino em andamento           | 🔍 leitura    |
|  ☐  | `get_exercise_details`       | Ver detalhes do exercício         | 🔍 leitura    |
|  ☐  | `get_last_set_for_exercise`  | Última série do exercício         | 🔍 leitura    |
|  ☐  | `get_personal_record`        | Ver recorde pessoal               | 🔍 leitura    |
|  ☐  | `get_workout_plan`           | Ver plano de treino               | 🔍 leitura    |
|  ☐  | `get_workout_session`        | Ver sessão de treino              | 🔍 leitura    |
|  ☐  | `list_exercises_by_muscle`   | Listar exercícios por músculo     | 🔍 leitura    |
|  ☐  | `list_personal_records`      | Listar recordes pessoais          | 🔍 leitura    |
|  ☐  | `list_workout_plans`         | Listar planos de treino           | 🔍 leitura    |
|  ☐  | `list_workout_sessions`      | Listar sessões de treino          | 🔍 leitura    |
|  ☐  | `log_set`                    | Registrar série                   | ✏️ escrita    |
|  ☐  | `remove_exercise_from_plan`  | Remover exercício do plano        | 🗑️ destrutiva |
|  ☐  | `reorder_plan_exercises`     | Reordenar exercícios do plano     | ✏️ escrita    |
|  ☐  | `search_exercise`            | Buscar exercício                  | 🔍 leitura    |
|  ☐  | `start_workout_session`      | Iniciar treino                    | ✏️ escrita    |
|  ☐  | `update_custom_exercise`     | Atualizar exercício personalizado | ✏️ escrita    |
|  ☐  | `update_plan_exercise`       | Atualizar exercício do plano      | ✏️ escrita    |
|  ☐  | `update_set`                 | Atualizar série                   | ✏️ escrita    |
|  ☐  | `update_workout_plan`        | Atualizar plano de treino         | ✏️ escrita    |
|  ☐  | `update_workout_session`     | Atualizar sessão de treino        | ✏️ escrita    |

### Progresso (24)

|  ✔  | Tool                    | O que é                      | Tipo          |
| :-: | ----------------------- | ---------------------------- | ------------- |
|  ☐  | `delete_step_log`       | Excluir registro de passos   | 🗑️ destrutiva |
|  ☐  | `delete_water_log`      | Excluir registro de água     | 🗑️ destrutiva |
|  ☐  | `delete_weight_log`     | Excluir registro de peso     | 🗑️ destrutiva |
|  ☐  | `get_cardio_progress`   | Evolução no cardio           | 🔍 leitura    |
|  ☐  | `get_steps_for_date`    | Passos de um dia             | 🔍 leitura    |
|  ☐  | `get_steps_history`     | Histórico de passos          | 🔍 leitura    |
|  ☐  | `get_steps_progress`    | Evolução dos passos          | 🔍 leitura    |
|  ☐  | `get_strength_progress` | Evolução de força            | 🔍 leitura    |
|  ☐  | `get_today_summary`     | Resumo de hoje               | 🔍 leitura    |
|  ☐  | `get_volume_progress`   | Evolução do volume de treino | 🔍 leitura    |
|  ☐  | `get_water_for_date`    | Água de um dia               | 🔍 leitura    |
|  ☐  | `get_water_history`     | Histórico de água            | 🔍 leitura    |
|  ☐  | `get_water_progress`    | Evolução da hidratação       | 🔍 leitura    |
|  ☐  | `get_week_summary`      | Resumo da semana             | 🔍 leitura    |
|  ☐  | `get_weight_progress`   | Evolução do peso             | 🔍 leitura    |
|  ☐  | `list_step_logs`        | Listar registros de passos   | 🔍 leitura    |
|  ☐  | `list_water_logs`       | Listar registros de água     | 🔍 leitura    |
|  ☐  | `list_weight_logs`      | Listar registros de peso     | 🔍 leitura    |
|  ☐  | `log_steps`             | Registrar passos             | ✏️ escrita    |
|  ☐  | `log_water`             | Registrar água               | ✏️ escrita    |
|  ☐  | `log_weight`            | Registrar peso               | ✏️ escrita    |
|  ☐  | `update_step_log`       | Atualizar registro de passos | ✏️ escrita    |
|  ☐  | `update_water_log`      | Atualizar registro de água   | ✏️ escrita    |
|  ☐  | `update_weight_log`     | Atualizar registro de peso   | ✏️ escrita    |

### Metas (6)

|  ✔  | Tool            | O que é        | Tipo          |
| :-: | --------------- | -------------- | ------------- |
|  ☐  | `complete_goal` | Concluir meta  | ✏️ escrita    |
|  ☐  | `create_goal`   | Criar meta     | ✏️ escrita    |
|  ☐  | `delete_goal`   | Excluir meta   | 🗑️ destrutiva |
|  ☐  | `get_goal`      | Ver meta       | 🔍 leitura    |
|  ☐  | `list_goals`    | Listar metas   | 🔍 leitura    |
|  ☐  | `update_goal`   | Atualizar meta | ✏️ escrita    |

### Conta (LGPD) (2)

|  ✔  | Tool                | O que é             | Tipo          |
| :-: | ------------------- | ------------------- | ------------- |
|  ☐  | `delete_my_account` | Apagar minha conta  | 🗑️ destrutiva |
|  ☐  | `export_my_data`    | Exportar meus dados | 🔍 leitura    |

---

## Alternativa: MCP Inspector

A submissão aceita o [MCP Inspector](https://modelcontextprotocol.io/docs/tools/inspector)
no lugar do Claude. Ele expõe cada tool isoladamente, com o schema de input, o que
ajuda a exercitar parâmetros que a conversa não alcança naturalmente — cursores de
paginação, filtros de data, campos opcionais.

```bash
npx @modelcontextprotocol/inspector
```

Aponte para `https://api.fat.ia.br/mcp` e autentique pelo mesmo fluxo OAuth.

Vale rodar os dois: o Inspector prova que a tool funciona, o Claude prova que ela é
**escolhida** na hora certa a partir de linguagem natural. Descrição ambígua passa no
primeiro e falha no segundo.
