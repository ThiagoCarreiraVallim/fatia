# ADR 045 — Plano alimentar e receitas autorais: escritos pela equipe, nunca sugeridos pela IA

**Status:** Accepted
**Data:** 2026-11-15
**Relacionada:** PRD §5 ("Sugestão automática de receitas"), [ADR 014](./014-compartilhamento-b2b-copia-e-vinculo.md),
[ADR 027](./027-desafios-por-aderencia-a-propria-meta.md), issues #376, #407, #405 e #334

## Contexto

O PRD proíbe a **sugestão automática de receitas** gerada por IA, e o não-objetivo "Conteúdo
próprio do Fatia" diz que planos e dietas são da equipe de cada comunidade. O redesign (#376,
pranchas `Al-N5`, `Al-N5b`, `Al-N5c`) traz o plano alimentar individual: refeições com opções,
alimentos com quantidade, equivalentes para troca e metas do dia. Um plano prescreve alimentos, e
sem uma regra escrita a próxima pessoa pode ler "o app monta o cardápio" — que é exatamente o que o
PRD veta.

A #334 (receitas com macros por porção) fez a mesma pergunta e pediu esta ADR antes de começar.

## Decisão

1. **O plano alimentar é autoral.** Quem escreve é um profissional da equipe (o editor é a #407; o
   envio, a #405). Nenhuma parte do plano — refeição, opção, alimento, quantidade ou equivalente — é
   gerada, completada ou sugerida pela IA hospedada ou pelo MCP. As tools do MCP só **leem**, aceitam,
   registram e trocam (`get_nutrition_plan`, `accept_nutrition_plan`, `log_plan_meal`,
   `swap_plan_item`, `undo_plan_swap`); não existe tool que crie plano.
2. **Só alimentos da base.** Itens e equivalentes apontam para o catálogo público (TACO e o que
   vier dele), com macros calculados na hora do envio e guardados como retrato. O alimento
   personalizado de uma conta não entra no plano de outra.
3. **O plano é do aluno.** A linha (`NutritionPlan.userId`) é dele: sai no export e com a conta
   dele. O autor apagar a conta não apaga o plano (o autor vira nulo). Aceitar é ato do aluno, com
   confirmação, e só então as faixas viram metas do dia e as refeições viram refeições salvas dele —
   a cópia da ADR 014.
4. **Trocas e aderência seguem o consentimento.** A equipe só vê consumo, trocas e aderência com
   Alimentação (`NUTRITION`) liberada, e cada leitura passa por `ProfessionalAccessService` e fica em
   `ProfessionalAccessLog`. A aderência é a métrica da ADR 027: dias com as calorias dentro da faixa
   da própria pessoa, só a contagem.
5. **Receita autoral (#334) segue a mesma regra** quando entrar: criada por uma pessoa (aluno ou
   equipe), nunca sugerida pela IA. Esta ADR não abre a #334; ela continua em discussão.

## Consequências

### Positivas

- O plano chega sem tocar no não-objetivo, e o limite fica escrito para o editor (#407).
- O aluno é dono do que recebeu: export, exclusão e consentimento valem sem caso especial.

### Negativas

- O profissional monta tudo à mão: não há "gerar cardápio". É a escolha, não um atraso.
- Equivalentes de alimento personalizado do aluno ficam de fora; só a base.

### Neutras

- As metas do plano são faixas, como `UserGoals`; o cabeçalho mostra o meio da faixa de calorias.

## Alternativas consideradas

- **IA propõe o plano e o profissional revisa:** é sugestão automática com um carimbo humano; o PRD
  veta e a responsabilidade clínica ficaria difusa.
- **Plano como `GroupPlanTemplate` de nutrição (Fase 7):** o modelo da comunidade é público para os
  membros e não tem opções, equivalentes nem trocas por dia; o plano individual é dado de saúde de
  uma pessoa.
