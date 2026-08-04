# Benchmark de precisão do reconhecimento de refeição

> **Status: metodologia fixada, número inexistente.**
>
> **Não existe hoje nenhuma medida de precisão do reconhecimento de refeição da
> Fatia.** Qualquer afirmação em contrário — em PR, em issue ou em conversa — não
> vem daqui. Este documento fixa **como** o número vai ser medido e **qual** é o
> limiar, antes de medir; a tabela de resultados está em branco de propósito e
> continua em branco até o conjunto rotulado existir.

Issue [#138](https://github.com/ThiagoCarreiraVallim/fatia/issues/138), bloqueante
da épica de nutrição com IA (#137).

## Por que este documento existe antes do número

O pitch chama a precisão de _table stakes_: sem ela o produto não compete.
Construir a tela, o fluxo de câmera e a edição de resultado antes de saber se o
reconhecimento funciona é investir num alicerce não verificado — e a #139 já
entregou os três.

A issue tem duas metades, e só uma é executável com código:

| entrega                                        | estado                       | fecha a #138? |
| ---------------------------------------------- | ---------------------------- | ------------- |
| runner, métricas e formato do relatório        | **entregue**                 | não           |
| o **número** e a recomendação de seguir ou não | depende do conjunto rotulado | **sim**       |

O caminho crítico não é código. É **fotografar pratos e pesar o que está neles
antes de comer** — semanas de coleta manual, sem atalho. Não há dataset público
adequado: comida brasileira preparada, com gramagem verificada, não existe pronta
(Food-101 e similares são majoritariamente comida americana e **não têm
gramagem**, que é metade do que precisa ser medido).

## Contra o que se mede

Um número medido contra um modelo **não transfere para outro**. Todo relatório
gerado carrega, no topo, o modelo, o host do provedor, a data, o `sha256` do
conjunto e o `sha256` do prompt. Sem esse cabeçalho, seis meses depois alguém lê
"MAPE 22 %" e conclui sobre o modelo errado — o risco mais provável desta issue
inteira.

O benchmark chama **o caminho de produção inteiro**: a mesma `recognize_meal` da
#139, o mesmo prompt, o mesmo provedor com as mesmas guardas de host e modelo
revisados (#136). Um runner com prompt próprio mediria um produto que não existe.

## As métricas, definidas antes de medir

Identificação e porção falham de formas diferentes e custam coisas diferentes.
São números separados e **nunca viram uma nota geral**.

### Identificação — acertou _o quê_

| métrica                       | definição                                               |
| ----------------------------- | ------------------------------------------------------- |
| precisão                      | dos itens que o modelo listou, quantos existem no prato |
| revocação                     | dos itens do prato, quantos o modelo listou             |
| taxa de alucinação            | fração dos itens listados que não existem               |
| **itens inventados por foto** | quantos a pessoa precisa notar na tela de confirmação   |

A taxa de alucinação é o **complemento exato da precisão** (`1 - precisão`), e o
relatório diz isso na cara: reportar as duas sem avisar faria alguém contá-las
como duas evidências independentes. O número com informação nova é o de baixo —
10 % de alucinação com doze itens listados é um item inventado por foto; com dois
itens listados é um a cada cinco fotos, e é isso que decide se a tela de
confirmação protege alguém.

O casamento entre o item previsto e o rotulado usa **a mesma normalização da
busca de alimento** (`packages/db/src/search-text.js`), mais um mapa de sinônimos
regionais que começa em `eval/matching.py` e cresce com a #141. Usar a mesma
normalização é o que impede o benchmark de medir uma coisa e o produto de fazer
outra. Não há casamento aproximado: distância de edição faria "macaúba" casar com
"maçã", que é o erro que `meal-recognition.service.ts` existe para não cometer.

### Porção — errou _quanto_

Só sobre itens **corretamente identificados**.

| métrica                        | definição                                   |
| ------------------------------ | ------------------------------------------- |
| MAPE em gramas                 | erro percentual absoluto médio, por item    |
| erro de kcal por item, em kcal | quanta caloria aquele erro de grama custou  |
| erro de kcal por refeição      | o que a pessoa sente no total do dia, em %  |
| kcal inventada em controle     | caloria somada em foto sem comida no rótulo |

Errar 30 % na gramagem do arroz custa muito menos caloria do que errar 30 % no
óleo; um número só esconde isso. A kcal é calculada **como o produto calcula** —
`kcal_100g` da TACO (que vem do rótulo) vezes a grama que o modelo estimou —
porque `meal-recognition.service.ts` descarta a estimativa de kcal do modelo
quando o item casa com a tabela. Medir a kcal auto-relatada mediria um número que
o produto joga fora.

**Não há "MAPE em kcal por item", e a ausência é a informação.** Como a kcal do
item é a grama vezes a `kcal_100g` do rótulo, a `kcal_100g` cancela na razão
(`|k·p - k·r| / (k·r) = |p - r| / r`): um percentual em kcal seria o **mesmo
número** do percentual em gramas, com outro nome, e duas colunas idênticas seriam
lidas como duas evidências. O que a kcal acrescenta é a magnitude — 20 % a mais
de alface são 3 kcal e 20 % a mais de óleo são 177 kcal — e é por isso que o erro
de kcal por item sai **em kcal**, não em porcento.

A foto de controle não tem erro percentual: a kcal real é zero, e dividir por ela
inventaria um denominador. Ela sai numa linha própria, em kcal absoluta, porque
um prato lavado que vira 300 kcal entra no dia da pessoa igual.

O erro por refeição inclui **o item que o modelo esqueceu**, com a kcal do
rótulo: um modelo que acerta a grama de tudo que viu, mas não viu a farofa, tem
erro por item perto de zero e erro de refeição grande — e é o segundo que
descreve o dia da pessoa.

### Operacional

Latência p50/p95, taxa de resposta inutilizável (por `code`) e número de
chamadas.

**Custo por reconhecimento não sai do runner**, e isso é decisão: o `usage` dos
endpoints OpenAI-compatíveis é irregular entre provedores, e um custo derivado de
contagem estimada de token seria um número inventado num relatório cuja razão de
existir é não ter números inventados. Contra provedor local o custo é zero;
contra gateway é a fatura do período dividida pelo número de chamadas, que o
relatório reporta.

## Amostra

**Mínimo: 50 fotos, sendo pelo menos 30 com comida no split de avaliação** (mais
as 2 ou 3 de controle, que são extras e não contam para esse mínimo). Abaixo
disso o intervalo de uma proporção é largo o bastante para conter "aprova" e
"reprova" ao mesmo tempo no limiar de revocação — o relatório sairia com um
veredito que a amostra não sustenta.

Isso não é conselho: `report.MINIMO_PUBLICAVEL` vale 30, e o gerador **carimba o
documento como rascunho e se recusa a emitir veredito** fora do split `eval`,
quando a execução foi cortada por `--limite`, ou quando a amostra não chega ao
mínimo. A regra mora no gerador, e não na disciplina de quem roda, porque é assim
que ela pode ser testada (`tests/eval/test_report.py`).

**E a amostra que conta é a medida, não a tentada.** Trinta fotos no manifesto
com vinte e nove timeouts são uma medida sobre **uma** foto, e é dessa foto que o
veredito sairia; trinta fotos das quais três têm `kcal_100g` em todos os itens
decidem o portão de kcal sobre **três**. Por isso `motivo_de_rascunho` exige os
próprios números do veredito — as fotos que responderam e as que sustentam o
portão de kcal — e as duas contagens vão impressas no cabeçalho do relatório, ao
lado das tentadas.

**Toda agregação sai com `n` e dispersão.** Um MAPE de 22 % sobre 12 fotos, sem
desvio, é impressão com aparência de medida, e é a forma mais provável de este
benchmark mentir.

**Variar a condição importa mais do que aumentar o N.** Cinquenta fotos da mesma
pessoa, na mesma cozinha, com a mesma luz e sempre de cima medem aquela condição.

### `dev` e `eval` são conjuntos separados

O prompt vai ser ajustado — é o trabalho. Se o ajuste for feito olhando as fotos
que produzem o número, o número é otimista e ninguém consegue perceber depois. O
ajuste se faz no `dev`; o número sai do `eval`, que roda **uma vez por prompt e
por modelo** — o runner registra cada medição em `apps/agent/eval/eval-runs.jsonl`,
versionado para a repetição aparecer no diff.

A chave do ledger é o `sha256` dos rótulos **do split medido**, e não do arquivo
do manifesto: acrescentar uma foto ao `dev` não muda o conjunto contra o qual o
`eval` foi medido, e não pode destravar uma segunda medição. E o ledger registra
**medição**, não tentativa — uma execução que o próprio relatório se recusa a
publicar (provedor fora do ar, amostra insuficiente) não grava linha nenhuma,
porque um ledger versionado afirmando um `eval` que não aconteceu trancaria a
medição de verdade atrás de `--repetir-eval`.

## Limiar de aceitação — fixado antes de medir

Um limiar decidido **depois** de ver o resultado não é limiar, é justificativa.

| métrica                    | limiar | por quê                                               |
| -------------------------- | ------ | ----------------------------------------------------- |
| revocação de identificação | ≥ 0,80 | abaixo disso a pessoa digita mais do que corrige      |
| taxa de alucinação         | ≤ 0,10 | item inventado entra no histórico de quem não reparou |
| erro de kcal por refeição  | ≤ 25 % | acima disso a meta diária vira ficção                 |

**Pendente de confirmação do dono.** Os três vieram do plano da issue; confirmar
ou mudar precisa acontecer **antes** da primeira medição no split `eval`, e a
mudança passa por diff neste arquivo.

## Resultado

| campo                             | valor        |
| --------------------------------- | ------------ |
| modelo                            | **pendente** |
| host do provedor                  | **pendente** |
| data                              | **pendente** |
| fotos tentadas no split `eval`    | **0**        |
| fotos com resposta utilizável     | **0**        |
| fotos que sustentam o portão kcal | **0**        |
| `sha256` do conjunto              | **pendente** |

| métrica                        | medido         | limiar | passa? |
| ------------------------------ | -------------- | ------ | ------ |
| revocação de identificação     | **não medido** | ≥ 0,80 | —      |
| taxa de alucinação             | **não medido** | ≤ 0,10 | —      |
| MAPE em gramas                 | **não medido** | —      | —      |
| erro de kcal por item, em kcal | **não medido** | —      | —      |
| erro de kcal por refeição      | **não medido** | ≤ 25 % | —      |
| kcal inventada em controle     | **não medido** | —      | —      |
| latência p50 / p95             | **não medido** | —      | —      |
| custo por reconhecimento       | **não medido** | —      | —      |

### Comparação com Cal AI / MyFitnessPal

**Não medida, e desacoplada de propósito.** Nenhum dos dois tem API: comparar é
operar dois aplicativos concorrentes à mão, foto por foto — para 50 fotos são 100
operações manuais. O portão de decisão é o limiar **absoluto** acima; a
comparação é desejável e pode sair depois, sobre um subconjunto de 15 fotos.

## Recomendação

**Não há recomendação.** Ela depende de uma medida, e não existe medida.

Quando o conjunto existir e o `eval` rodar, a recomendação de seguir ou não sai
publicada aqui **inclusive se o resultado for ruim** — como a issue exige. Se for
"não seguir", vira ADR, e não uma nota de rodapé.

## O que falta, na ordem

1. Coletar e rotular ≥ 50 fotos conforme
   [`apps/agent/eval/README.md`](../apps/agent/eval/README.md) — **pesando** cada
   item antes de comer.
2. Confirmar (ou mudar) o limiar acima, com o conjunto já coletado e **antes** de
   rodar o `eval`.
3. Ajustar o prompt olhando só o split `dev`.
4. Rodar o `eval` contra o LM Studio local e contra o modelo de produção, e
   preencher as tabelas de Resultado — uma execução por modelo, cada uma com seu
   cabeçalho.
5. Publicar a recomendação. Se for negativa, abrir a ADR.
