# `apps/agent` — agente de IA da Fatia

Serviço **Python**, separado do monorepo pnpm, decidido pela
[ADR 015](../../docs/ADR/015-agente-python-langgraph-cliente-mcp.md). É a **segunda linguagem**
do repositório: lint, teste, build e imagem próprios, descritos aqui.

Duas coisas que a ADR fixou e que valem antes de qualquer leitura de código:

- **O agente não tem credencial de dado de domínio e não tem rota privilegiada.** Ele alcança dado
  do usuário pelo `/mcp` do NestJS, com o Bearer **do próprio usuário** — é o que o `/chat` faz
  desde a #248 ([ADR 021](../../docs/ADR/021-agente-recebe-o-bearer-do-usuario.md)). Quem filtra
  por `userId` continua sendo um lugar só. Não existe `DATABASE_URL` aqui, e não deve passar a
  existir. A única credencial de Postgres é `AGENT_CHECKPOINT_DATABASE_URL`, e ela serve a um
  schema só — `agent_checkpoint`, onde o grafo guarda o estado das conversas
  ([ADR 023](../../docs/ADR/023-checkpointer-no-postgres-da-fatia.md)). Ler uma refeição por ali
  seria o segundo dono do isolamento que a ADR 015 recusa; por isso nenhuma tabela do Prisma é
  lida nem escrita por essa conexão.
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
desenvolvimento inventar um. Não há `if ambiente == 'prod'` em lugar nenhum. Vale para as quatro
rotas de inferência (`/recognize-meal`, `/chat`, `/title`, `/transcribe`).

**Sem LangGraph nesta rota, e isso continua valendo.** O grafo previsto no plano da #139 tinha três
passos: visão → `search_food` pelo MCP → casamento com a TACO. Os dois últimos ficaram no `apps/api`,
que já tem o catálogo e o mesmo ranqueamento de busca que a pessoa usa digitando. O que sobra aqui é
uma chamada e uma validação, em linha reta — um grafo de um nó só seria a dependência e a cerimônia
sem o benefício. O LangGraph entrou com o chat, que é o caso oposto: ele **volta**, e agora também
**pausa**.

---

