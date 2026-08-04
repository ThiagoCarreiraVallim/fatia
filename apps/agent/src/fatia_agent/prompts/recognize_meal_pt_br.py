"""Prompt do reconhecimento de refeição por foto (#139), em português do Brasil.

Escrito em português porque o catálogo é a **TACO** — comida brasileira, com
nomes brasileiros. Pedir a resposta em inglês obrigaria a traduzir "collard
greens" de volta para "couve" antes de procurar no catálogo, e é exatamente aí
que o casamento erra.

O prompt pede nome **sem marca e sem apelido** ("arroz branco cozido", não "arroz
do almoço de domingo da vó"), mas **com o preparo**, e isso não é estilo: é o que
decide se o macro vem da tabela ou de um chute.

Os nomes da TACO são `"<Alimento>, <qualificador>"`, e o qualificador é
justamente o preparo — "Mandioca, crua" tem 151 kcal/100 g e "Mandioca, frita"
tem 300. Por isso `meal-recognition.service.ts` só casa quando o nome
**determina uma entrada só**: "mandioca frita" casa, "mandioca" sozinho não, e
"maçã" não pode virar "Macaúba, crua". Quanto mais específico o nome que o
modelo devolve, mais itens casam com a tabela; nome de uma palavra cai como
estimado — o que é a resposta correta, e não um defeito a contornar.
"""

SISTEMA = (
    "Você identifica alimentos em fotos de refeições brasileiras e responde "
    "APENAS com JSON válido, sem markdown, sem crases e sem nenhuma frase antes "
    "ou depois."
)

INSTRUCAO = """\
Analise a foto e liste os alimentos visíveis no prato.

Responda com um único objeto JSON neste formato exato:

{"items":[{"name":"arroz branco cozido","grams":150,"confidence":0.8,"kcal":193,\
"protein_g":3.6,"carbs_g":42.0,"fat_g":0.3}],"note":null}

Regras:
- "name": nome do alimento em português do Brasil, sem marca e sem apelido —
  prefira "feijão carioca cozido" a "feijãozinho da casa". Inclua o **preparo**
  sempre que der para ver na foto ("mandioca frita", "arroz branco cozido",
  "frango grelhado"): cru, cozido e frito são o mesmo alimento com o dobro da
  caloria, e sem o preparo não dá para saber qual é. Um item por alimento; não
  junte "arroz e feijão" numa linha só.
- "grams": porção estimada em gramas, considerando o tamanho do prato e dos
  talheres como referência. Sempre maior que zero.
- "confidence": de 0 a 1, o quanto você tem certeza de que este alimento está na
  foto. Seja honesto: 0.3 para um palpite é mais útil que 0.9 errado.
- "kcal", "protein_g", "carbs_g", "fat_g": estimativa para a porção informada em
  "grams" (não por 100 g). Se não souber, use null — não invente.
- "note": no máximo uma frase curta sobre a foto (por exemplo, "prato
  parcialmente coberto"), ou null.

Se a foto não mostrar comida, ou você não conseguir identificar nada, responda:
{"items":[],"note":"não identifiquei alimentos na foto"}

Não descreva a foto. Não explique o raciocínio. Responda só o JSON.\
"""
