# Política de agregação — o que conta como "agregado o suficiente"

> Documento público de propósito (#159). A promessa do produto é que o insight para a academia
> vem de **dado agregado**, não de vigiar o corpo e o peso de cada aluno. Uma promessa dessas só
> vale se puder ser conferida — por isso a definição está escrita aqui, e não só implementada.
>
> Ele é **parseável**, e não prosa solta: `single-aggregation-path.spec.ts` lê a tabela de
> recortes e o limiar daqui e confronta com `apps/api/src/insights/`. Doc e código divergirem em
> silêncio é o modo de falha desta issue.

## O problema, em uma frase

Um recorte que sobra uma pessoa não é agregado: é vigilância com outro nome. Se a academia
filtrar "alunas, 30-35 anos, turno da manhã" e restar uma, o sistema tem de se recusar a
responder — e recusar **não basta**, porque a recusa também informa.

## As regras

### 1. Limiar: `MIN_CELL = 5`

Célula com `0 < n < 5` não é publicada. `n` é o número de **indivíduos distintos** que compõem a
célula, nunca o número de eventos: dez sessões da mesma pessoa numa semana são `n = 1`.

Célula com `n = 0` é publicada como zero — não há ninguém a proteger num balde vazio, e omiti-la
convidaria o leitor a preencher a lacuna.

O limiar é **constante no código**, não configurável por grupo. Um `k` que a academia ajusta vira
`k = 1` no primeiro pedido comercial; mudá-lo exige diff e revisão.

### 2. Supressão complementar — a regra que existe por causa da subtração

Célula suprimida pelo limiar é uma **semente**. Cada semente absorve vizinhos no eixo até o
**bloco** oculto ficar seguro; o que a resposta esconde é a união dos blocos. Uma célula oculta
sozinha não está oculta.

Com números, que é como isto se entende:

| faixa | n   | sessões |
| ----- | --- | ------- |
| manhã | 20  | 140     |
| noite | 18  | 96      |
| tarde | 3   | 11      |

Total: 247. Com supressão simples, `tarde` sai como `SUPPRESSED` — e `247 − 140 − 96 = 11`
devolve exatamente o número que o limiar recusou, sobre um recorte de três pessoas. Com a
supressão complementar, `noite` cai junto: o resíduo passa a ser 107, a soma de **duas**
incógnitas, e não a segunda parcela de uma subtração.

**Um bloco é seguro quando as três valem:**

1. tem pelo menos **duas** células com gente — uma incógnita só é uma equação resolvida;
2. a soma dos `n` ocultos é **≥ `MIN_CELL`** — o bloco esconde pelo menos tanta gente quanto uma
   célula que teríamos publicado;
3. a soma dos valores ocultos, menos o número de células do bloco, é **≥ `MIN_CELL`** — é a
   largura do intervalo em que cada parcela pode estar. Largura zero significa que todas valem 1
   e o bloco inteiro está publicado por dedução.

A condição 3 é a que faltava. Duas células naturalmente pequenas, de uma pessoa cada, satisfaziam
"não fica exatamente uma oculta" e mesmo assim voltavam inteiras: resíduo 2, duas parcelas de no
mínimo 1, cada uma vale 1.

**O complemento é o vizinho no eixo, e cresce para a direita** — em direção ao presente —, só
indo para a esquerda quando o bloco já encosta na borda direita. Não é gosto: as três janelas
terminam todas em `now` e diferem só onde começam, então o vizinho da direita é o mesmo balde nas
três. Escolher "a menor célula visível **desta consulta**", como esta política dizia antes, fazia
o complemento mudar de janela para janela — e a segunda consulta publicava o balde que a primeira
tinha escondido, deixando uma incógnita só. Ver §9.

O complemento precisa ter `n > 0`. Suprimir o balde vazio ao lado do balde pequeno é teatro: zero
é um valor conhecido, e a subtração continua funcionando com uma incógnita só. Balde vazio é
transparente: não entra no bloco e não muda resíduo nenhum.

Quando o bloco não consegue ficar seguro — recorte de uma célula só, ou eixo curto demais — o
recorte inteiro é suprimido. A resposta é **"amostra insuficiente"**, nunca `0`: dizer zero é uma
afirmação sobre as pessoas, e é falsa. É também o que acontece na janela curta quando o bloco
precisaria crescer para além do começo dela: ela não publica nada, e o que não é publicado não
entra em subtração nenhuma.

### 3. O total não é publicado

A soma das células é a arma do ataque por diferença. A tela soma sozinha o que está visível, e
essa soma não revela nada. A supressão complementar continua existindo porque o total pode ser
sabido **de fora** — de outro período, de outro recorte, do tamanho conhecido da turma.

### 4. Um eixo por consulta, e nenhum construtor de filtro

A API recebe o **nome** de um recorte registrado, não um objeto de filtro. Não existe `where`, não
existe combinação de eixos, não existe janela de datas arbitrária.

Esta é uma decisão **anterior** à supressão, e é a mais importante do documento. Recusar depois de
compor o filtro é tarde: com filtros compostos livremente, duas consultas que passaram dão a
célula suprimida por diferença. Um parâmetro que aceite filtro arbitrário é a vulnerabilidade — a
supressão fraca é só o sintoma.

O período também é nomeado (`last_30_days`, `last_90_days`, `last_12_months`). Um `from`/`to`
livre é um construtor de filtro com outro nome: permite estreitar até sobrar a semana em que uma
pessoa só treinou, e comparar duas janelas quase iguais para isolar quem entrou entre elas.

**Todo recorte honra a janela.** Três deles não honravam — recência, risco de evasão e coorte
liam janelas fixas — e mesmo assim a resposta e a coluna `periodo` do CSV carimbavam o período
pedido: `last_30_days` e `last_12_months` devolviam células idênticas com rótulos diferentes. Um
período que a resposta declara e o recorte ignora é uma afirmação falsa sobre o número, e o painel
que compara os dois carimbos conclui coisas sobre a diferença entre eles.

`last_12_months` são **doze meses de calendário**, não 365 dias.

### 5. Nenhum atributo demográfico

Sexo, idade, faixa etária, bairro — nada disso é eixo. O exemplo da issue ("alunas, 30-35 anos,
turno da manhã") deixa de ser **formulável**, não só de ser respondível.

O pedido "dá para ver por sexo?" vai aparecer, e é uma adição de duas linhas ao registro de
recortes. É por isso que o motivo está escrito aqui e que há um teste que falha: para a resposta
não depender de quem está na revisão numa sexta-feira.

### 6. Só engajamento entra

Frequência de sessões, dias ativos, faixa de horário, tempo desde o último acesso, aderência ao
plano em **quantidade**. Nunca peso, medida, alimentação ou meta corporal — não como métrica, não
como eixo, não como filtro, não como derivada.

Peso parado e diário alimentar vazio são preditores de evasão _melhores_ que frequência. Ficam
fora mesmo assim: a #159 existe justamente para que "melhor" não decida esta pergunta.

### 7. Só quem consentiu entra — inclusive no denominador

Participar da estatística agregada é um consentimento próprio, por grupo, **opt-in**, guardado em
`GroupMembership.statsOptIn`. Não é `ProfessionalLink`: não abre leitura individual para ninguém,
nem para o dono. É permissão para entrar numa contagem.

O denominador é só de quem consentiu. Numerador consentido sobre denominador cheio vazaria
informação exatamente sobre quem recusou.

E o limiar vale para o **denominador**, não só para o numerador. É o que protege
`retention_by_cohort`: uma coorte antiga em que restou uma pessoa retida dá 100%, e 100% sobre uma
coorte de tamanho conhecido diz quem.

### 8. Nunca uma linha de pessoa

O sinal de evasão é uma **contagem por faixa** ("12 participantes em risco alto"). Nunca uma
lista, nunca um id, nunca um nome. O export do painel pago serializa as **mesmas células já
suprimidas** — não faz segunda consulta, e o serviço que o gera nem repositório tem.

Entregar a lista de alunos em risco ao dono é o que todo software de gestão de academia faz, é o
que o dono vai pedir, e é a promessa do produto sendo quebrada. Se um dia virar requisito, é
vínculo consentido com escopo escolhido pelo aluno — e aí o alerta deixa de ser agregado.

### 9. A supressão é a mesma nas três janelas

Os períodos são **encaixados**: `last_30_days` ⊂ `last_90_days` ⊂ `last_12_months`. E o balde de
um recorte de tempo é o mesmo objeto nas três — a semana só contém as sessões daquela semana.

Logo a decisão de suprimir um balde **não pode depender da consulta**. Se depender, duas
requisições ao painel bastam: a janela longa publica o balde que a janela curta escondeu, o
resíduo da curta fica com uma incógnita só, e o número volta inteiro. O total nem precisa ser
publicado — ele sai de um recorte irmão sobre a mesma população, porque `sessions_by_week` e
`sessions_by_hour_band` particionam exatamente as mesmas sessões.

A regra que garante isso: **o bloco de uma semente é função da semente e do que está à direita
dela**, e de mais nada. Por isso o crescimento é para a direita, por isso os blocos são por
semente (e não por vizinhança — semente nova à esquerda, que só a janela longa enxerga, não pode
mudar bloco nenhum), e por isso `last_12_months` conta meses de calendário a partir de `now`.

`aggregation.service.spec.ts` transforma isto em teste: em 300 séries de 52 semanas, nada que a
janela de 13 semanas ocultou aparece publicado na janela de 52.

### 10. Toda chave de célula vem de lista fechada

O limiar decide sobre `value` e `n`. Ele **não alcança a chave**: uma célula suprimida sai com
`value: null`, `n: null`, `suppressed: true` — e o rótulo intacto, na resposta e no CSV.

Num eixo de tempo isso é inofensivo. Num eixo de texto livre é a divulgação inteira: o eixo do
`modality_mix` é `Exercise.muscleGroup`, que aceita 50 caracteres de letras, espaços e hífens, e
exercício custom é criado pelo próprio aluno. Uma célula de **uma** pessoa entregava ao dono da
academia a frase que ela digitou, e a existência da célula já era o vazamento — além de dar ao
aluno o controle da cardinalidade do eixo, uma célula unitária por texto distinto.

Grupo muscular fora da lista canônica vira `outros`. Não é sanitização de texto (o escape de
fórmula no CSV continua existindo, por outro motivo): é a regra §4 aplicada ao único eixo que a
violava.

## Os recortes, lista fechada

| Recorte                   | Eixo           | Métrica         | Painéis             |
| ------------------------- | -------------- | --------------- | ------------------- |
| `sessions_by_week`        | `week`         | `sessions`      | retention, behavior |
| `active_days_by_month`    | `month`        | `active_days`   | retention           |
| `sessions_by_hour_band`   | `hour_band`    | `sessions`      | retention, behavior |
| `members_by_recency`      | `recency_band` | `members`       | retention           |
| `members_by_churn_risk`   | `risk_band`    | `members`       | retention           |
| `plan_adherence_by_month` | `month`        | `adherence_pct` | behavior            |
| `retention_by_cohort`     | `cohort_month` | `retained_pct`  | behavior            |
| `modality_mix`            | `muscle_group` | `sessions`      | behavior            |

`behavior` é o add-on pago (#160), e ele **não tem exceção**: mesmo catálogo, mesmo limiar, mesma
supressão. Um segundo caminho de agregação para o painel pago significaria duas noções de
anonimização no mesmo produto — e uma delas estaria errada sem ninguém saber qual.

## O que **não** está protegido

No espírito da seção homônima do [`THREAT_MODEL.md`](./THREAT_MODEL.md): supressão com limiar não
é privacidade diferencial, e fingir o contrário seria pior que não ter nada.

- **Diferencial entre períodos.** Comparar a mesma célula em duas janelas em que entrou
  exatamente uma pessoa revela essa pessoa. É a limitação honesta da supressão sem orçamento de
  privacidade.

  A versão anterior deste documento dizia aqui que "os períodos são três, fixos e **sobrepostos**,
  o que reduz as diferenças úteis". Estava **invertido**: a sobreposição é o que fazia o ataque
  funcionar, porque o complemento era escolhido dentro da consulta e mudava de uma janela para a
  outra. O §9 fecha essa porta — a supressão passou a ser a mesma nas três janelas. O que sobra
  aqui é o diferencial genuíno: dois valores visíveis de janelas diferentes ainda contam quem
  entrou entre elas.

- **O intervalo do valor oculto.** O bloco garante que o resíduo admita pelo menos `MIN_CELL`
  valores diferentes para cada parcela; ele não torna o intervalo infinito. Quem conhece o total
  sabe a faixa em que o valor oculto está — não o valor, que é o que o limiar promete.

  O complemento **era** a menor célula visível, para minimizar a perda de informação; hoje é o
  vizinho no eixo, porque só o vizinho é o mesmo nas três janelas. Custa mais utilidade: às vezes
  cai junto uma célula grande, que era justamente a que dava valor ao recorte.

- **Conhecimento externo.** O dono conhece a academia dele. Nenhuma regra estatística impede que
  ele olhe um número agregado e se lembre de quem faltou. O que este documento garante é que o
  **sistema** não conta.
- **Amostra pequena torna o painel inútil.** Academia com 30 alunos e 8 opt-in não recebe quase
  nada. É o preço da promessa. A resposta certa continua sendo "amostra insuficiente", e não
  `MIN_CELL = 2`; isto está registrado aqui para a conversa não recomeçar do zero na primeira
  reclamação comercial.

## Onde isso vive

| Regra                       | Código                                                  | Teste                             |
| --------------------------- | ------------------------------------------------------- | --------------------------------- |
| Limiar e supressão          | `insights/aggregation.service.ts`                       | `aggregation.service.spec.ts`     |
| Recortes e períodos         | `insights/cut-registry.ts`                              | `single-aggregation-path.spec.ts` |
| Um caminho só               | `insights/insights.service.ts`                          | `single-aggregation-path.spec.ts` |
| Sem dado corporal           | `insights/engagement.service.ts`, `behavior.service.ts` | `no-body-data.spec.ts`            |
| Export sem segunda consulta | `insights/insights-export.service.ts`                   | `export-suppression.spec.ts`      |
| Consentimento e denominador | `insights/stats-participation.port.ts`                  | `insights.service.spec.ts`        |

## Estado atual — leia antes de confiar no painel

`GroupMembership.statsOptIn` **ainda não existe** no `schema.prisma`. Enquanto não existir, a
implementação da porta de participação é `NoStatsParticipation`: **ninguém participa**, e todo
recorte de todo grupo responde "amostra insuficiente".

É inútil e é o comportamento certo — sem coluna de opt-in não há como saber quem consentiu, e a
única resposta defensável para "não sei quem consentiu" é ninguém. A migration está proposta na PR
da #159; quando entrar, a troca é uma implementação da porta e um `provide` no módulo, sem tocar
em agregação, recorte ou export.
