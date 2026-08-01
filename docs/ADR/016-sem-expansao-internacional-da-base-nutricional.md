# ADR 016 — Sem expansão internacional da base nutricional

**Status:** Accepted
**Data:** 2026-08-01

## Contexto

A issue #150 pede a decisão sobre importar uma segunda base nutricional — USDA FoodData Central,
CIQUAL, Open Food Facts — e desenhar a convivência entre múltiplas fontes.

O próprio texto dela já abre condicionado: _"só faz sentido se houver decisão de expandir para fora
do Brasil"_. Ou seja, o trabalho técnico nunca foi a pergunta. A pergunta era de produto, e estava
em aberto desde a [ADR 005](./005-taco-sem-usda-v1.md), que fechou o assunto **para a v1** e deixou
a porta encostada: _"USDA pode ser adicionada no futuro como `FoodSource.USDA` sem migration
breaking"_.

O roadmap pós-MVP reabriu a pergunta. Ela precisa de resposta para a #150 sair do limbo — e a
resposta de produto é **não expandir para fora do Brasil por enquanto**.

## Decisão

**A TACO continua a única base importada. Nenhuma segunda fonte, nenhum desenho multi-fonte.**

A #150 fecha com esta ADR, não com implementação.

Três coisas sustentam isso, e a ordem importa:

### 1. A lacuna real não é geográfica

O que falta na TACO não é comida estrangeira — é **alimento industrializado com marca**. Barra de
cereal, iogurte de pote, refrigerante, biscoito. Isso é o que o usuário brasileiro registra todo
dia e não encontra, e nenhuma quantidade de USDA resolve, porque o problema é a marca, não o país.

Quem ataca essa lacuna é a **#140 (scanner de código de barras)**, contra o Open Food Facts. É
trabalho já priorizado, com plano escrito, e que dá retorno antes de qualquer importação em massa.

### 2. O Open Food Facts já é internacional

Consequência que decide a questão: a base do scanner de código de barras **não é brasileira**. Ela
é global e colaborativa. Quando a #140 subir, o produto passa a resolver produto embalado de
qualquer lugar sem que nada tenha sido decidido sobre expansão.

Isto é o oposto de fechar a porta: a cobertura internacional chega de graça, pelo caminho que já
estava sendo construído por outro motivo.

### 3. O custo de decidir depois é zero

`FoodSource` já tem `USDA` no enum (`schema.prisma:156-160`), e `Food.source` já grava a origem por
alimento (`:125`). O schema foi desenhado na ADR 005 justamente para esta decisão poder ser tomada
tarde.

Não há dívida acumulando, nem janela fechando. Adiar não custa migration.

### O que fica explicitamente de fora

O item mais caro da #150 é a convivência entre fontes: precedência, origem por alimento, e o que
fazer quando duas bases discordam da composição do **mesmo** item — o que é comum, porque método
de análise e amostra variam entre tabelas.

Esse desenho **não vai ser feito agora**. Fazê-lo sem mercado-alvo definido é escolher regra de
desempate para um conflito hipotético, e a escolha errada só aparece depois de ter dado importado.

## Consequências

### Positivas

- A #150 sai do board com decisão registrada, em vez de ficar aberta por indefinição de produto.
- O esforço de dados vai para a #140, que tem retorno mais próximo e ataca a lacuna que o usuário
  sente de fato.
- Nenhum dado importado que depois teria que ser reconciliado ou removido.
- A busca continua com uma fonte só, sem ranking entre bases nem ambiguidade de qual item é o certo.

### Negativas

- **Usuário fora do Brasil continua mal servido** para comida fresca e preparação regional — a
  #140 cobre embalado, não "salmão grelhado" ou "goulash". É consequência aceita: não há esse
  usuário no alvo hoje.
- A TACO tem ~600 itens e é de 2011. Item raro continua caindo em "livre", com macro estimado e
  margem de erro maior. Não muda nada em relação a hoje.

### Neutras

- Se o mercado-alvo mudar, esta ADR é superseded por outra, e aí o desenho multi-fonte é escrito
  com o requisito real em mãos. O schema não precisa mudar para isso começar.

## Alternativas consideradas

- **Importar a USDA agora, "já que o enum existe".** Rejeitada: dado em inglês, sem correspondência
  de nome com o que o brasileiro digita, e a busca passaria a ter que desempatar entre duas fontes
  para todo termo. Custo imediato em qualidade de busca por benefício nenhum hoje.
- **Importar a CIQUAL (França) como segunda fonte.** Rejeitada pelo mesmo motivo, com menos
  cobertura ainda para o público atual.
- **Desenhar o multi-fonte agora e importar depois.** Rejeitada: é a parte que mais depende do
  requisito real. Desenhar sem mercado-alvo é decidir a regra de desempate no escuro, e o desenho
  ficaria obsoleto antes de ser usado. YAGNI, que é a ordem declarada no `CLAUDE.md`.
- **Deixar a #150 aberta esperando definição.** Rejeitada: é o estado de hoje, e ele confunde
  ausência de decisão com trabalho pendente. Uma recusa registrada vale mais que uma issue parada.
