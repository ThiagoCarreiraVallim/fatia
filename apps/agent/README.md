# `apps/agent` — agente de IA da Fatia

Serviço **Python**, separado do monorepo pnpm, decidido pela
[ADR 015](../../docs/ADR/015-agente-python-langgraph-cliente-mcp.md). É a **segunda linguagem**
do repositório: lint, teste, build e imagem próprios, descritos aqui.

Duas coisas que a ADR fixou e que valem antes de qualquer leitura de código:

- **O agente não tem credencial de banco e não tem rota privilegiada.** Quando ele precisar de
  dado do usuário, será pelo `/mcp` do NestJS, com o Bearer **do próprio usuário**. Quem filtra
  por `userId` continua sendo um lugar só. Não existe `DATABASE_URL` aqui, e não deve passar a
  existir.
- **Sem provedor configurado, a capacidade degrada explicitamente.** O serviço sobe, `/health`
  responde 200, e quem pedir inferência recebe um erro nomeado com mensagem acionável. O produto
  continua inteiro sem IA hospedada — é como ele funciona hoje.

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
uv run pytest -m smoke     # exige AI_BASE_URL no ambiente; ver abaixo
```

O `pytest` nu **não** fala com rede nem precisa do LM Studio ligado: o transporte do `httpx` é
substituído por um duplo que devolve respostas gravadas de um endpoint OpenAI-compatível.

O `-m smoke` é o único que prova que a configuração está certa **de verdade** — o duplo prova o
nosso lado do protocolo, não o do provedor. Ele se auto-pula sem `AI_BASE_URL`.

## Configuração

Todas as variáveis estão em `.env.example`. As que decidem o comportamento:

| Variável             | Papel                                                               |
| -------------------- | ------------------------------------------------------------------- |
| `AI_BASE_URL`        | Endpoint OpenAI-compatível. Vazio = degradação explícita.           |
| `AI_API_KEY`         | Obrigatória fora de `localhost`. O LM Studio dispensa; gateway não. |
| `AI_MODEL_TEXT`      | Modelo da capacidade de texto.                                      |
| `AI_MODEL_VISION`    | Modelo da capacidade de visão.                                      |
| `AI_MODEL_EMBEDDING` | Modelo da capacidade de embedding.                                  |
| `AI_TIMEOUT_S`       | Timeout por chamada. Default folgado: visão em CPU é lenta.         |
| `AI_MAX_RETRIES`     | Repetições em 429 e 5xx. 401/403 não são repetidos.                 |

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
  api.py                      # FastAPI: /health e /capabilities
  providers/
    base.py                   # capacidades (Protocol), separadas do fornecedor
    openai_compat.py          # única implementação: cliente OpenAI-compatível
    errors.py                 # erros nomeados
    __init__.py               # build_provider(): monta ou degrada
tests/
  providers/                  # duplo do provedor, sem rede
  test_degradation.py         # o serviço sem IA
  test_api.py                 # saúde e contrato de erro
  test_allowed_models.py      # a foto não sai para destino ou modelo não revisado
  smoke/                      # contra provedor de verdade; fora do CI
```

## O que esta issue deliberadamente **não** entrega

- **Nenhuma rota de inferência.** Uma rota que dispara inferência sem autenticar é um proxy aberto
  para um gateway pago — a fronteira de custo da [ADR 018](../../docs/ADR/018-inferencia-hospedada-fora-do-mcp.md).
  Ela entra junto com o repasse do Bearer do usuário, em #139/#141.
- **Nenhum cliente MCP e nenhum grafo LangGraph.** Sem uma tool para chamar, um cliente MCP só
  poderia ser testado contra um duplo de protocolo inventado aqui. Entra com #139, contra o `/mcp`
  de verdade.
- **Nenhuma implementação de transcrição.** O `TranscriptionCapability` está declarado, porque a
  separação capacidade/fornecedor é o que esta issue entrega; a implementação vai com #141, quando
  houver um endpoint de transcrição real contra o qual verificar a forma da requisição.
- **Nenhuma tool MCP nova.** O catálogo do `apps/api` não é tocado.

## CI

Ainda **não há job de CI para este diretório** — o `ci.yml` é inteiramente pnpm/turbo, e o
`quality` não enxerga `.py`. O que falta está descrito na PR desta issue; o job proposto é
`setup-python` + `uv sync --frozen` + `ruff check` + `mypy` + `pytest`, sem serviço de banco e sem
rede, num job separado do `quality`.
