# ADR 023 — O agente guarda o estado da conversa num checkpointer, no Postgres da Fatia

**Status:** Accepted
**Data:** 2026-09-25

Supera, **só no ponto do checkpointer**, a [ADR 021](./021-agente-recebe-o-bearer-do-usuario.md)
(o parágrafo que recusa estado no agente) e a seção "Dois turnos HTTP, e não uma pausa no grafo" da
[ADR 022](./022-classificacao-3-camadas-do-chat.md). O recorte em três camadas da ADR 022 continua
valendo inteiro; o que muda é **como** a confirmação acontece.

## Contexto

O chat da #247 nasceu sem estado no agente, por uma razão escrita com todas as letras no docstring
de `apps/agent/src/fatia_agent/chat/graph.py`: um checkpointer gravaria histórico de saúde num
segundo lugar, fora do banco que a LGPD deste produto descreve. A consequência foi o handshake de
dois turnos: a tool CONFIRMABLE vira `proposal`, a tela guarda a proposta, e a aprovação volta num
segundo `POST /chat` com os argumentos ecoados pelo cliente.

Isso funcionou para uma coisa só — confirmar escrita — e bloqueou todo o resto que um agente
conversacional precisa (ver [`docs/CHAT_PARIDADE_LUNIA.md`](../CHAT_PARIDADE_LUNIA.md)):

- **perguntar** no meio do trabalho ("qual refeição: almoço ou jantar?") e continuar de onde parou;
- **pedir licença** quando o orçamento de tools acaba, em vez de cortar calado com `step_limit`;
- **sobreviver a um F5**: a proposta vivia só na memória da aba, e recarregar a página a perdia;
- **retomar exatamente a chamada que a pessoa viu**, sem depender de o cliente devolvê-la intacta.

As quatro são a mesma coisa: pausar o grafo e retomá-lo depois. Isso exige checkpointer. O motivo
que o recusou não era técnico, era de **lugar**: o problema era um segundo depósito de dado de
saúde que nenhum documento descreve. Esse problema tem solução sem abrir mão do estado.

## Decisão

**O agente compila o grafo com um `AsyncPostgresSaver` que grava no schema `agent_checkpoint` do
mesmo Postgres da Fatia. A pausa passa a ser `interrupt()` do LangGraph, e o estado de cada conversa
fica numa thread `{userId}:{conversationId}`.**

Cada item abaixo é uma obrigação verificável:

1. **Mesmo banco, schema próprio.** `AGENT_CHECKPOINT_DATABASE_URL` aponta para o Postgres da Fatia;
   o agente cria o schema `agent_checkpoint` e as tabelas do saver no boot (idempotente). Nenhum
   outro serviço, nenhum outro banco. Sem a variável, o saver é em memória e o agente loga `warning`
   — aceitável em teste e em desenvolvimento, e é o que `/health` expõe como `checkpointer`.
2. **O token não entra no estado.** O Bearer continua morando dentro do `McpClient`, que agora viaja
   pelo **runtime context** do LangGraph (`astream(context=...)`), junto do provedor. O context não é
   serializado pelo checkpointer — só o `state` é. `tests/chat/test_sem_vazamento.py` lê o checkpoint
   gravado e procura o token nele.
3. **A thread é da pessoa, e quem diz quem é a pessoa é o token.** O `userId` do `thread_id` sai do
   `get_me` chamado com o próprio Bearer, e não do corpo da requisição. Um id de conversa alheia no
   corpo cai numa thread nova e vazia — nunca na thread de outra pessoa.
4. **Apagar a conversa apaga a thread; apagar a conta apaga todas.** Quem apaga é o `apps/api`, com
   SQL direto no schema (`checkpoint-purge.service.ts`), e não uma chamada ao agente: a eliminação
   não pode depender de outro serviço estar no ar. O `onDelete: Cascade` a partir de `User` não
   alcança o schema do agente, e é por isso que a purga é explícita e testada.
