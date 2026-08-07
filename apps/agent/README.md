# `apps/agent` — agente de IA da Fatia

Serviço **Python**, separado do monorepo pnpm, decidido pela
[ADR 015](../../docs/ADR/015-agente-python-langgraph-cliente-mcp.md). É a **segunda linguagem**
do repositório: lint, teste, build e imagem próprios, descritos aqui.

Duas coisas que a ADR fixou e que valem antes de qualquer leitura de código:

- **O agente não tem credencial de banco e não tem rota privilegiada.** Ele alcança dado do usuário
  pelo `/mcp` do NestJS, com o Bearer **do próprio usuário** — é o que o `/chat` faz desde a #248
  ([ADR 021](../../docs/ADR/021-agente-recebe-o-bearer-do-usuario.md)). Quem filtra por `userId`
  continua sendo um lugar só. Não existe `DATABASE_URL` aqui, e não deve passar a existir.
- **Sem provedor configurado, a capacidade degrada explicitamente.** O serviço sobe, `/health`
  responde 200, e quem pedir inferência recebe um erro nomeado com mensagem acionável. O produto
  continua inteiro sem IA hospedada — é como ele funciona hoje.

## Rotas de inferência

`POST /recognize-meal` (#139) — foto de refeição em base64 → alimentos candidatos.

```bash
curl -s localhost:8100/recognize-meal \
  -H 'Content-Type: application/json' \
  -H "X-Fatia-Agent-Key: $AGENT_API_KEY" \
  -d "{\"image_base64\":\"$(base64 -w0 prato.jpg)\",\"media_type\":\"image/jpeg\"}"
```

Três propriedades que valem mais que o código:

- **Não grava nada e não devolve refeição.** O que sai é sugestão; quem grava é o `apps/api`,
  pelo caminho manual que já existe. É isso que torna a tela de confirmação da #139 obrigatória
  por construção, e não por disciplina.
- **A imagem vive em memória e morre com a requisição** — ADR 004. Sem arquivo temporário, sem
  cache, sem log do conteúdo. O `apps/api` já remove os metadados (EXIF/GPS) antes de mandar.
- **O corpo não tem campo de identidade**, e `extra: "forbid"` recusa qualquer um que apareça. O
  agente não sabe de quem é a foto, e não deve passar a saber — neste fluxo ele não fala com o
  banco nem com o `/mcp`, então um Bearer de usuário aqui só aumentaria o estrago de um
  comprometimento.

**Autenticação: `AGENT_API_KEY`, exigida quando `AI_BASE_URL` não é local.** Uma rota de
inferência anônima é um proxy aberto para o gateway pago — a fronteira de custo da
[ADR 018](../../docs/ADR/018-inferencia-hospedada-fora-do-mcp.md). A exigência acompanha o custo, e
não o ambiente: com o LM Studio local inferência não custa nada e pedir segredo só faria o
desenvolvimento inventar um. Não há `if ambiente == 'prod'` em lugar nenhum.

**Sem LangGraph nesta rota, e isso continua valendo.** O grafo previsto no plano da #139 tinha três
passos: visão → `search_food` pelo MCP → casamento com a TACO. Os dois últimos ficaram no `apps/api`,
que já tem o catálogo e o mesmo ranqueamento de busca que a pessoa usa digitando. O que sobra aqui é
uma chamada e uma validação, em linha reta — um grafo de um nó só seria a dependência e a cerimônia
sem o benefício. O LangGraph entrou com o chat, que é o caso oposto: ele **volta**.

---

`POST /chat` (#248) — conversa com as ferramentas de leitura do `/mcp`, em SSE.

```bash
curl -N localhost:8100/chat \
  -H 'Content-Type: application/json' \
  -H "X-Fatia-Agent-Key: $AGENT_API_KEY" \
  -H "Authorization: Bearer $TOKEN_DO_USUARIO" \
  -d '{"message":"o que eu comi ontem?","history":[]}'
```

**Duas credenciais, dois papéis.** `X-Fatia-Agent-Key` responde "esta chamada pode gastar inferência
paga?" (ADR 018); `Authorization: Bearer` responde "em nome de quem?" e é repassado inteiro ao
`/mcp`. Nenhuma substitui a outra: sem a primeira, a rota é proxy aberto para o gateway; sem a
segunda, não há dado a alcançar. É a inversão registrada na
[ADR 021](../../docs/ADR/021-agente-recebe-o-bearer-do-usuario.md) — leia-a antes de mexer aqui.

**O agente só chama tool de leitura.** As que o próprio `/mcp` anuncia com
`annotations.readOnlyHint === true`, e nenhuma lista de nomes mora neste repositório: o critério é
derivado do catálogo a cada conversa, e conferido de novo na hora de chamar (modelo pequeno inventa
nome de função). Gravar continua sendo o caminho manual, com tela de confirmação — é a propriedade
da ADR 004, e a tela de chat da épica não tem confirmação de escrita.

**O Bearer não entra em log, span, estado do grafo nem histórico.** Ele vive nos headers do cliente
`httpx` e em mais lugar nenhum: o grafo é montado por conversa e o cliente é alcançado por fecho, e
não pelo `state` nem pelo `config` — que são o que um checkpointer grava e o que o `langsmith`
(dependência transitiva do LangGraph) exportaria. `tests/chat/test_sem_vazamento.py` exercita a
conversa inteira e varre log, saída padrão, eventos e estado final — com controle negativo, porque
varrer um canal vazio é uma afirmação sobre nada.

### O contrato SSE, fixado aqui

As três camadas da #247 são construídas em paralelo. Nomes de evento e chaves em inglês, como o
resto do fio (`{"error": {"code", "message"}}`).

```
event: token
data: {"text":"Você "}

event: tool
data: {"name":"list_meals","phase":"start","arguments":"{\"date\":\"2026-08-05\"}"}

event: tool
data: {"name":"list_meals","phase":"end","ok":true,"result":"[...]"}

event: error
data: {"code":"MCP_UNAUTHORIZED","message":"..."}

event: done
data: {"reason":"stop"}
```

Quatro garantias que o NestJS e o PWA podem assumir:

1. **`done` é sempre o último evento**, inclusive depois de `error`. Um cliente que só fecha no
   `done` não fica pendurado por causa de uma falha.
2. **`error` é terminal**, e o `done` seguinte traz `reason: "error"`. Os outros motivos são `stop`
   e `step_limit`.
3. **O que falha antes do primeiro byte falha com status**, no envelope JSON de sempre — provedor
   ausente (503), Bearer ausente (401), chave do agente recusada (401, `AGENT_KEY_REJECTED`), corpo
   inválido (422, `INVALID_REQUEST`), token recusado pelo `/mcp` (401). **Todos** no formato
   `{"error": {"code", "message"}}`: não há `{"detail": ...}` em caminho nenhum do `/chat`, e o
   corpo do 422 não devolve o que a pessoa escreveu. O catálogo é buscado antes de o fluxo abrir
   justamente para que um token expirado chegue como 401, e não como um 200 que o PWA teria de
   destrinchar. Depois que o fluxo abre, o 200 já foi enviado e o erro só cabe como evento.
4. **Só a mensagem de agora tem teto duro: 4 000 caracteres.** Passar disso é 422 — a pessoa está
   olhando para o campo, e o cliente sabe contar antes de enviar. O **histórico não tem teto**: o
   agente usa as últimas 40 mensagens e corta cada `content` em 4 000 caracteres, com marca visível.
   A diferença é deliberada. O histórico carrega a resposta do modelo, e não há `max_tokens` no
   payload: um "monte um plano de 7 dias" com 6 000 caracteres, persistido pelo NestJS e reenviado
   no turno seguinte, viraria um 422 **permanente** — a conversa morta por um teto nosso que nem o
   PWA nem o NestJS teriam como enxergar.

`Cache-Control: no-transform` e `X-Accel-Buffering: no` saem na resposta: se qualquer camada
bufferizar, o chat parece travado até a última palavra e o streaming das outras duas se perde. Do
lado de cá, `tests/chat/test_graph.py` segura a mesma propriedade com um provedor que só termina o
turno quando o teste manda: o primeiro `token` tem de chegar com o modelo ainda escrevendo.

## Como rodar

Pré-requisito: [`uv`](https://docs.astral.sh/uv/).

```bash
cd apps/agent
cp .env.example .env          # opcional: sem ele, o serviço sobe degradado
uv sync                       # cria .venv e instala a partir do uv.lock
uv run uvicorn fatia_agent.api:app --reload --port 8100
```

```bash
curl -s localhost:8100/health        # 200 sempre, com o estado da IA
curl -s localhost:8100/capabilities  # 200 com os modelos, ou 503 nomeado
```

Pelo compose (perfil próprio, opt-in — `infra:up:full` não sobe o agente):

```bash
docker compose --env-file .env -f infra/docker-compose.yml --profile agent up -d --build agent
```

### Contra o LM Studio local

O LM Studio serve um endpoint OpenAI-compatível em `http://localhost:1234/v1`, sem autenticação.
De dentro do container, o host é `host.docker.internal`. Confira o que está no ar com:

```bash
curl -s localhost:1234/v1/models
```

## Lint, tipo e teste

```bash
uv run ruff check .        # lint
uv run ruff format .       # formatação (o prettier da raiz não toca em .py)
uv run mypy                # tipos, modo strict — o equivalente ao "sem any" do TypeScript
uv run pytest              # suíte que não precisa de rede (o -m "not smoke" é default)
uv run pytest -m smoke     # exige provedor e/ou /mcp no ar; ver abaixo
```

O `pytest` nu **não** fala com rede nem precisa do LM Studio ligado: o transporte do `httpx` é
substituído por um duplo que devolve respostas gravadas de um endpoint OpenAI-compatível — e, no
caso do chat, de um `/mcp` que responde SSE com JSON-RPC dentro, como o do NestJS responde.

O `-m smoke` é o único que prova que a configuração está certa **de verdade** — o duplo prova o
nosso lado do protocolo, não o do outro. Cada grupo se auto-pula sem as variáveis dele:

```bash
AI_BASE_URL=... uv run pytest -m smoke                       # o provedor
MCP_BASE_URL=... MCP_BEARER=... uv run pytest -m smoke        # o /mcp do apps/api
```

O smoke do `/mcp` é o que verifica a propriedade da qual todo o `chat/mcp_client.py` depende: que o
`/mcp` aceita um POST de JSON-RPC **sem `initialize`, sem sessão e sem cabeçalho de versão**. Ela é
do outro repositório; se mudar, é ali que aparece.

## Configuração

Todas as variáveis estão em `.env.example`. As que decidem o comportamento:

| Variável             | Papel                                                                         |
| -------------------- | ----------------------------------------------------------------------------- |
| `AI_BASE_URL`        | Endpoint OpenAI-compatível. Vazio = degradação explícita.                     |
| `AI_API_KEY`         | Obrigatória fora de `localhost`. O LM Studio dispensa; gateway não.           |
| `AI_MODEL_TEXT`      | Modelo da capacidade de texto.                                                |
| `AI_MODEL_VISION`    | Modelo da capacidade de visão.                                                |
| `AI_MODEL_EMBEDDING` | Modelo da capacidade de embedding.                                            |
| `AI_TIMEOUT_S`       | Timeout por chamada. Default folgado: visão em CPU é lenta.                   |
| `AI_MAX_RETRIES`     | Repetições em 429 e 5xx. 401/403 não são repetidos.                           |
| `AGENT_API_KEY`      | Segredo compartilhado com o `apps/api`. Obrigatório fora de local.            |
| `MCP_BASE_URL`       | `/mcp` do `apps/api`. Único destino do Bearer do usuário; https fora da rede. |
| `MCP_TIMEOUT_S`      | Timeout das chamadas ao `/mcp`. Menor que o de IA de propósito.               |

**Trocar de provedor ou de modelo é editar `.env` e reiniciar.** Nenhum `.py` menciona fornecedor,
e não há `if ambiente == 'prod'` no caminho de inferência: LM Studio e Cloudflare AI Gateway falam
o mesmo protocolo.

### Destino e modelo revisados como subprocessador (issue #136)

A frase acima vale **inteira contra provedor local** e ganha uma exceção contra provedor remoto.

Trocar `AI_MODEL_VISION` num painel troca **quem recebe a foto do prato**. A `/privacy` nomeia esse
terceiro, declara a transferência internacional e afirma que o dado não treina modelo — as três
frases dependem de qual modelo está configurado. Sem nada no caminho, uma edição de painel torna as
três falsas, sem diff, sem erro e sem sintoma.

Por isso, quando `AI_BASE_URL` aponta para fora de `localhost`, **duas** listas de
`src/fatia_agent/allowed_models.py` valem:

| lista            | responde                        | recusa com                |
| ---------------- | ------------------------------- | ------------------------- |
| `ALLOWED_HOSTS`  | para qual máquina os bytes saem | `AI_ENDPOINT_NOT_ALLOWED` |
| `ALLOWED_MODELS` | o que roda do outro lado        | `AI_MODEL_NOT_ALLOWED`    |

São duas porque **nenhuma implica a outra**: um gateway roteia para muitos fornecedores, e muitos
gateways servem o mesmo nome de modelo. Vigiar só o nome do modelo deixava a foto sair para um proxy
não declarado com uma edição de `AI_BASE_URL` — que mora no mesmo painel.

A recusa acontece **antes de montar a requisição**: nenhum byte sai. `/capabilities` passa a
anunciar a capacidade como ausente, e `/health` diz o motivo — `unreviewed_host` para o destino (um
fato só, que derruba todas as capacidades) e `unreviewed_models` por capacidade.

As duas listas nascem **vazias**: nenhuma funcionalidade de IA hospedada foi a produção (#139 e #141
seguem abertas), então nem o destino nem os modelos foram revisados ou declarados. Quem escolher o
destino de produção acrescenta host e modelo ali **na mesma PR** que atualiza a política. É o efeito
pretendido — ver [ADR 020](../../docs/ADR/020-foto-e-audio-trafegam-sem-persistencia.md).

### O log do gateway sai desligado em cada chamada

O Cloudflare AI Gateway grava corpo de requisição e de resposta **por padrão** — registrar é o
produto dele. Toda requisição daqui leva `cf-aig-collect-log: false`, que desliga o registro daquela
chamada; sem isso, a foto do prato e a resposta do modelo ficariam legíveis no painel da Cloudflare
enquanto a `/privacy` afirma que ninguém guardou nada.

O header vai **sempre**, e não só quando o endpoint parece remoto: essa derivação é exatamente o que
um proxy reverso em `localhost` engana, e é aí que a proteção mais faria falta. Para quem não é o
gateway, é um header desconhecido e ignorado.

**Em produção, desligue também a opção de log no painel do gateway.** O header cobre o que sai deste
código; qualquer chamada feita por fora continua sujeita ao default.

Provedor local não cai na regra: o dado não sai da máquina, não há subprocessador a declarar, e a
ergonomia de desenvolvimento continua intacta. Auto-hospedagem contra gateway próprio edita a lista
— é uma linha, e quem opera instância própria responde pela política dela.

## Erros nomeados

Todo erro carrega um `code` estável — é ele que atravessa o HTTP, não a mensagem em prosa.

| `code`                       | Quando                                             | HTTP |
| ---------------------------- | -------------------------------------------------- | ---- |
| `AI_PROVIDER_NOT_CONFIGURED` | Falta `AI_BASE_URL`, `AI_API_KEY` ou `AI_MODEL_*`. | 503  |
| `AI_ENDPOINT_NOT_ALLOWED`    | `AI_BASE_URL` remota fora de `ALLOWED_HOSTS`.      | 503  |
| `AI_MODEL_NOT_ALLOWED`       | `AI_MODEL_*` remoto fora de `ALLOWED_MODELS`.      | 503  |
| `AI_PROVIDER_TIMEOUT`        | O provedor não respondeu em `AI_TIMEOUT_S`.        | 504  |
| `AI_PROVIDER_UNREACHABLE`    | Conexão recusada, DNS, TLS, conexão fechada.       | 502  |
| `AI_PROVIDER_REFUSED`        | O provedor respondeu 401/403/429/5xx.              | 502  |
| `AI_RESPONSE_UNPARSEABLE`    | Veio 200, mas o corpo não tem a forma esperada.    | 502  |
| `AI_RESPONSE_TRUNCATED`      | O modelo parou por limite de tokens.               | 502  |
| `AGENT_KEY_REJECTED`         | Faltou o `X-Fatia-Agent-Key`, ou ele veio errado.  | 401  |
| `INVALID_REQUEST`            | O corpo não passou na validação.                   | 422  |

O chat acrescenta uma **segunda família**, do lado do `/mcp`. Ela não herda da primeira de propósito:
falar com o provedor de IA e falar com o nosso `/mcp` são dependências diferentes, com donos e
correções diferentes — tratar um 401 do `/mcp` como "o provedor está fora do ar" mandaria quem opera
olhar o gateway quando o problema é o token de quem está conversando.

| `code`                       | Quando                                                  | HTTP |
| ---------------------------- | ------------------------------------------------------- | ---- |
| `MCP_NOT_CONFIGURED`         | Falta `MCP_BASE_URL`, ou é `http://` para fora da rede. | 503  |
| `MCP_UNAUTHENTICATED`        | A chamada de `/chat` chegou sem Bearer de usuário.      | 401  |
| `MCP_UNAUTHORIZED`           | O `/mcp` recusou o Bearer (401/403).                    | 401  |
| `MCP_TIMEOUT`                | O `/mcp` não respondeu em `MCP_TIMEOUT_S`.              | 504  |
| `MCP_UNREACHABLE`            | Conexão recusada, DNS, TLS, conexão fechada.            | 502  |
| `MCP_REFUSED`                | O `/mcp` respondeu 429/5xx.                             | 502  |
| `MCP_RESPONSE_UNPARSEABLE`   | Veio 200, mas o JSON-RPC não tem a forma esperada.      | 502  |
| `MCP_TOOL_NOT_ALLOWED`       | O modelo pediu tool fora do recorte de leitura.         | —    |
| `MCP_TOOL_ARGUMENTS_INVALID` | O modelo mandou `arguments` que não são objeto JSON.    | —    |

Os dois últimos não têm HTTP porque **não derrubam a conversa**: viram resultado de tool com falha,
que o modelo lê e usa para se corrigir — do mesmo jeito que o `apps/api` devolve erro de execução
como `isError` em vez de erro de protocolo. Derrubar ali trocaria "pedi a tool errada" por "o chat
caiu".

`AI_RESPONSE_TRUNCATED` é separado de propósito: saída truncada é indistinguível de saída completa
para quem só lê a string, e devolvê-la como sucesso é o tipo de falha que só aparece muito depois.

`AI_PROVIDER_UNREACHABLE` também é separado de `AI_PROVIDER_TIMEOUT`: no timeout o provedor está no
ar e demorou; aqui a chamada nem virou resposta (LM Studio desligado, DNS errado, gateway fechando a
conexão no meio). São diagnósticos diferentes, e sem código próprio a exceção do `httpx` escapava
crua — o único caminho sem `code`, que viraria 500 sem envelope na rota de #139.

`/capabilities` devolve **só o host** do provedor (`provider_host`), não a `AI_BASE_URL` inteira: a
rota é anônima e o path de um gateway carrega id de conta e nome do gateway.

## Estrutura

```
src/fatia_agent/
  settings.py                 # env → configuração; nada aqui levanta exceção
  allowed_models.py           # destino e modelos revisados como subprocessador (#136)
  api.py                      # FastAPI: /health, /capabilities, /recognize-meal, /chat
  providers/
    base.py                   # capacidades (Protocol), separadas do fornecedor
    openai_compat.py          # única implementação: cliente OpenAI-compatível
    errors.py                 # erros nomeados
    __init__.py               # build_provider(): monta ou degrada
  chat/                       # #248: o chat hospedado (ADR 021)
    graph.py                  # o grafo: receber → decidir → agir → responder
    mcp_client.py             # o /mcp do NestJS, com o Bearer do usuário
    tool_policy.py            # o recorte de tools — critério, não lista
    events.py                 # o contrato SSE, fixado para as três camadas
    errors.py                 # erros nomeados do lado do /mcp
  prompts/
    recognize_meal_pt_br.py   # prompt da #139, em português (o catálogo é a TACO)
    chat_pt_br.py             # prompt de sistema do chat
  schemas/
    recognized_meal.py        # texto do modelo → dado validado, ou erro nomeado
  recognition/
    recognize_meal.py         # visão + validação, em linha reta
  eval/                       # #138: benchmark de precisão — mede, não afirma
    matching.py               # previsto x rotulado, com a normalização da busca
    metrics.py                # identificação e porção, separadas, com n e desvio
    report.py                 # o Markdown, e a recusa de publicar amostra pequena
    run_benchmark.py          # o runner (CLI), sequencial e sobre o caminho real
eval/                         # o **conjunto**: rótulos versionados, fotos não
tests/
  providers/                  # duplo do provedor, sem rede (inclui o streaming)
  chat/                       # #248: cliente MCP, recorte, grafo, rota e vazamento
  recognition/                # #139: parser, rota e a guarda de custo
  eval/                       # #138: métricas e a guarda de publicação
  test_degradation.py         # o serviço sem IA
  test_api.py                 # saúde e contrato de erro
  test_allowed_models.py      # a foto não sai para destino ou modelo não revisado
  smoke/                      # contra provedor de verdade; fora do CI
```

## Benchmark de reconhecimento (#138)

```bash
uv run python -m fatia_agent.eval.run_benchmark \
  --base-url http://localhost:1234/v1 --model google/gemma-4-12b-qat --split dev
```

**Não existe número de precisão do reconhecimento da Fatia**, e este runner não
produz um sozinho: ele depende de um conjunto de fotos de comida brasileira
rotuladas **com peso de balança**, que é trabalho manual e não está feito. O
gerador de relatório se recusa a emitir veredito abaixo de 30 fotos **medidas**
no split de avaliação — medidas, e não tentadas: trinta fotos com vinte e nove
timeouts são uma medida sobre uma foto. A regra mora no código, e não na
disciplina de quem roda, porque um número medido sobre cinco fotos vira citação
em decisão futura.

Como montar o conjunto: [`eval/README.md`](./eval/README.md). Metodologia,
métricas e limiar:
[`docs/benchmark-reconhecimento-refeicao.md`](../../docs/benchmark-reconhecimento-refeicao.md).

## O que ainda **não** existe aqui

- **Nenhuma persistência de conversa.** O `/chat` recebe o histórico no corpo e devolve o fluxo;
  quem grava é o NestJS (sub-issue 2/3 da #247). Não há checkpointer no grafo, e isso é decisão: um
  checkpointer aqui gravaria histórico de saúde num segundo lugar, fora do banco que a `/privacy`
  descreve.
- **Nenhuma tool de escrita no chat.** Ver §"Rotas de inferência" e a ADR 021. Quando houver tela de
  confirmação, a mudança é de uma linha em `chat/tool_policy.py` — e de uma ADR, que é o ponto.
- **Nenhuma implementação de transcrição.** O `TranscriptionCapability` está declarado, porque a
  separação capacidade/fornecedor é o que a #134 entregou; a implementação vai com #141, quando
  houver um endpoint de transcrição real contra o qual verificar a forma da requisição.
- **Nenhuma tool MCP nova.** O catálogo do `apps/api` não é tocado, e não deve ser: expor
  `recognize_meal_photo` como tool faria o Claude do usuário disparar inferência paga pela Fatia
  (ADR 018). O reconhecimento é rota HTTP do app, não superfície MCP.
- **Nenhum registro de uso ou cota.** É a #135, e ela depende de tabela nova em `schema.prisma`.
  Enquanto não existir, não há como atribuir custo por chamada.

## CI

Ainda **não há job de CI para este diretório** — o `ci.yml` é inteiramente pnpm/turbo, e o
`quality` não enxerga `.py`. O que falta está descrito na PR desta issue; o job proposto é
`setup-python` + `uv sync --frozen` + `ruff check` + `mypy` + `pytest`, sem serviço de banco e sem
rede, num job separado do `quality`.
