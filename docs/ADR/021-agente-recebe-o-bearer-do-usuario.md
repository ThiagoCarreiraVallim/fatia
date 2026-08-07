# ADR 021 — O agente recebe o Bearer do usuário, e só o usa contra o `/mcp`

**Status:** Accepted
**Data:** 2026-08-06

## Contexto

O chat hospedado (#247) precisa que o agente responda sobre **o dado de quem está conversando**:
"o que eu comi ontem", "quanto eu levantei no supino em julho". Nenhuma dessas respostas existe sem
tocar o Postgres, e o agente não tem — nem vai ter — credencial de banco.

A [ADR 015](./015-agente-python-langgraph-cliente-mcp.md) já respondeu como isso deveria acontecer:
o agente é mais um cliente do `/mcp`, autenticado com o token do usuário em nome de quem age. Só
que, até aqui, nenhum fluxo tinha exercitado esse desenho — o único que existia (`/recognize-meal`,
#139) olha uma foto e devolve candidatos, sem tocar em dado nenhum. E o docstring de
`apps/agent/src/fatia_agent/api.py` registrou o oposto, com todas as letras:

> Ela **não** recebe identidade de usuário: o agente não fala com o banco nem com o `/mcp` neste
> fluxo, e mandar um Bearer de usuário para um serviço que não precisa dele só aumentaria o estrago
> de um comprometimento.

A frase estava certa para a rota que existia, e o raciocínio dela continua certo. O chat **inverte a
conclusão** — não porque o raciocínio mudou, mas porque a premissa mudou: agora há um fluxo que
precisa do token. Uma inversão dessas não pode acontecer num diff de rota. Daí esta ADR.

O que está em jogo é concreto: **o agente passa a ser um segundo lugar por onde o token de acesso de
cada usuário transita.** É um processo em outra linguagem, com outro toolchain de log e outra pilha
de dependências — e a #214 mostrou que basta um serializador com default generoso para o
`authorization` de todo mundo ir parar no log sem ninguém pedir.

## Decisão

**O `POST /chat` do agente exige `Authorization: Bearer <token do usuário>` e o encaminha ao `/mcp`
do NestJS. Esse é o único destino do token, e ele não entra em log, span, estado do grafo nem
histórico.**

### Duas credenciais, dois papéis, nenhuma substitui a outra

| Credencial             | Responde                       | Quem emite | Falta dela            |
| ---------------------- | ------------------------------ | ---------- | --------------------- |
| `X-Fatia-Agent-Key`    | "esta chamada pode gastar IA?" | operador   | 401 (proxy aberto)    |
| `Authorization` Bearer | "em nome de quem?"             | usuário    | `MCP_UNAUTHENTICATED` |

A primeira é a fronteira de custo da [ADR 018](./018-inferencia-hospedada-fora-do-mcp.md) e já valia
para `/recognize-meal`. A segunda é o que esta ADR acrescenta. Uma rota com a primeira e sem a
segunda seria inferência paga que não alcança dado nenhum; com a segunda e sem a primeira, seria um
proxy aberto para o gateway.

### O agente continua sem tocar o banco

Não existe `DATABASE_URL` em `apps/agent` e não deve passar a existir. Toda leitura sai por
`chat/mcp_client.py` → `/mcp` → NestJS → Postgres. É a consequência que dá valor a tudo isto: quem
filtra por `userId` continua sendo **um lugar só**, com os testes de isolamento que já existem
(`user-isolation.spec.ts`, `tool-user-scoping.spec.ts`). Um agente com acesso próprio ao banco
criaria um segundo ponto de garantia, sem RLS embaixo para segurar erro
([ADR 010](./010-row-level-security.md)) e sem nenhum desses testes.

### O recorte: o chat hospedado só chama tool de **leitura**

Das tools do catálogo, o agente recebe as que o próprio `/mcp` anuncia com
`annotations.readOnlyHint === true` — hoje pouco menos da metade.

**Por que só leitura.** O que a IA produz é sugestão; quem grava é o caminho manual, com tela de
confirmação. É a propriedade que a #139 estabeleceu e que a
[ADR 004](./004-sem-armazenamento-fotos.md) registra, e ela é o que torna a confirmação obrigatória
por construção em vez de por disciplina. A tela de chat da épica não tem confirmação de escrita —
"apaga minha refeição de ontem", ditado para um modelo pequeno, ficaria a uma alucinação de
distância de um `delete_meal`. Ler é reversível; gravar não.

**Por que um critério derivado, e não uma lista de nomes.** Lista à mão apodrece de duas formas, as
duas silenciosas: tool renomeada sai do recorte sem aviso, e tool nova entra (ou fica de fora) por
esquecimento. `readOnlyHint` é servido em toda sessão pelo `mcp-tool.registry.ts` e já é protegido
do outro lado — `tool-catalog.spec.ts` reprova tool que não declare os dois hints, e reprova a que
se declare somente-leitura com nome de escrita. O recorte do agente **herda** essa guarda em vez de
duplicá-la.

**Falha fechada, e em dois lugares.** Tool sem `annotations`, ou com `readOnlyHint` que não é o
booleano `true`, fica de fora — `"true"` e `1` não passam. E o recorte é conferido **de novo** na
hora de chamar: modelo pequeno inventa nome de função, e um nome inventado que por acaso exista no
catálogo de escrita não pode virar escrita só porque nunca foi oferecido.

### Onde o token pode estar, e onde não pode

| Lugar                                | Vale? | Por quê                                                            |
| ------------------------------------ | ----- | ------------------------------------------------------------------ |
| Header do `httpx.AsyncClient` do MCP | ✅    | é o destino; o `repr` do `httpx` já o oculta                       |
| Estado do grafo LangGraph            | ❌    | é o que um checkpointer grava e o que o `langsmith` exporta        |
| `config`/`configurable` do LangGraph | ❌    | idem — vai junto nos metadados da execução                         |
| Corpo da requisição de `/chat`       | ❌    | acabaria no histórico que o NestJS persiste, e em log de validação |
| Mensagem de erro                     | ❌    | mensagem de erro vira log                                          |
| Qualquer evento do SSE               | ❌    | o fluxo atravessa NestJS e PWA                                     |

Na prática: o grafo é **montado por conversa** e o cliente MCP é alcançado por fecho, não pelo
estado. Não há checkpointer — a persistência da conversa é do NestJS, e um checkpointer aqui
gravaria histórico de saúde num segundo lugar, fora do banco que a `/privacy` descreve.

### `MCP_BASE_URL` recusa `http://` contra endereço de fora da rede

Uma `MCP_BASE_URL` errada não vaza dado do agente: vaza a **credencial** de quem está usando o
produto, para quem quer que atenda naquele endereço. `http://` para fora põe o token em texto puro
no fio, e é a única forma de errar que dá para reconhecer olhando só a configuração.

O que conta como "dentro" é o host **não ser registrável no DNS público**: `localhost`, os IPs de
laço, `host.docker.internal` e qualquer nome de rótulo único — `api`, que é como o `apps/api` atende
dentro do compose. Exigir TLS ali só faria alguém inventar um certificado; pior, recusar `api`
devolvia 503 `MCP_NOT_CONFIGURED` em toda mensagem de quem sobe o compose seguindo o `.env.example`,
mandando "use https ou aponte para um host local" numa rede onde https não existe e `localhost` é o
próprio agente. Endereço com ponto (`api.exemplo.com`) e IPv6 literal continuam exigindo TLS: os
dois podem estar do outro lado da internet.

## Consequências

### Positivas

- **O isolamento por `userId` continua com um dono só.** Nenhum caminho de leitura novo, nenhum
  teste de isolamento novo — é a promessa da ADR 015, agora exercitada.
- **O estrago de um agente comprometido é limitado ao que aquele token já podia fazer**, e menos:
  só as tools de leitura, porque é só isso que o agente chama.
- Reusa autenticação, escopo e o rate limit por usuário do `mcp-throttler.guard.ts`.
- A degradação continua explícita: sem `AI_BASE_URL` ou sem `MCP_BASE_URL`, o `/chat` responde erro
  nomeado com status, e o resto do produto segue inteiro.

### Negativas

- **Existe agora um segundo lugar por onde o Bearer transita.** É o custo real desta decisão. Ele
  fica contido pela tabela acima, por `tests/chat/test_sem_vazamento.py` — que exercita a conversa
  inteira e varre log, eventos e estado final — e por não haver, no agente, nenhum sink de log ou
  telemetria que grave requisição.
- **Se o agente for comprometido enquanto uma conversa acontece, o token daquela conversa está na
  memória do processo.** Não há como evitar isso e ter a funcionalidade; o que há é limitar a
  janela (o cliente morre com a requisição) e o alcance (só leitura).
- **O catálogo de leitura custa contexto em toda mensagem.** Descrições de dezenas de tools entram
  no prompt a cada turno. Aceito por ora: as tools de escrita — que carregam os exemplos de
  invocação da #111, o pedaço mais caro do catálogo — ficam de fora por construção. Estreitar por
  relevância é otimização com gatilho medido, não agora.
- **O `/mcp` vira dependência de produção do chat.** Já era da ADR 015; agora é sentido.

### Neutras

- O `/recognize-meal` **não** muda: continua sem identidade de usuário, pelo motivo original. As
  duas rotas divergem de propósito, e o docstring de `api.py` foi corrigido para dizer isso — a
  frase antiga afirmava o contrário do que passa a valer.
- O cliente MCP é escrito à mão sobre `httpx`, e não com o SDK `mcp`. O `/mcp` do `apps/api` é sem
  sessão (transporte novo por requisição, `sessionIdGenerator: undefined`), então não há
  `initialize` a fazer nem sessão a manter: sobra um POST de JSON-RPC com resposta em SSE. A troca é
  menos dependência e erros nomeados diretos, contra depender de o `/mcp` continuar sem sessão — o
  que o teste de fumaça `tests/smoke/test_chat_smoke.py` verifica contra o servidor de verdade.

## Alternativas consideradas

- **Continuar sem identidade: o NestJS busca o dado e manda no corpo.** Preserva o isolamento
  igualmente bem e mantém o agente sem token — é a alternativa mais segura das duas. Rejeitada
  porque obriga a API a adivinhar, antes da inferência, **qual** dado a conversa vai precisar. Num
  fluxo de uma pergunta só isso é possível; num chat, é o modelo que decide depois de ler a
  pergunta. Mandar tudo por precaução seria mandar o histórico de saúde inteiro para o gateway a
  cada mensagem — pior em privacidade do que o que se quis evitar.
- **Um token de serviço do agente, com escopo amplo.** Tiraria o token do usuário do agente, mas
  criaria uma credencial que lê **qualquer** conta. Um comprometimento deixaria de valer uma
  conversa e passaria a valer a base inteira. É o pior dos dois mundos: mesma superfície, estrago
  sem teto.
- **Dar `DATABASE_URL` ao agente.** Rejeitada pela ADR 015 e continua rejeitada, agora com um motivo
  a mais: as tools do `/mcp` já resolvem timezone, permissão e formato, e reimplementar isso em
  Python seria reimplementar o isolamento junto.
- **Oferecer as tools de escrita também.** Rejeitada até haver tela de confirmação. Quando houver, a
  mudança é de uma linha em `chat/tool_policy.py` — e de uma ADR, que é o ponto.
- **Manter o token no estado do grafo, por comodidade.** Rejeitada: é exatamente o formato que
  checkpointer e tracing serializam. O custo de evitá-la é montar o grafo por conversa, que é
  montar quatro dicionários.