5. **O export não duplica.** A fonte de verdade da conversa continua sendo `Conversation` e `Message`
   (`export_my_data` já as inclui). O checkpoint é o estado de trabalho do grafo — as mesmas falas,
   mais as chamadas de tool — e é descartável: uma thread apagada é reidratada a partir de `Message`
   no próximo turno (nó `hidratar`).
6. **Mídia não entra no checkpoint.** Quando a foto chegar ao chat, os bytes vão ao modelo e o que se
   grava no estado é um marcador. A ADR 020 vale para o checkpointer como vale para `Message`.
7. **Retenção igual à da conversa.** A thread vive enquanto a `Conversation` viver. Não há expiração
   automática, pelo mesmo motivo de `docs/DATA_RETENTION.md`: o histórico é o produto.

### A confirmação, agora

O ciclo das três camadas não muda de regra, muda de mecanismo:

```
agente → ferramentas (READ_ONLY roda; CONFIRMABLE fica pendente) → portão
       → interrupt(confirm)   … a pessoa decide …   resume {approvals}
       → ferramentas (roda o que foi aprovado; recusado vira resultado "recusada") → agente
```

- **O que roda é o `tool_call` guardado no checkpoint.** O cliente não carrega mais os argumentos de
  volta; ele responde "sim" ou "não" para um `toolCallId`. A garantia da ADR 022 — "o que a pessoa
  viu é o que executa" — fica mais forte: antes ela dependia de uma comparação de texto
  (`exigir_aprovada`), agora não há texto para comparar.
- **O portão não tem efeito colateral.** O LangGraph reexecuta o nó interrompido na retomada; por
  isso quem interrompe é um nó que só lê o estado, e quem executa tool é outro. Interromper dentro
  da execução reexecutaria as tools do lote na retomada.
- **A retomada prova a qual pausa responde.** O `resume` traz o `interruptId`, e o agente recusa um
  id que não é o pendente — sem isso, uma resposta dada a uma pergunta poderia ser reenviada contra
  uma confirmação.
- **RESTRICTED continua fora.** Nunca oferecida ao modelo; `exigir_permitida` recusa o nome
  inventado antes da chamada.

## Consequências

### Positivas

- `ask_user`, a pausa de orçamento e a restauração depois de F5 passam a ser possíveis, com um
  mecanismo só.
- O protocolo do `/chat` vira o vocabulário nativo do LangGraph (`messages`, `updates`,
  `messages/complete`), que o runtime do assistant-ui consome sem tradutor.
- O cliente deixa de ser portador de argumentos de escrita.

### Negativas

- O agente ganha uma dependência de banco (`langgraph-checkpoint-postgres`, `psycopg`) e uma
  credencial de Postgres. O papel dessa credencial é **só** o schema `agent_checkpoint` na instância
  oficial — ver `infra/`. Continua sem ler nem escrever dado de domínio: isso segue exclusivo do
  `/mcp` (ADR 015).
- O mesmo diálogo existe em dois formatos: `Message` (o que a tela e o export mostram) e o checkpoint
  (o que o grafo precisa). A purga cobre os dois, e o teste da purga é o que impede um de sobrar.

### Neutras

- O deploy de agente, API e PWA passa a ser conjunto: o corpo do `POST /chat` e o protocolo SSE
  mudaram de forma incompatível.

## Alternativas consideradas

- **Guardar só as pendências no `apps/api`** (a saída que a ADR 022 deixou anotada). Resolve o F5 da
  confirmação, mas não pergunta nem pausa de orçamento: cada tipo de parada viraria uma tabela e um
  protocolo próprios, reimplementando à mão o que o `interrupt()` já faz.
- **Checkpointer num banco separado.** É exatamente o "segundo lugar" que a ADR 021 recusou.
- **Serializar o estado do grafo e devolvê-lo ao cliente.** Coloca dado de saúde e chamadas de tool
  no navegador, e faz do cliente a autoridade sobre o que executa — o oposto da decisão acima.
