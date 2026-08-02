# ADR 018 — Inferência paga pela Fatia não se expõe pelo MCP

**Status:** Accepted
**Data:** 2026-08-02

## Contexto

Sub-issue #165 da épica de BYO-AI (#163).

Hoje o produto tem dois caminhos de IA, e eles **coexistem no mesmo usuário**, no mesmo dia:

- **A IA do usuário.** Ele conecta o Claude dele ao `/mcp` e conversa. Quem decide e quem executa a
  inferência é o modelo dele, na assinatura dele. Isso nunca passa por gateway nosso — **custo de
  inferência para a Fatia: zero, por construção.** É a promessa que a landing `/claude-connect`
  faz por escrito ("Sem custo de IA").
- **A IA hospedada.** Ainda não existe (ADR 015): zero dependências, zero módulo, nenhuma chave em
  `.env.example`. Quando existir, toda chamada passa obrigatoriamente por gateway, e é lá — e só lá
  — que há custo a atribuir.

A fronteira de custo, portanto, é física: o que passa pelo gateway custa, o que não passa não
custa. Não precisa ser adivinhada.

**Menos uma coisa.** Se uma tool exposta pelo MCP disparar inferência hospedada por dentro, os dois
caminhos se cruzam no pior lugar possível: o usuário pede pelo Claude **dele**, e a conta cai na
Fatia. O exemplo é concreto e tentador — expor `recognize_meal_photo` como tool MCP faria o Claude
do usuário acionar a IA de visão paga por nós. O caminho de melhor margem viraria o de pior.

E não há sintoma. A tool funciona, os testes passam, o log não muda de forma. O primeiro sinal é a
fatura do gateway, semanas depois, sem nada apontando de onde veio.

A decisão registrada na #158 (cobrança **por cabeça**, não por consumo) piora esse caso em vez de
melhorar: o custo não tem para onde ser repassado.

## Decisão

**Capacidade que custa inferência à Fatia não é exposta como tool MCP. O default é não expor.**

Quando a exposição for mesmo o desenho certo, a forma aceita é **o cliente trazer o resultado
pronto** — o modelo do usuário faz a parte cara e chama a tool com dado estruturado. Não é
novidade: é o que o produto já faz. A ADR 004 (sem armazenamento de fotos) e a §1 do `docs/PRD.md`
descrevem o Claude analisando a imagem e chamando `log_meal` com os macros já calculados. **O
caminho de melhor margem já é o default do produto**; esta ADR só impede que ele seja desfeito por
acidente.

Para que "por acidente" seja impossível, a classificação é mecânica e obrigatória:

- `McpToolDef.hostedInference: boolean` — campo **obrigatório**, declarado por toda tool.
  Deliberadamente não é opcional com default `false`: um default faria justamente a tool cara
  nascer classificada como grátis, que é o caso que o campo existe para impedir.
- O campo fica **fora de `annotations`**. O registry serve `annotations` no fio, em toda sessão que
  lista as tools; isto é política interna de custo, não anotação da spec MCP, e não tem por que
  gastar contexto do cliente.
- `apps/api/src/mcp/__tests__/tool-catalog.spec.ts` reprova qualquer tool que declare `true` sem
  estar na lista `HOSTED_INFERENCE_TOOLS` do próprio spec. A lista nasce **vazia**: as 88 tools de
  hoje só leem e gravam dado.

Acrescentar um nome àquela lista é o ato explícito que esta ADR exige. Ele significa: "a Fatia
aceita pagar a inferência desta chamada", com o caso justificado aqui.

**Rejeitada por ora: expor e cobrar de alguém.** Não há de quem cobrar — a #158 fechou em preço por
cabeça — nem como medir: o registro de uso por chamada é da #135 e ainda não existe. Cobrar sem
medir é escolher o número errado.

## Consequências

### Positivas

- A armadilha de custo passa a ser um erro de CI, não uma linha na fatura.
- A guarda nasce verde e custa quase nada: 88 declarações de `false` e um caso de teste.
- Sai **antes** de a #133 expor a primeira capacidade de IA. Depois disso ela seria inútil — a
  armadilha já estaria armada.
- A promessa pública "sem custo de IA" ganha um mecanismo que a sustenta, em vez de depender de
  todo mundo lembrar.

### Negativas

- Capacidade de IA hospedada fica **fora** do conector. Quem usa o Fatia pelo Claude não terá, pelo
  MCP, o que a IA do app fizer — e essa assimetria vai contra a ADR 006 (MCP-first: tudo que o app
  faz, o Claude faz). É o preço aceito de propósito, e o único ponto onde a ADR 006 cede.
- 88 arquivos ganharam uma linha mecânica. Edição mecânica é onde o esquecimento se esconde — daí a
  guarda ser sobre presença do campo, e não sobre o valor dele.

### Neutras

- O campo é interno: não aparece no JSON Schema, na `description`, nem nas `annotations` servidas.
  Nada muda para quem já usa o conector.
- Isto **não** cobre a atribuição de custo por chamada. Origem (`external_mcp` × `hosted_agent`) é
  campo do registro de uso que a #135 vai criar, e continua pendente na #165.

## Alternativas consideradas

- **Campo opcional com default `false`.** Rejeitada pelo mesmo motivo já escrito no
  `tool.decorator.ts` para `destructiveHint`: quem esquece, esqueceria na direção errada. A tool
  cara nasceria grátis, silenciosamente — exatamente o desfecho que a issue descreve.
- **Campo dentro de `McpToolAnnotations`.** Era a proposta do plano da #165. Rejeitada porque o
  registry faz `annotations: { title, ...tool.annotations }`: a classificação iria no fio para todo
  cliente, em toda sessão, sem servir a nenhum deles. Há um caso de teste dedicado a impedir que
  ela volte para lá.
- **Revisão humana no code review, sem guarda.** Rejeitada: é precisamente o tipo de erro que passa
  no review, porque o diff que o cria (uma tool nova que chama um service novo) não tem nada de
  suspeito à vista.
- **Detectar em runtime, medindo chamadas ao gateway a partir do contexto MCP.** Chegaria tarde —
  detecta depois de gastar — e depende de um gateway que ainda não existe. A guarda estática custa
  menos e age antes do merge.
- **Expor a capacidade cara e cobrar de quem chama.** Rejeitada por ora; ver acima.
