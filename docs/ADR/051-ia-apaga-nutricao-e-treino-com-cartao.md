# ADR 051 — A IA apaga nutrição e treino, com cartão; o que causa dano fica no app

**Status:** Accepted
**Data:** 2026-11-23
**Altera:** [ADR 022](./022-classificacao-3-camadas-do-chat.md), regras de anotação 2 e 5 ("destrutiva
→ RESTRICTED") e a frase "apagar não é nem reversível nem confirmável".
**Complementa:** [ADR 039](./039-ia-grava-no-modo-automatico.md) — apagar continua nunca automático.

## Contexto

Pela ADR 022, toda tool com `destructiveHint` ficava RESTRICTED: o modelo nem a via. "Apaga a
refeição de ontem" virava um botão para a tela do app (`open_in_app`, #384). O argumento era que
quem clica "confirmar" confirma o que entendeu, e não o que a tool vai fazer.

Esse argumento caiu com o cartão de confirmação que existe hoje: a prévia da ação
(`apps/api/src/chat/previa/`) lê o registro no banco, pelo id que o modelo mandou e só dentro da
conta de quem pergunta, e mostra o que ele é ("Almoço de 24/09 às 12:30", "Sódio (até 2.000 mg)").
Id que não resolve para a pessoa recusa o cartão inteiro. A pessoa confirma o registro, não o que
o modelo entendeu.

O dono do produto pediu (#481) que a IA faça toda edição de nutrição e de treino, inclusive
excluir, e que só não faça o que causa dano à pessoa: compartilhar dados, excluir a conta, bloquear
e as ações de privacidade e consentimento.

## Decisão

1. **A pergunta que separa é "isto pode causar dano à pessoa?"**, e não "isto tem volta?".
2. **Confirmáveis, com cartão:** toda exclusão de nutrição, treino, água, peso e passos —
   `delete_meal`, `delete_meal_item`, `delete_meal_photo`, `delete_meal_template`,
   `delete_custom_food`, `delete_food_portion`, `delete_nutrient_target`, `delete_water_log`,
   `delete_weight_log`, `delete_step_log`, `delete_set`, `delete_workout_session`,
   `delete_workout_plan`, `remove_exercise_from_plan`, `delete_training_block` e
   `delete_custom_exercise`. Continuam `destructiveHint: true` (o cliente MCP externo segue
   confirmando) e ganham `confirmableHint: true`. Só tools de `nutrition/`, `workout/` e
   `progress/` podem ser destrutivas e confirmáveis.
3. **O cartão nomeia o que vai sumir.** Toda tool que apaga tem um campo que vira o nome do
   registro, lido só entre os registros da pessoa; o alimento, a medida e o exercício do catálogo
   não ganham nome (apagar é só o que ela criou).
4. **Apagar nunca é automático** (ADR 039, item 2). As exclusões têm categoria — "Desligado" as
   tira do catálogo com o resto da categoria —, mas não têm operação inversa, e o
   `autoEligible` da API recusa destrutiva. O agente recusa de novo pela anotação, e não só pelo
   prefixo `delete_`: `remove_exercise_from_plan` apaga sem começar assim.
5. **RESTRICTED, lista travada por teste** (`NUNCA_PELA_IA` em `tool-catalog.spec.ts`):
   - excluir a conta: `delete_my_account`;
   - compartilhar e consentir: `grant_data_sharing`, `revoke_data_sharing`, `set_group_sharing`,
     `accept_group_invite` (consente categorias ao entrar), `join_group`, `leave_group` (revoga os
     vínculos), e as de intenção `share_my_data` e `stop_sharing`;
   - exportar: `export_my_data` — o link abre sem login com todos os dados, conversas inclusive,
     e deixa de ser `readOnlyHint`;
   - bloquear: `block_user`, `unblock_user`;
   - fora do escopo da #481: `delete_goal`, `delete_reminder` (não são nutrição nem treino).
6. As escritas de nutrição sem categoria ganham a delas: `DAY_LOG` para alimento, medida,
   refeição salva, favorito e troca do plano; `GOALS` para aceitar o plano alimentar (troca as
   metas). Tool desses domínios sem categoria reprova no teste, exceto `refresh_achievements`.

## Consequências

### Positivas

- "Apaga o almoço de ontem" e "tira o supino do plano" resolvem na conversa, com um toque.
- O que causa dano fica numa lista nomeada e travada: virar confirmável exige mudar o teste.

### Negativas

- Um engano do modelo apagando o registro errado custa mais que um engano registrando. A mitigação
  é o cartão com o nome do registro, a consulta antes (o prompt manda achar o registro e perguntar
  com `ask_user` quando mais de um combina) e o não automático.
- `block_user`, `unblock_user`, `revoke_data_sharing`, `set_group_sharing` e `accept_group_invite`
  eram confirmáveis (#394, #396) e saem do chat. O cartão "só no app" leva à tela.
- O formato de cartão `file` fica sem produtor: era só o `export_my_data`.

### Neutras

- As três camadas continuam as mesmas, derivadas das anotações. O que muda é o critério de quem
  entra na do meio.
- O conector MCP externo não muda de comportamento nas exclusões (`destructiveHint` continua).
  `export_my_data` passa a ser escrita para ele.

## Alternativas consideradas

- **Liberar toda destrutiva com cartão.** Rejeitada: excluir a conta e expor dado não têm um
  cartão que torne o engano barato.
- **Lista de nomes no agente.** Rejeitada pelos motivos da ADR 022: o critério continua sendo a
  anotação servida; a lista travada mora no teste da API, que é onde a anotação nasce.
- **Manter `revoke_data_sharing` confirmável por ser o "lado seguro".** Rejeitada: consentir e
  revogar são decisões da pessoa, na tela; a IA revogar por engano corta o acompanhamento do
  profissional sem ela perceber.
