# ADR 012 — Gráficos do app nativo com react-native-svg, sem Skia

**Status:** Accepted  
**Data:** 2026-07-31

## Contexto

O PWA desenha 5 gráficos com `recharts`: peso, força, cardio, passos e
intensidade de treino, mais o heatmap de consistência e o anel de calorias da
tela de nutrição.

`recharts` é SVG no DOM e não roda em React Native. Não existe substituição por
troca de import — a API é outra e os gráficos precisam ser reescritos. A escolha
de com o quê reescrever amarra todo gráfico futuro do app, então é decisão de
arquitetura e não de implementação (issue #127).

As duas opções reais:

- **`victory-native`** (v41+, a linha "XL"): alto nível, com escalas, eixos e
  animação prontos. Depende de `@shopify/react-native-skia`.
- **`react-native-svg` direto**: primitivas de desenho. Escalas e eixos por
  nossa conta.

`react-native-svg` já é dependência obrigatória do app por dois outros motivos
independentes de gráfico: o diagrama muscular anatômico (que tem IDs por grupo e
atributos `data-muscle` a preservar) e o anel de calorias.

## Decisão

Os gráficos usam **`react-native-svg` direto**, com um kit próprio em
`apps/mobile/src/components/charts/`. Skia fica de fora.

## Consequências

### Positivas

- Nenhum módulo nativo novo. Skia é uma dependência pesada — aumenta o tamanho do
  binário, entra no caminho crítico de todo build do EAS e é mais uma peça a
  acompanhar em atualização de SDK.
- O app continua rodando no Expo Go, o que encurta o ciclo de quem for testar
  sem montar ambiente nativo.
- Os gráficos aqui são simples: linha com pontos, barras, heatmap de calendário.
  Nenhum precisa do que Skia oferece de diferente — shaders, path complexo,
  animação a 120 fps sobre milhares de elementos.
- O kit é nosso, então os 5 gráficos compartilham escala, eixo e formatação de
  data em vez de cada um configurar a sua.

### Negativas

- Escala, ticks e rótulos de eixo são código nosso, com os erros de arredondamento
  e de caso-vazio que vêm junto. Mitigado por testes das funções de escala, que
  são puras.
- Sem animação de entrada de série. O PWA também não anima de forma relevante,
  então não há perda de paridade.
- Se algum dia entrar um gráfico realmente pesado — mapa de calor de série
  temporal longa, por exemplo — a decisão precisa ser revista. O kit isola o
  desenho, então a revisão é local.

### Neutras

- `react-native-svg` desenha via a camada de views nativas de SVG; para dezenas
  ou centenas de pontos o desempenho é adequado. As séries do produto são de
  dias ou semanas, não de milhares de amostras.

## Alternativas consideradas

- **`victory-native` + Skia:** rejeitada pelo custo de trazer Skia para desenhar
  linha e barra. O ganho seria em gráficos que o produto não tem.
- **`react-native-chart-kit`:** rejeitada por estar sem manutenção ativa e por
  não expor controle suficiente sobre eixo e formatação — o oposto do problema
  que temos, que é querer o desenho exato do PWA.
- **WebView com `recharts`:** rejeitada. Reaproveitaria o código do PWA, mas cada
  gráfico viraria um navegador embutido, com custo de memória, atraso de
  inicialização e um buraco de acessibilidade — leitor de tela não atravessa a
  WebView.
