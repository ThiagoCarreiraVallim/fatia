# ADR 017 — Open Food Facts, sob demanda, para produto industrializado

**Status:** Accepted
**Data:** 2026-08-02

## Contexto

A issue #140 (scanner de código de barras) pede explicitamente uma decisão registrada: **de onde
vem o dado do produto embalado**. É a mesma pergunta que a [ADR 005](./005-taco-sem-usda-v1.md)
deixou em aberto ("Open Food Facts é melhor para industrializados via barcode, mas barcode scanner
está fora do escopo v1") e que a [ADR 016](./016-sem-expansao-internacional-da-base-nutricional.md)
apontou como a lacuna real do produto: falta **alimento industrializado com marca**, não comida
estrangeira. A TACO é de alimento in natura e tem ~600 itens de 2011.

O que está em jogo tem três eixos: **cobertura** (o produto do mercado brasileiro está lá?), **custo
recorrente** (base paga cobra por consulta) e **licença de redistribuição** — este último é o que
passa despercebido, porque não quebra nada tecnicamente.

Há ainda um eixo que a issue levanta e que nenhuma base resolve sozinha: consultar um serviço de
terceiro a partir de um app de saúde é **transferência de dado**, e precisa ser dita em voz alta.

## Decisão

**A fonte é o Open Food Facts, consultado sob demanda por código de barras. O resultado não é
persistido.**

Quatro partes, e cada uma responde a um risco:

### 1. Open Food Facts, e não base paga

Aberto, sem chave de API, sem cadastro e sem custo recorrente. Cobertura brasileira razoável para
marca grande — Nestlé, Coca-Cola, União e afins têm ficha. Base paga (Nutritionix, Edamam) cobraria
por consulta num produto gratuito para o usuário, sem evidência de cobertura brasileira melhor, e
com termos que costumam proibir exatamente o cache que tornaria o custo aceitável.

### 2. Sob demanda, um código por vez — não é importação

A ADR 016 recusou importar base internacional em massa. Esta decisão **não a contraria**: o dump do
OFF passa de milhões de produtos, a maioria irrelevante ao mercado brasileiro, e mantê-lo
atualizado seria um segundo pipeline de seed com todos os problemas do primeiro. Consultar um código
quando a pessoa aponta a câmera para uma embalagem é outra coisa.

### 3. Nada é gravado no catálogo — por ora, e por um motivo concreto

O plano original previa cachear cada produto consultado como `Food` com `source = OFF`. Isso exige
colunas novas (`barcode`, `brand`, `servingSize`) e um valor novo no enum `FoodSource`, e o
`schema.prisma` estava congelado por outra PR quando esta foi escrita. A proposta de schema ficou
registrada na PR da #140 para issue separada.

Enquanto isso, o produto escaneado entra na refeição como **item livre** (`MealItem` sem `foodId`,
que já é como o app trata item sem alimento de catálogo), com os macros do rótulo copiados no
momento do registro. Só há cache **em memória do processo**, com validade de 6 h, para não bater no
OFF a cada quadro da câmera.

Isso tem uma consequência que precisa estar escrita: **enquanto não houver `Food.barcode`, um
produto cadastrado à mão não é encontrado pelo código de barras no escaneamento seguinte.** A issue
pede esse fechamento de ciclo; ele depende da migration.

### 4. ODbL — a parte que não quebra nada e por isso passa despercebida

O Open Food Facts é licenciado sob **ODbL 1.0**. Na prática:

- **A ODbL licencia o banco de dados, não o software.** Nada acontece com a licença do Fatia.
- **Usar o dado exige atribuição.** Ela é visível na tela do produto escaneado, com link para a
  ficha de origem — e viaja **dentro da resposta da API** (`attribution`), não como constante de
  UI, justamente para que nenhuma tela futura consiga exibir o dado sem o crédito.
- **Guardar o dado e servi-lo aos usuários é distribuir um banco derivado**, e isso obriga a
  disponibilizar esse derivado sob ODbL. Como esta PR **não persiste nada**, a obrigação ainda não
  se materializa. Ela nasce no dia em que o cache em `Food` existir — e essa é uma razão a mais para
  o cache vir numa issue própria, com a decisão consciente, e não de carona.

### 5. O que sai daqui — privacidade

Para o Open Food Facts vai **o número do código de barras e nada mais**: sem `Authorization`, sem
cookie, sem identificador de usuário, sem corpo de requisição. Do lado do OFF a consulta é
indistinguível de uma anônima. O único cabeçalho que identifica algo é o `User-Agent`, que
identifica **o aplicativo** e é exigido pelo OFF. Há teste fixando a lista fechada de cabeçalhos —
um `Authorization` acrescentado por descuido vazaria a sessão para um terceiro, e é o tipo de erro
que nenhuma revisão pega olhando.

O log da consulta não registra o código escaneado. Registrado em `docs/DATA_RETENTION.md`.

## Consequências

### Positivas

- A lacuna que a ADR 016 nomeou — industrializado com marca — passa a ter resposta, sem custo
  recorrente e sem importação.
- Cobertura internacional chega de graça: o OFF é global, e o scanner funciona fora do Brasil sem
  que nada tenha sido decidido sobre expansão.
- Falha do OFF nunca trava o registro de refeição: timeout de 5 s e queda para o cadastro manual.
- Ficha incompleta **não vira zero**. O mapeador recusa o produto sem os quatro macros e devolve o
  que falta, nomeado, para a pessoa completar pelo rótulo.

### Negativas

- **Cobertura brasileira é desigual.** Marca grande está bem preenchida; regional, não. Medido nesta
  PR com produtos reais: de três códigos de mercado consultados, dois vieram completos e um — açúcar
  União, `7891910000197` — está **sem proteína e sem gordura** na base. Um em três é a ordem de
  grandeza que se deve esperar, não a exceção. A fixture do teste é essa resposta real.
- **O dado é colaborativo e pode estar errado.** Não há curadoria como na TACO. A atribuição com link
  para a ficha existe também por isso: é por lá que se corrige.
- **Sem cache persistente, todo primeiro escaneamento de cada processo paga uma requisição.** E o
  ciclo "cadastrei à mão, escaneio de novo e acho" não fecha até a migration.
- **Bebida é registrada contando 1 ml como 1 g.** O OFF declara rótulo de líquido por 100 ml, e o
  `MealItem` guarda gramas. A densidade de refrigerante, suco e leite fica entre 1,0 e 1,05, então o
  erro é de poucos por cento e a tela avisa. Recusar bebida tiraria do scanner justamente a
  categoria que a ADR 016 citou como lacuna. Óleo, com densidade 0,92, é o pior caso.

### Neutras

- Nenhuma tool MCP nova. Ler código de barras é ato de câmera, e o Claude não tem câmera; o total
  segue em **87**. Expor `get_food_by_barcode` para quem já tem o número é decisão de outro dia.
- O scanner é só do app nativo. A leitura no navegador depende de `BarcodeDetector`, que o Safari
  não tem, e a #140 não cobre o PWA.

## Alternativas consideradas

- **Importar o dump do Open Food Facts no seed, como se faz com a TACO.** Rejeitada pelo volume, pela
  irrelevância da maior parte para o público atual, e por criar um segundo pipeline de atualização.
  Também seria distribuição de banco derivado sob ODbL, com todas as obrigações, para ganhar muito
  pouco.
- **Base paga (Nutritionix, Edamam).** Rejeitada: custo recorrente num produto gratuito, sem
  evidência de cobertura brasileira melhor, e com licença que costuma proibir o cache.
- **Aceitar ficha incompleta preenchendo o que falta com zero.** Rejeitada, e é a rejeição mais
  importante desta ADR: `proteinPer100g = 0` porque o campo veio `undefined` produz macro errado em
  silêncio em toda refeição futura daquele produto, e o erro nunca se anuncia. Campo ausente é campo
  ausente.
- **Converter porção em volume para massa chutando 1 g/ml no mapeamento.** Rejeitada no mapeamento:
  lá o `null` é honesto. A aproximação existe só no registro da refeição, à vista da pessoa e com
  aviso na tela — que é diferente de gravá-la como se fosse dado do rótulo.
- **Deixar a atribuição da ODbL numa página de créditos.** Rejeitada: "atribuição visível" quer
  dizer onde o dado aparece. Uma nota no `README` não é vista por quem usa o app.
