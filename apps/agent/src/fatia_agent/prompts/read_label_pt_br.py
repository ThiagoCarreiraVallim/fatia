"""Prompt da leitura do rótulo (#375), em português do Brasil.

Pede a coluna **por 100 g** quando existe: o rótulo brasileiro (RDC 429/2020)
traz as duas colunas, e a de 100 g dispensa a conta de porção, que é onde a
leitura mais erra. Sem ela, os valores por porção e o tamanho da porção.
"""

SISTEMA = (
    "Você lê a tabela nutricional de embalagens brasileiras e responde APENAS com "
    "JSON válido, sem markdown, sem crases e sem nenhuma frase antes ou depois."
)

INSTRUCAO = """\
Leia a tabela nutricional da foto.

Responda com um único objeto JSON neste formato exato:

{"name":"Iogurte natural integral","per":"100g","serving_grams":170,"kcal":51,\
"protein_g":4.1,"carbs_g":5.3,"fat_g":3.0,"fiber_g":0,"sodium_mg":60,"note":null}

Regras:
- "per": "100g" se a tabela tem a coluna por 100 g (ou 100 ml); use os valores
  dessa coluna. Se só houver a coluna da porção, "serving" e os valores da porção.
- "serving_grams": o tamanho da porção em gramas (ou ml), como impresso
  ("Porção de 30 g" → 30). null se não estiver na foto.
- "kcal": valor energético em kcal (não kJ). "protein_g", "carbs_g" (carboidratos
  totais), "fat_g" (gorduras totais), "fiber_g" (fibra alimentar) em gramas;
  "sodium_mg" em miligramas.
- Campo que não aparece ou não dá para ler: null. Nunca invente e nunca use 0
  no lugar de "não li".
- "name": o nome do produto se aparecer na foto, senão null.
- "note": no máximo uma frase curta ("foto cortada", "tabela borrada"), ou null.

Se a foto não mostrar uma tabela nutricional, responda:
{"per":"100g","note":"não encontrei a tabela nutricional"}

Responda só o JSON.\
"""
