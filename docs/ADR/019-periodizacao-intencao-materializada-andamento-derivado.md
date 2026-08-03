# ADR 019 — Periodização: intenção materializada, andamento derivado

**Status:** Accepted
**Data:** 2026-08-02

## Contexto

A [#145](https://github.com/ThiagoCarreiraVallim/fatia/issues/145) traz periodização em blocos:
montar semanas de força, hipertrofia e deload ao longo de um mês, em vez de só o treino do dia. Ela
depende da prescrição adaptativa da #144, que já existe em
`apps/api/src/workout/helpers/prescribe-load.ts` — e a periodização produz **multiplicadores sobre
a carga que aquela prescrição já calcula**, nunca um segundo motor de carga. É o que mantém os três
tetos da #144 (5% por sessão, 10% por semana, 5% sobre o recorde) valendo dentro do bloco; um bloco
que prescrevesse carga absoluta deixaria os tetos de fora e traria o risco físico de volta pela
porta dos fundos.

A pergunta arquitetural da issue não é qual tabela de fatores usar. É **onde mora o bloco**.

Um bloco tem duas metades com naturezas opostas:

1. **A intenção** — "aceitei um bloco de hipertrofia de 4 semanas, começando na segunda dia 12,
   com estes multiplicadores". É um combinado, feito uma vez, e a issue exige que o usuário
   "entenda por que a semana é aquela".
2. **O andamento** — em que semana a pessoa está, quantas sessões fez, quantas semanas o bloco
   esperou por ela. Isso é função do histórico de `WorkoutSession`, que muda o tempo todo — e que
   muda **para trás** também: sessão apagada, sessão registrada retroativamente.

Tratar as duas metades do mesmo jeito quebra de um lado ou do outro.

## Decisão

**Materializar a intenção. Derivar o andamento em toda leitura.**

`TrainingBlock` e `TrainingBlockWeek` guardam só o que foi combinado: `startDate`, `kind`,
`weeksTotal`, e por semana o `focus`, os fatores (`intensityFactor`, `volumeFactor`), a segunda-feira
planejada e a meta de sessões. **Nada disso é reescrito depois da criação.**

O andamento — sessões feitas na semana, reancoragem por semana perdida, bloco vencido ou abandonado
por ausência — sai de `reconcileBlock`, uma **função pura** em
`apps/api/src/workout/helpers/reconcile-block.ts`, alimentada pelas datas das sessões concluídas.
Nenhuma coluna de contador; nenhuma escrita durante um `GET`.

### Por que a intenção precisa de tabela

Se os fatores fossem lidos do template do código a cada leitura, mudar a tabela de
`block-template.ts` mudaria **retroativamente** a semana de quem está no meio do bloco. A pessoa
abriria o app e a semana 2 seria outra, sem nada ter acontecido com ela. Copiar os fatores para a
linha é o que torna o bloco explicável: o que está no banco é o que foi combinado, mesmo que o
código de hoje diga outra coisa.

A consequência para quem depura está escrita no schema, porque parece bug: ver `1.025` numa linha e
`1.05` em `block-template.ts` é um bloco criado antes de o template mudar, não uma divergência.

### Por que o andamento não pode ter tabela

Dois motivos, e cada um sozinho já bastaria.

**Contador persistido mente.** Uma coluna `sessionsDone` incrementada a cada sessão diverge do
histórico no dia em que uma sessão é apagada, ou registrada retroativamente. A periodização inteira
passa a decidir a partir de um número errado, e não há sintoma nenhum — o app funciona, o teste
passa, o log não muda. Recontar do histórico é a única forma de a resposta não poder divergir dele.

**Reconciliar gravando quebra a promessa do `readOnlyHint`.** `get_training_block` declara
`readOnlyHint: true`, e o Claude chama tool assim marcada **sem confirmar**. É o mesmo erro que o
`DashboardService` já pagou com conquistas: `get_today_summary` era leitura, desbloqueava conquistas
por dentro, e "quanto comi hoje?" chegava a criar sete linhas. Um bloco que virasse `abandoned`
durante um `GET` seria a mesma armadilha, com uma mudança de estado bem mais visível.

O fechamento **é** persistido — mas só em rota de escrita (`create` e `delete`), onde o usuário já
está pedindo uma mudança. Sem isso, um bloco derivado-abandonado ficaria `active` no banco e travaria
a criação do próximo para sempre.

### A regra de reancoragem

A issue diz que sair do plano — falta, lesão, viagem — "é o caso comum, não a exceção". A regra:

| Semana com janela encerrada    | O que acontece                                                      |
| ------------------------------ | ------------------------------------------------------------------- |
| Meta atingida                  | Fecha e avança                                                      |
| Alguma sessão, abaixo da meta  | Fecha e avança, com o déficit registrado — **não** empurra          |
| Nenhuma sessão                 | A semana e as seguintes andam 7 dias; a semana 2 continua sendo a 2 |
| 3 semanas seguidas sem nenhuma | Bloco abandonado                                                    |

Empurrar por sessão perdida transformaria o plano num relógio impossível de cumprir: bastaria faltar
uma vez para o bloco nunca terminar. Já a semana **inteira** perdida é o caso da viagem, e ali o
certo é o bloco esperar.

O empurrão é **por semana de calendário perdida, não por leitura**. Como a reconciliação é pura e
recomeça do `weekStart` planejado a cada chamada, ler dez vezes no mesmo dia dá o mesmo resultado —
não existe o modo de falha em que o bloco foge para frente a cada request.

### Deload por sinal, com janela congelada

Além da semana 4 fixa, o deload é antecipado quando **as duas** condições ocorrem juntas: RPE médio
subindo ≥1 ponto ao longo de 3 sessões **e** carga igual ou menor. Duas e não uma, porque RPE subindo
com carga subindo é progresso — é o que a dupla progressão faz de propósito, e uma condição só
transformaria toda semana boa em motivo de deload.

O sinal é medido **só com sessões concluídas antes do início da semana corrente**. Essa janela fica
congelada durante a semana inteira; medir com as sessões da própria semana faria a sugestão piscar a
cada série registrada, e "por que a semana mudou de novo?" é exatamente a pergunta que esta issue
existe para evitar. O sinal **antecipa** a semana de deload que já existe, trocando-a com a corrente;
nunca cria uma quinta semana.

## Consequências

### Positivas

- Bloco em curso não muda quando o template do código muda.
- Nenhum contador para divergir do histórico: sessão apagada ou retroativa é absorvida na leitura
  seguinte, sem migração de dado nem job de correção.
- `get_training_block` é honestamente somente-leitura.
- A regra de reancoragem inteira mora numa função pura, testável sem banco e sem fuso mockado.

### Negativas

- Toda leitura do bloco custa uma consulta às sessões concluídas desde o início dele. É uma varredura
  por índice `WorkoutSession(userId, startedAt)` sobre no máximo ~7 semanas — aceitável, e não foi
  medido em produção.
- O `status` no banco pode estar atrasado em relação ao derivado até a próxima escrita. Quem consultar
  a tabela direto (relatório, suporte) vê `active` num bloco já vencido. Quem consulta pela API, não.

### Neutras

- Migration puramente aditiva: duas tabelas, dois enums, duas FKs (`userId` em cascade, `planId` em
  `SetNull`). Não cai na política de migration destrutiva.
- O bloco é opcional: sem bloco ativo, a prescrição da #144 continua respondendo exatamente como
  antes.

## Alternativas consideradas

- **Bloco totalmente derivado, sem tabela nenhuma.** Mais barato e sem migration, mas a semana
  mudaria sozinha no dia em que os fatores do código mudassem — e não haveria o que explicar a quem
  está no meio do bloco. É a metade que precisa ser combinada.
- **Bloco totalmente materializado, com `sessionsDone` e `shiftedWeeks` em coluna, reconciliados na
  leitura.** Foi o desenho original do plano da issue. Rejeitado pelos dois motivos da seção acima:
  o contador diverge em silêncio, e reconciliar na leitura obrigaria `get_training_block` a gravar.
- **Gerar o bloco com LLM.** A tabela de periodização tem 4 linhas. Um modelo produziria variações
  que ninguém sabe justificar — exatamente o "parece sofisticado e não ajuda ninguém" que a própria
  issue adverte. Além disso custaria inferência hospedada, que a [ADR 018](./018-inferencia-hospedada-fora-do-mcp.md)
  mantém fora do MCP por padrão.
- **Bloco prescrevendo carga absoluta, em vez de multiplicador.** Deixaria os tetos da #144 de fora
  da periodização. Rejeitado por segurança, não por elegância.
