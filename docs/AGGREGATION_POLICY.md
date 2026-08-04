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

Se sobrar **exatamente uma** célula suprimida, a menor célula visível com gente também é
suprimida. Uma célula oculta sozinha não está oculta.

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

O complemento precisa ter `n > 0`. Suprimir o balde vazio ao lado do balde pequeno é teatro: zero
é um valor conhecido, e a subtração continua funcionando com uma incógnita só.

Quando não existe complemento elegível — recorte de uma célula só, ou de uma célula pequena
cercada de baldes vazios — o recorte inteiro é suprimido. A resposta é **"amostra insuficiente"**,
nunca `0`: dizer zero é uma afirmação sobre as pessoas, e é falsa.

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

- **Diferencial entre períodos.** Comparar a mesma célula em duas janelas consecutivas em que
  entrou exatamente uma pessoa revela essa pessoa. É a limitação honesta da supressão sem
  orçamento de privacidade. Mitigação parcial: os períodos são três, fixos e sobrepostos, o que
  reduz — não elimina — as diferenças úteis.
- **O intervalo do valor oculto.** O complemento é a _menor_ célula visível, para minimizar a
  perda de informação. Isso estreita a faixa em que o valor oculto pode estar; não o revela, que é
  o que o limiar promete. Suprimir a maior protegeria mais e custaria justamente o número que dá
  utilidade ao recorte.
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
