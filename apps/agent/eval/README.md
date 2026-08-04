# Conjunto de avaliação do reconhecimento de refeição (#138)

Este diretório é **o conjunto**, não o código. O runner e as métricas moram em
`src/fatia_agent/eval/`; aqui ficam os rótulos, as imagens (fora do git) e o
ledger das medições.

> **O número de precisão do reconhecimento não existe até este diretório ter
> fotos rotuladas com peso de balança.** Nada no repositório reporta precisão
> hoje, e é assim de propósito: o gerador de relatório se recusa a emitir
> veredito abaixo de 30 fotos no split de avaliação. Ver
> [`docs/benchmark-reconhecimento-refeicao.md`](../../../docs/benchmark-reconhecimento-refeicao.md).

## O que você precisa entregar

| item                           | quantidade | por quê                                       |
| ------------------------------ | ---------- | --------------------------------------------- |
| fotos rotuladas, no total      | ≥ 50       | menos que isso não sustenta um veredito       |
| delas, no split `eval`         | ≥ 30       | é sobre este split que o número é publicado   |
| delas, no split `dev`          | o resto    | é olhando **estas** que o prompt é ajustado   |
| fotos de controle (sem comida) | 2 ou 3     | medem se o modelo inventa comida onde não tem |

**Cardápio**, seguindo a issue: prato feito (arroz, feijão, bife, salada),
feijoada, açaí, pão de queijo, marmita, tapioca, cuscuz, farofa, moqueca,
sanduíche natural.

**Variar a condição importa mais do que aumentar o N.** Cinquenta fotos tiradas
pela mesma pessoa, na mesma cozinha, com a mesma luz e sempre de cima medem
aquela condição — não o uso real. Varie ângulo, luz, prato, restaurante e
celular, e escreva o que variou no campo `condicao`.

## Como rotular uma foto

1. **Pese antes de comer.** Balança de cozinha, item por item, no prato. Este é o
   passo que não tem atalho: rotular por estimativa transforma a métrica de
   porção numa comparação entre a estimativa do modelo e a estimativa de um
   humano, e ela deixa de medir qualquer coisa.
2. Tire a foto **antes** de mexer no prato.
3. Salve a imagem como `images/<id>.jpg` (ou `.png`/`.webp`). O `<id>` é o nome
   do arquivo sem extensão, em minúsculas: `prato-feito-01`.
4. Calcule o `sha256`:

   ```bash
   sha256sum apps/agent/eval/images/prato-feito-01.jpg
   ```

5. Acrescente **uma linha** ao `manifest.jsonl` — uma foto por linha, sem quebra
   no meio (é JSON Lines, e não JSON):

   ```text
   {"id":"prato-feito-01","sha256":"<64 hex>","split":"eval","condicao":"almoço em casa, luz de janela, de cima","items":[{"food":"arroz branco cozido","grams":152,"kcal_100g":128},{"food":"feijão carioca cozido","grams":98,"kcal_100g":76},{"food":"bife de contrafilé grelhado","grams":110,"kcal_100g":220}]}
   ```

O manifesto é lido por `src/fatia_agent/eval/manifest.py`, que recusa campo
desconhecido: um `gramas` escrito no lugar de `grams` vira erro na hora, e não um
rótulo sem peso descoberto depois do número publicado.

### Os campos

| campo               | obrigatório | o que é                                                 |
| ------------------- | ----------- | ------------------------------------------------------- |
| `id`                | sim         | minúsculas, sem espaço. É o nome do arquivo da imagem.  |
| `sha256`            | sim         | do arquivo da imagem. Amarra o número **a esta foto**.  |
| `split`             | sim         | `dev` (ajuste do prompt) ou `eval` (medição).           |
| `items[].food`      | sim         | nome em português, **com o preparo**: "mandioca frita". |
| `items[].grams`     | sim         | o que a **balança** disse.                              |
| `items[].kcal_100g` | não, mas    | kcal por 100 g da entrada da TACO que você escolheu.    |
| `condicao`          | não         | luz, ângulo, local. Vira contexto do relatório.         |

**Sem `kcal_100g` não há métrica em kcal** — e a métrica em kcal é a que decide,
porque errar 30 % na gramagem do arroz custa muito menos caloria do que errar
30 % no óleo. Ela vem do rótulo, e não do modelo, porque é assim que o produto
calcula: quando o item casa com a TACO, `meal-recognition.service.ts` descarta a
estimativa do modelo e usa a tabela com a grama que ele estimou.

Para achar a `kcal_100g`, procure o alimento no próprio Fatia (a busca é o mesmo
catálogo) e use o valor da entrada que você escolheria à mão.

### `items` vazio é rótulo legítimo

Foto de prato lavado, de mesa vazia ou de um copo d'água entra com
`"items": []`. É o controle negativo: mede se o modelo inventa comida onde não
tem. Sem ele, a taxa de alucinação só é medida onde há comida.

## As imagens não entram no git

`images/` está no `.gitignore` da raiz. Foto de refeição de gente real mostra o
que a pessoa come e, pelo enquadramento, onde ela estava — em contexto de saúde
isso é dado sensível, a mesma categoria que `docs/DATA_RETENTION.md` promete não
guardar. Um diretório de pratos num repositório público não tem desfazer.

O que é versionado é o **rótulo** e o `sha256`. Quem quiser reproduzir o número
recebe as imagens por outro canal, e o `sha256` prova que são as mesmas.

## Rodando

```bash
cd apps/agent
uv run python -m fatia_agent.eval.run_benchmark \
  --base-url http://localhost:1234/v1 \
  --model google/gemma-4-12b-qat \
  --split dev \
  --saida /tmp/benchmark-dev
```

Trocar de provedor é trocar `--base-url` e `--model` — o mesmo conjunto contra o
LM Studio local e contra o gateway, que é exatamente para isso que a abstração da
[ADR 015](../../../docs/ADR/015-agente-python-langgraph-cliente-mcp.md) existe.

**Contra um endpoint remoto, as listas de `allowed_models.py` valem.** O
benchmark passa pelo mesmo `build_provider` do produto, então medir contra um
gateway exige que host e modelo tenham passado pela revisão de subprocessador da
#136 — mandar cinquenta fotos de comida de gente real para um terceiro não
declarado é a mesma decisão de privacidade, e não uma exceção porque "é só
teste".

### O split `eval` roda uma vez por prompt

O prompt vai ser ajustado; é o trabalho. Se o ajuste for feito olhando as fotos
que produzem o número, o número fica otimista e **ninguém consegue auditar isso
depois**. Duas coisas defendem contra isso:

- ajuste o prompt olhando **só** o split `dev`;
- o runner registra cada medição de `eval` em `eval-runs.jsonl` (versionado,
  para a repetição aparecer no diff) e recusa repetir com o mesmo prompt, o mesmo
  modelo e o mesmo conjunto. Mudou o prompt, a impressão digital muda e a
  medição libera.

`--repetir-eval` existe para o caso legítimo (o provedor caiu no meio). Usar para
"tentar de novo, quem sabe melhora" é o vazamento que o ledger existe para tornar
visível.

## O `manifest.example.jsonl`

Três linhas, para você ver o formato — **e as imagens correspondentes não
existem**. Copiar o exemplo e rodar dá erro de foto ausente, o que é o
comportamento certo: um manifesto de exemplo não é um conjunto de avaliação, e um
benchmark que roda sobre três fotos inventadas produz um número que alguém vai
citar.

```bash
cp apps/agent/eval/manifest.example.jsonl apps/agent/eval/manifest.jsonl
# … e então substitua as três linhas pelas suas.
```
