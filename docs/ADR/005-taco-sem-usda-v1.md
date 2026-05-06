# ADR 005 — TACO como única base nutricional na v1

**Status:** Accepted  
**Data:** 2026-05-06

## Contexto

Para que o app calcule macros consistentemente a partir de "200g de arroz", precisamos de uma base nutricional. Opções principais: TACO (Tabela Brasileira de Composição de Alimentos, ~600 itens) e USDA FoodData Central (centenas de milhares).

## Decisão

V1 importa apenas a TACO. Itens fora dela são tratados como "livres", com macros estimados pelo Claude (sem `foodId`).

## Consequências

### Positivas
- Cobre 95% dos alimentos brasileiros do dia a dia
- Sem dependência de API externa
- Importação one-shot via script idempotente
- Dados em pt-BR, alinhados com o público

### Negativas
- Produtos industrializados (marcas) não estão na TACO
- Cortes específicos de carne, preparações regionais raras podem não ter
- Itens livres dependem da estimativa do Claude (margem de erro maior)

### Neutras
- USDA pode ser adicionada no futuro como `FoodSource.USDA` sem migration breaking

## Alternativas consideradas
- **USDA via API:** rejeitado. Latência, rate limits, dado em inglês, complexidade desproporcional para a v1.
- **Open Food Facts:** melhor para industrializados via barcode, mas barcode scanner está fora do escopo v1.
- **Base própria curada:** trabalho infinito sem ROI claro.
