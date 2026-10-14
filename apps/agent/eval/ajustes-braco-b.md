# Ajustes do braço B

O registro de cada ajuste feito nas 18 tools de intenção durante a fase de ajuste, no split `dev`,
antes do congelamento do braço B. As regras estão em
[`docs/eval-fronteira-de-tools.md`](../../../docs/eval-fronteira-de-tools.md) §"O split, e quem se
ajusta nele".

- **O que pode mudar:** descrição, nome de campo, enum e default das 18 tools de intenção. O braço
  A, as tarefas, os gabaritos e o prompt do chat não mudam, e o `execute` não ganha lógica.
- **Um ajuste por medição**, para o efeito ser atribuível: só as tarefas do `dev` afetadas, 5
  repetições, os dois modelos, antes e depois.
- **Veredito:** útil (melhorou sem piorar outra tarefa), inútil ou prejudicial. Inútil e
  prejudicial são revertidos, e a linha fica com o motivo. Ajuste que só ajuda um modelo é
  suspeito, e a linha diz isso.
- No máximo dois ciclos de ajuste e rodada.

Os inúteis ficam aqui tanto quanto os úteis: eles mostram que mexer na descrição nem sempre
resolve.

| #   | Tool                   | Antes → depois                                                                                                                                                                                                                                                                                         | Tarefa e modelo que motivaram (erro observado)                                                                                                                                                                                | Efeito medido (acertos antes → depois, por modelo)                                                                                                                                                                                                                                                                                         | Veredito                                                                                                  |
| --- | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1   | `get_period_overview`  | Descrição de `period`: "Janela, no fuso da conta. "this_week" começa na segunda; "last_7_days" inclui hoje." → diz que `this_week` é o resumo da semana, **sem água**, e que as demais trazem kcal, água e passos dia a dia contra a meta; para "tô batendo a meta de água essa semana", `last_7_days` | `agua-meta-semana`, glm e mimo: pediam `this_week`, que compõe o `get_week_summary` e não traz água — a descrição da tool prometia água em toda janela —, e iam dia a dia com `get_day_overview` (3,6 e 4,0 chamadas, piso 1) | glm: chamadas 3,6 → 1,0, custo por execução US$ 0,00186 → 0,00078; mimo: 4,0 → 1,0, US$ 0,00490 → 0,00135. Acertos 5/5 → 5/5 nas três tarefas que usam a tool (`agua-meta-semana`, `nutri-media-semana`, `passos-semana`), nos dois modelos. `nutri-media-semana` passou a pedir `last_7_days` e ficou um pouco mais cara (resposta maior) | Útil, nos dois modelos                                                                                    |
| 2   | `get_exercise_insight` | Descrição de `aspect`: "Só uma parte da resposta. Sem valor, todas" → "Deixe sem valor: uma chamada só traz última sessão, recorde, evolução e carga sugerida juntos. Preencha só para pedir exclusivamente uma parte."                                                                                | `treino-carga-subindo` e `treino-prescricao`, glm e mimo: preenchiam `aspect` na primeira chamada e chamavam de novo para as outras partes (até 4 e 5 chamadas, piso 1)                                                       | glm: `treino-recorde` 1,2 → 1,2, `treino-carga-subindo` 2,4 → 1,4, `treino-prescricao` 1,8 → 2,0; mimo: 2,2 → 2,8 (custo quase dobrou), 4,0 → 3,2, 2,6 → 2,2. Acertos 5/5 → 5/5. Os modelos continuaram preenchendo `aspect` na primeira chamada                                                                                           | Inútil — efeito misto, dentro da dispersão de 5 repetições, e piorou uma tarefa em cada modelo. Revertido |
| —   | `stop_sharing`         | Nenhuma mudança: a candidata era dizer em `professional` que, sem valor, a tool revoga o único profissional com acesso                                                                                                                                                                                 | `share-revogar`, glm e mimo: 10 de 10 execuções chamam `get_sharing_overview` antes (2 chamadas, piso 1), porque o pedido diz "o personal", sem nome                                                                          | Não medido — descartado antes: sem o nome, a tela de confirmação mostraria `{}` e a pessoa aprovaria uma revogação sem ver de quem. A chamada a mais é o que põe o nome no cartão                                                                                                                                                          |

## O que o ajuste não alcança

As três tarefas de treino também chamam a mais por um defeito do `execute` do `get_exercise_insight`, e
não da descrição: na conta de avaliação, "supino" resolve para **Supino Máquina** e "agachamento" para
**Agachamento Hack**, sem histórico, embora a conta tenha treinado Supino Reto com Barra e Agachamento
Livre — a tool promete priorizar o que a pessoa já treinou. O modelo lê "sem histórico" e tenta outro
nome ou outro `aspect`. Corrigir é lógica no `execute`, fora do que esta fase pode mudar, e o acerto
de seleção não o enxerga: ele mede a tool chamada, e não a resposta.

**Corrigido depois do congelamento**, por decisão de produto e antes de qualquer medição do `eval`:
o resolvedor confere os 50 candidatos mais relevantes, e não os cinco. É defeito, e não ajuste — a
descrição e o schema não mudaram, e o `sha256` do B continua `92bc0392…`.