`POST /chat` (#248, [ADR 023](../../docs/ADR/023-checkpointer-no-postgres-da-fatia.md)) — um turno
de conversa, ou a resposta a uma pausa, em SSE.

```bash
curl -N localhost:8100/chat \
  -H 'Content-Type: application/json' \
  -H "X-Fatia-Agent-Key: $AGENT_API_KEY" \
  -H "Authorization: Bearer $TOKEN_DO_USUARIO" \
  -d '{"conversationId":"<uuid v4>","message":"o que eu comi ontem?","timezone":"America/Sao_Paulo"}'
```

**O corpo é um turno novo ou uma retomada, nunca os dois.** `extra: "forbid"` recusa qualquer
campo a mais, e o validador recusa `message` junto de `resume` (ou nenhum dos dois):

| Campo            | Papel                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------- |
| `conversationId` | UUID v4 gerado pelo PWA na primeira mensagem. É o que torna a conversa retomável.            |
| `message`        | A fala de agora, até 4 000 caracteres.                                                       |
| `resume`         | `{interruptId, value}` — a resposta a uma pausa (ver "As três pausas").                      |
| `history`        | O que o `apps/api` tem gravado. Só é lido numa thread fria (nó `hidratar`).                  |
| `memories`       | Até 50 anotações de `UserMemory`, cercadas como dado no prompt de sistema.                   |
| `timezone`       | O fuso do perfil. Sem ele o modelo chuta a data em "ontem". Nome de fuso não aponta ninguém. |
| `photos`         | Até 3 `{mediaType, data}` em base64, **só** com `message` nova (ver "Foto no turno").        |

**Nenhum campo de identidade, e a thread é de quem o token diz.** O `thread_id` do checkpointer é
`{userId}:{conversationId}`, e o `userId` sai do `get_me` chamado com o próprio Bearer
(`_dono` em `api.py`), não do corpo: um `userId` no corpo seria a thread de outra pessoa a um campo
adulterado de distância. O `conversationId` de uma conversa alheia cai numa thread nova e vazia,
prefixada por quem chamou — nunca na do dono.

**Duas credenciais, dois papéis.** `X-Fatia-Agent-Key` responde "esta chamada pode gastar inferência
paga?" (ADR 018); `Authorization: Bearer` responde "em nome de quem?", é repassado inteiro ao
`/mcp` e decide de quem é a thread. Nenhuma substitui a outra: sem a primeira, a rota é proxy aberto
para o gateway; sem a segunda, não há dado a alcançar. É a inversão registrada na
[ADR 021](../../docs/ADR/021-agente-recebe-o-bearer-do-usuario.md) — leia-a antes de mexer aqui.

**O chat lê e escreve, em três camadas**
([ADR 022](../../docs/ADR/022-classificacao-3-camadas-do-chat.md)). O recorte é derivado das
anotações que o `/mcp` anuncia a cada conversa, e nenhuma lista de nomes mora neste repositório
(`chat/tool_policy.py`): `readOnlyHint` executa direto; `confirmableHint` pausa o grafo e só executa
com o sim da pessoa; o resto — toda `delete_*` inclusive — nunca é oferecido ao modelo, e
`exigir_permitida` confere de novo na hora de chamar, porque modelo pequeno inventa nome de função.
A escrita aprovada executa **o `tool_call` guardado no checkpoint**: o cliente responde sim ou não
por `toolCallId` e nunca carrega argumento de escrita de volta. O que a pessoa viu é o que executa,
sem comparação de texto no meio.

### O grafo

`chat/graph.py`, um nó por responsabilidade:

| Nó            | O que faz                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| `hidratar`    | Zera o que é do turno e, numa thread fria, semeia a conversa com `history`.                                  |
| `planejar`    | Opcional (`AGENT_CHAT_PLANNER`): uma chamada a mais que quebra o pedido em passos e emite `plan`.            |
| `agente`      | O modelo, em streaming — responde ou pede tools.                                                             |
| `ferramentas` | Executa pelo `/mcp` toda READ_ONLY e toda CONFIRMABLE **já decidida**; o resultado entra cercado (`cercar`). |
| `portao`      | Junta numa pausa só as escritas à espera de aprovação e as perguntas de `ask_user`.                          |
| `orcamento`   | Passou do teto de voltas de tool: pausa perguntando se continua, em vez de cortar calado.                    |
| `refletir`    | A mesma tool falhou de novo: uma reflexão entra no prompt e o modelo troca de abordagem.                     |
| `validar`     | Confere a resposta final por regra (`chat/qualidade.py`); reprovada, volta **uma** vez ao modelo.            |
| `fechar`      | Garante texto na tela no fim do turno.                                                                       |

**Só `portao` e `orcamento` chamam `interrupt()`, e nenhum dos dois tem efeito colateral antes
dele.** O LangGraph reexecuta o nó interrompido quando a pausa é retomada. Se a interrupção morasse
dentro de `ferramentas`, a retomada rodaria de novo o lote inteiro — com um `log_meal` no meio, a
refeição seria gravada duas vezes. A leitura pedida na mesma volta que uma escrita roda antes da
pausa: bloqueá-la faria a pessoa aprovar algo para ver o que só perguntou.

**Validação e reflexão são regra, não um segundo modelo.** O custo de cada volta extra é da Fatia
(ADR 018), e as falhas que valem uma volta extra — resposta vazia, "como uma IA, não posso…",
identificador interno cru — são reconhecíveis por texto. Um juiz de LLM dobraria o custo do turno
para pegar as mesmas três coisas.

### As três pausas

Uma pausa sai como `updates` com `__interrupt__`, o turno termina com `done` em `interrupted` e a
thread fica esperando no checkpoint — sobrevive a F5, a restart e a deploy.

| `kind`     | Quem pausa                                            | O que a retomada leva em `value`            |
| ---------- | ----------------------------------------------------- | ------------------------------------------- |
| `confirm`  | Tool CONFIRMABLE pedida pelo modelo (ADR 022)         | `{"approvals": {"<toolCallId>": true}}`     |
| `question` | A tool local `ask_user` (`chat/human.py`), com campos | `{"answers": {"<toolCallId>": <resposta>}}` |
| `continue` | O `orcamento`, com o resumo do que já foi feito       | `true` ou `false`                           |

**Em `confirm` e `continue`, o default é não.** Gravar e gastar mais precisam de um sim explícito,
e não da ausência de um não: retomada malformada, campo que faltou ou texto inesperado recusam.

**A retomada prova a qual pausa responde.** `resume.interruptId` tem de ser o da pausa pendente:
diferente é 409 `CHAT_RESUME_MISMATCH`, e sem pausa nenhuma é 409 `CHAT_NOTHING_TO_RESUME` — os dois
antes de o fluxo abrir. Sem o id, uma resposta dada a uma pergunta barata poderia ser reenviada
contra uma confirmação de escrita.

### Foto no turno

`photos` só acompanha mensagem nova. Cada foto é decodificada e validada como no `/recognize-meal`
(formato aceito, teto de 4 MB), e com foto o turno inteiro vai ao modelo de visão pelo
`stream_chat(capacidade="vision")` — por isso `AI_MODEL_VISION` precisa aceitar tools. Sem ele
configurado e revisado, a rota responde 503 `AI_PROVIDER_NOT_CONFIGURED` **antes** do primeiro byte:
com o SSE aberto, a mesma recusa chegaria como evento no meio de uma resposta que não começou.

**Os bytes entram só no prompt daquela chamada** (`_com_fotos`). O checkpoint guarda a fala da
pessoa com a marca `MARCA_DE_FOTO` no lugar da imagem, e o turno seguinte já não vê a foto e volta
ao modelo de texto. É a ADR 020 aplicada ao checkpointer, e `tests/chat/test_fotos.py` prova lendo
o checkpoint gravado — a foto ali seria exatamente a persistência que a ADR 004 proíbe.

### O Bearer não entra em log, span, estado do grafo nem checkpoint

Ele vive nos headers do `McpClient`, que viaja junto do provedor no **runtime context** do LangGraph
(`ContextoDoTurno`, passado em `astream(context=...)`). O context não é serializado pelo
checkpointer — só o `state` (`EstadoDaConversa`) é, e o `state` é também o que o `langsmith`
(dependência transitiva do LangGraph) exportaria. `tests/chat/test_sem_vazamento.py` exercita a
conversa inteira e varre log, saída padrão, eventos, o corpo mandado ao provedor e o checkpoint
gravado — com controle negativo, porque varrer um canal vazio é uma afirmação sobre nada.

### O contrato SSE, fixado aqui

O fio do `/chat` é o vocabulário **nativo** do LangGraph, que o runtime do assistant-ui
(`useLangGraphRuntime`) consome sem tradutor, mais alguns eventos próprios. A descrição de
referência é o docstring de `chat/events.py`; o resumo:

```
event: messages            ← fragmento de texto: [AIMessageChunk, {"langgraph_node": "agente"}]
event: updates             ← mensagens novas por nó, ou {"__interrupt__": [{"id", "value"}]}
event: messages/complete   ← a resposta final, lida do estado

event: start       {"conversationId": "…", "runId": "…"}
event: catalog     {"tools": {"log_meal": "Registrar refeição", …}}
event: usage       {"model": "…", "inputUnits": 812, "outputUnits": 96}
event: plan        {"steps": [{"id": "1", "title": "…", "status": "running"}]}
event: artifact    {"toolCallId": "c1", "kind": "metric", …}
event: context     {"estimated": true, "segments": [{"key": "tools", "tokens": 900}]}
event: validation  {"ok": false, "issues": ["…"]}
event: error       {"code": "MCP_UNAUTHORIZED", "message": "…"}
event: done        {"status": "completed" | "interrupted" | "error"}
```

⚠️ Nos três modos nativos o `data` é o do stream do LangGraph, **cru**: em `messages` é uma lista de
dois elementos, e enfiar uma chave ali quebraria a desserialização do cliente. Quem diz o que é o
quadro é a linha `event:`.

**Não existe evento de tool.** A chamada vive em `tool_calls` da mensagem do assistente, e o
resultado é a própria `ToolMessage`, cortada para a tela (o estado guarda o texto inteiro, que é o
que o modelo lê). Emitir os dois também como evento próprio faria a tela desenhar cada tool duas
vezes. O `catalog` existe para que a tela rotule **toda** tool com o título que o `/mcp` anuncia, sem
uma tabela à mão que apodrece a cada tool nova. O `updates` é podado a `messages` e
`__interrupt__`, e o nó `hidratar` nunca passa: o resto do estado é do grafo, e repassar a
hidratação duplicaria a conversa na tela.

**`artifact`** é a carga tipada de uma tool, vinda do `structuredContent` do MCP — o canal que não
entra no contexto do modelo. `chat/artefatos.py` normaliza numa lista fechada (`report`, `metric`,
`timeline`, `comparison`), e o `toolCallId` pendura a carga no cartão certo quando a mesma tool
roda duas vezes na volta.

O **`usage`** sai **uma vez por chamada ao modelo**, não uma por turno: o ciclo de tool chama o
modelo de novo a cada volta, o planejador é uma chamada a mais, e cada uma é paga. O `apps/api` soma
por modelo. Unidade que o provedor não reporta fica **fora** do objeto em vez de ir como `0` — e o
turno entra no livro-caixa como não medido, que é diferente de grátis.

Quatro garantias que o NestJS e o PWA podem assumir:

1. **`done` é sempre o último evento**, inclusive depois de `error`. Um cliente que só fecha no
   `done` não fica pendurado por causa de uma falha.
2. **`error` é terminal**, e o `done` seguinte traz `status: "error"`. Uma pausa termina em
   `interrupted`; o resto, em `completed`.
3. **O que falha antes do primeiro byte falha com status**, no envelope JSON de sempre — provedor
   ausente (503), Bearer ausente (401), chave do agente recusada (401, `AGENT_KEY_REJECTED`), corpo
   inválido (422, `INVALID_REQUEST`), token recusado pelo `/mcp` (401), retomada que não casa com a
   pausa (409). **Todos** no formato `{"error": {"code", "message"}}`: não há `{"detail": ...}` em
   caminho nenhum do `/chat`, e o corpo do 422 não devolve o que a pessoa escreveu. O catálogo e o
   `get_me` são buscados antes de o fluxo abrir justamente para que um token expirado chegue como
   401, e não como um 200 que o PWA teria de destrinchar. Depois que o fluxo abre, o 200 já foi
   enviado e o erro só cabe como evento.
4. **Só a mensagem de agora tem teto duro: 4 000 caracteres.** Passar disso é 422 — a pessoa está
   olhando para o campo, e o cliente sabe contar antes de enviar. O **histórico não tem teto**: o
   checkpoint guarda a conversa inteira, e o prompt usa as últimas 40 mensagens, cada uma cortada em
   4 000 caracteres com marca visível. A diferença é deliberada. O histórico carrega a resposta do
   modelo, e não há `max_tokens` no payload: um "monte um plano de 7 dias" com 6 000 caracteres,
   reenviado ou reidratado no turno seguinte, viraria um 422 **permanente** — a conversa morta por
   um teto nosso que nem o PWA nem o NestJS teriam como enxergar.

`Cache-Control: no-transform` e `X-Accel-Buffering: no` saem na resposta: se qualquer camada
bufferizar, o chat parece travado até a última palavra e o streaming das outras duas se perde. Do
lado de cá, `tests/chat/test_graph.py` segura a mesma propriedade com um provedor que só termina o
turno quando o teste manda: o primeiro fragmento tem de chegar com o modelo ainda escrevendo.

### `/title` e `/transcribe`

As duas rotas auxiliares do chat. Nenhuma recebe Bearer: nomear um texto e transcrever um áudio
não alcançam dado nenhum, e um token de usuário ali só aumentaria o estrago de um comprometimento.
As duas exigem a chave do agente — são inferência paga.

`POST /title` — a primeira mensagem de uma conversa → um nome curto (`chat/titulo.py`). **Nunca
falha por causa do modelo**: provedor fora do ar ou resposta torta viram `title: null`, e o
`apps/api` fica com o recorte da primeira mensagem. Título é enfeite de lista, e derrubar a conversa
por ele seria trocar o essencial pelo acessório. Devolve `usage`, porque título sem custo medido
contaria na tolerância de chamadas não medidas da cota.

`POST /transcribe` (#141) — o ditado do chat: áudio cru no corpo, texto de volta.

```bash
curl -s localhost:8100/transcribe \
  -H 'Content-Type: audio/webm' \
  -H "X-Fatia-Agent-Key: $AGENT_API_KEY" \
  --data-binary @fala.webm
# {"text":"almocei arroz e feijão","usage":{"model":"…","inputUnits":4.2}}
```

- **O corpo é o áudio, e não JSON com base64.** Base64 cresce um terço à toa, e o `apps/api` já
  recebe o áudio cru do aparelho. `Content-Type` fora de `audio/webm`, `audio/ogg`, `audio/mp4`,
  `audio/mpeg`, `audio/wav` e `audio/x-m4a` é 415; corpo vazio é 400.
- **O teto de 4 MB é conferido durante a leitura**, e não depois (`_ler_audio`): ler tudo e só então
  medir deixaria qualquer um com a chave do agente encher a memória do processo. É teto de bytes
  porque a duração só se sabe depois de pagar a transcrição.
- **O provedor é o `/audio/transcriptions` do contrato OpenAI**, com `verbose_json` e o modelo
  `AI_MODEL_TRANSCRIPTION`: é o formato que devolve a duração, e a duração é a unidade de preço
  (`inputUnits` em segundos).
- **Não grava nem envia nada.** O texto volta ao campo de mensagem e é a pessoa quem decide mandar.
  O áudio vive em memória e morre com a requisição (ADR 020).

## Como rodar

Pré-requisito: [`uv`](https://docs.astral.sh/uv/).

```bash
cd apps/agent
cp .env.example .env          # opcional: sem ele, o serviço sobe degradado
uv sync                       # cria .venv e instala a partir do uv.lock
uv run uvicorn fatia_agent.api:app --reload --port 8100
```

```bash
curl -s localhost:8100/health        # 200 sempre, com o estado da IA e do checkpointer
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

| Variável                        | Papel                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `AI_BASE_URL`                   | Endpoint OpenAI-compatível. Vazio = degradação explícita.                        |
| `AI_API_KEY`                    | Obrigatória fora de `localhost`. O LM Studio dispensa; gateway não.              |
| `AI_MODEL_TEXT`                 | Modelo da capacidade de texto.                                                   |
| `AI_MODEL_VISION`               | Modelo da capacidade de visão. Com foto no chat, precisa aceitar tools.          |
| `AI_MODEL_EMBEDDING`            | Modelo da capacidade de embedding.                                               |
| `AI_MODEL_TRANSCRIPTION`        | Modelo do ditado (`/audio/transcriptions`). Vazio = o microfone some do chat.    |
| `AI_TIMEOUT_S`                  | Timeout por chamada. Default folgado: visão em CPU é lenta.                      |
| `AI_MAX_RETRIES`                | Repetições em 429 e 5xx. 401/403 não são repetidos.                              |
| `AGENT_API_KEY`                 | Segredo compartilhado com o `apps/api`. Obrigatório fora de local.               |
| `MCP_BASE_URL`                  | `/mcp` do `apps/api`. Único destino do Bearer do usuário; https fora da rede.    |
| `MCP_TIMEOUT_S`                 | Timeout das chamadas ao `/mcp`. Menor que o de IA de propósito.                  |
| `AGENT_CHECKPOINT_DATABASE_URL` | Postgres da Fatia, schema `agent_checkpoint`. Vazio = estado em memória.         |
| `AGENT_CHAT_PLANNER`            | `true` liga o nó `planejar`: uma chamada a mais por turno. Desligado por padrão. |

**`AGENT_CHECKPOINT_DATABASE_URL` vazia é aceitável em teste e em desenvolvimento, e defeito em
produção.** Em memória, uma pausa do chat — a confirmação de uma escrita, a resposta a uma pergunta —
não sobrevive a um restart nem é vista por outra réplica. O agente loga `warning` e o `/health`
expõe `checkpointer.persistent`, para o operador ver antes da primeira pessoa perder uma pausa. O
schema é criado pelo próprio agente no primeiro uso (idempotente): deixá-lo para um passo manual de
deploy seria a primeira coisa esquecida numa instância auto-hospedada, e o sintoma — as tabelas do
saver no `public`, misturadas às do Prisma — só apareceria na migration seguinte.

**O planejador vem desligado** porque custa uma chamada ao modelo antes da primeira palavra: num
gateway pago é dinheiro, num modelo local pequeno em CPU são segundos de tela parada. Quem liga é
quem roda um modelo que aguenta.

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

As duas listas nascem **vazias**: nenhuma funcionalidade de IA hospedada foi a produção —
reconhecimento por foto, chat e ditado existem no código, mas nem o destino nem os modelos foram
revisados ou declarados. Quem escolher o
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
| `MCP_TOOL_NOT_ALLOWED`       | O modelo pediu tool RESTRICTED, ou que não existe.      | —    |
| `MCP_TOOL_ARGUMENTS_INVALID` | O modelo mandou `arguments` que não são objeto JSON.    | —    |

Os dois últimos não têm HTTP porque **não derrubam a conversa**: viram resultado de tool com falha,
que o modelo lê e usa para se corrigir — do mesmo jeito que o `apps/api` devolve erro de execução
como `isError` em vez de erro de protocolo. Derrubar ali trocaria "pedi a tool errada" por "o chat
caiu".

A retomada de pausa tem uma **terceira família**, de um código por motivo, os dois 409:
`CHAT_RESUME_MISMATCH` (o `interruptId` não é o da pausa pendente) e `CHAT_NOTHING_TO_RESUME` (a
thread não espera nada). Não é falha de ninguém: é outra aba que respondeu antes, ou uma página
aberta sobre um estado velho, e a correção é recarregar a conversa — o que o `apps/api` traduz para
o PWA mantendo o `code`.

As recusas de formato do `/recognize-meal` e do `/transcribe` (415, 413, 400) continuam como
`{"detail": ...}`: são o contrato da #139, que o NestJS traduz por status, e o ditado segue o mesmo.

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
  api.py                      # FastAPI: /health, /capabilities, /recognize-meal, /chat, /title, /transcribe
  providers/
    base.py                   # capacidades (Protocol), separadas do fornecedor
    openai_compat.py          # única implementação: cliente OpenAI-compatível (inclui transcrição)
    errors.py                 # erros nomeados
    __init__.py               # build_provider(): monta ou degrada
  chat/                       # o chat hospedado (ADR 021, 022 e 023)
    graph.py                  # o grafo: hidratar → agente ⇄ ferramentas → portão, orçamento, validação
    state.py                  # o que o checkpointer grava (estado) e o que não grava (contexto)
    checkpointer.py           # AsyncPostgresSaver no schema agent_checkpoint; em memória sem DSN
    human.py                  # ask_user: a tool local que pergunta e espera
    planejador.py             # o plano opcional do pedido (AGENT_CHAT_PLANNER)
    qualidade.py              # validação, reflexão e resumo do orçamento, sem chamar modelo
    artefatos.py              # structuredContent → report/metric/timeline/comparison
    titulo.py                 # o nome da conversa, que nunca falha
    mcp_client.py             # o /mcp do NestJS, com o Bearer do usuário
    tool_policy.py            # as três camadas — critério derivado, não lista
    events.py                 # o contrato SSE: modos nativos do LangGraph + eventos próprios
    errors.py                 # erros nomeados do lado do /mcp
  prompts/
    recognize_meal_pt_br.py   # prompt da #139, em português (o catálogo é a TACO)
    chat_pt_br.py             # prompt de sistema do chat e a cerca de conteúdo de terceiro
  schemas/
    recognized_meal.py        # texto do modelo → dado validado, ou erro nomeado
  recognition/
    recognize_meal.py         # visão + validação, em linha reta
  eval/                       # benchmarks — medem, não afirmam
    matching.py, metrics.py,  # #138: reconhecimento por foto (previsto x rotulado, n e desvio,
    report.py,                #   a recusa de publicar amostra pequena, o runner sequencial)
    run_benchmark.py
    chat/                     # o benchmark do chat: casos, cenário de /mcp fixo, checks, runner
eval/                         # os **conjuntos** e a documentação dos benchmarks
  chat/README.md              # como rodar e ler o benchmark do chat
tests/
  providers/                  # duplo do provedor, sem rede (inclui o streaming)
  chat/                       # grafo, pausas, rota, fotos, título, recorte e vazamento
  recognition/                # #139: parser, rota e a guarda de custo
  eval/                       # métricas, a guarda de publicação e os casos do chat roteirizados
  test_transcribe.py          # #141: o ditado, do corpo cru ao provedor
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

## Benchmark do chat

```bash
uv run python -m fatia_agent.eval.chat \
  --base-url http://localhost:1234/v1 --model google/gemma-4-12b-qat
```

Mede o agente do chat contra pedidos reais com gabarito — leitura, "ontem" no fuso da pessoa,
escrita que pausa e só executa depois do sim, recusa que não grava, pedido ambíguo que pergunta,
instrução escondida num registro que não é obedecida, fora de escopo, memória que pede
confirmação. O caminho é o de produção (o mesmo `montar_grafo`, prompt, `McpClient` e recorte); só o
`/mcp` é um cenário fixo, e **nenhum caso escreve** em lugar nenhum. Os checks são determinísticos,
sem juiz de LLM. Casos, códigos de saída e como ler o resultado:
[`eval/chat/README.md`](./eval/chat/README.md).

## O que ainda **não** existe aqui

- **Nenhum acesso a dado de domínio fora do `/mcp`.** O checkpointer tem credencial de Postgres, e
  ela é só do schema `agent_checkpoint`: o estado de trabalho do grafo, descartável e reidratável a
  partir de `Message`. Quem apaga uma thread é o `apps/api`, por SQL direto no schema
  (`checkpoint-purge.service.ts`), porque a eliminação não pode depender de o agente estar no ar
  (ADR 023).
- **Nenhuma tool MCP de inferência.** Expor `recognize_meal_photo` ou uma transcrição como tool faria
  o Claude do usuário disparar inferência paga pela Fatia (ADR 018). Reconhecimento, título e
  ditado são rotas HTTP do app, não superfície MCP. As tools de memória (`list_memories`,
  `save_memory`, `forget_memory`) são do `apps/api` e não chamam modelo nenhum.
- **Nenhuma contabilidade de custo aqui dentro.** O agente **reporta** o que o provedor cobrou, no
  evento `usage` e no `usage` das rotas auxiliares, e para por aí: quem soma, guarda e decide a cota
  é o `apps/api` (#135), que é quem tem banco. É deliberado — um limite que dependesse de o próprio
  consumidor reportar com honestidade não é limite, e o agente é disparado com o token de quem está
  conversando.
- **Nenhum juiz de LLM**, nem na validação da resposta nem no benchmark do chat. Os dois são regra
  determinística: uma segunda chamada julgando a primeira dobraria o custo do turno, e um benchmark
  julgado por modelo mede o juiz tanto quanto o agente.
- **Nenhuma telemetria de prompt** (Langfuse, versionamento de prompt). Mandar prompt e resposta a
  mais um serviço é mais um subprocessador a declarar (#136), e nada aqui precisa disso para
  funcionar.

## CI

O job `agent` do `.github/workflows/ci.yml` roda neste diretório, separado do `quality` (que é
pnpm/turbo e não enxerga `.py`): `uv sync --locked`, `ruff check`, `ruff format --check`, `mypy` e
`pytest`. Sem serviço de banco e sem rede — os `smoke` ficam de fora pelo `addopts`, e o
checkpointer dos testes é em memória. O `--locked` é o que faz um `pyproject.toml` editado sem
`uv lock` reprovar em vez de instalar outra coisa que a da máquina de quem abriu a PR.

O benchmark do chat **não** roda no CI: ele precisa de modelo de verdade, e um número medido contra
o duplo do provedor seria uma afirmação sobre o duplo. O que o CI roda são os casos com modelo
roteirizado (`tests/eval/test_chat_benchmark.py`), que provam que os checks aprovam o certo e
reprovam o inventado.
