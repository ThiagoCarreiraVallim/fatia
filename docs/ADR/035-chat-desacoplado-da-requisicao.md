# ADR 035 — A resposta do chat corre no servidor, desacoplada da requisição

**Status:** Accepted (Fase 9d, 18/10/2026)
**Data:** 2026-10-18

## Contexto

A resposta do chat vivia dentro do `POST /chat`. Fechar a aba, ir do chat ao diário, o celular
suspender o PWA ou a rede piscar fechava a conexão, a API cortava o agente e o turno ficava
`stopped` pela metade — pago, e sem resposta. O runtime do chat morava no layout de `/chat`, então
qualquer navegação para fora desmontava tudo. O app nativo, que ganha chat na Fase 9e, troca de
aba e vai para o segundo plano o tempo todo.

A Lunia (`imobbi-app-backend/src/infra/http/lunia`) resolve o mesmo problema com um buffer de
quadros por conversa e um `GET /live` que reenvia tudo e segue ao vivo. Não tem cursor (reenvia do
começo), e o "parar" dela só fecha o cliente.

## Decisão

1. **O turno corre até o fim no servidor.** `ChatService.converse` publica cada evento SSE num
   `ChatRun` (`chat-run.registry.ts`); a requisição que o abriu é só a primeira assinante. Sair
   tira a assinatura e **não** corta o agente: a resposta termina, é gravada e cobrada como
   sempre.
2. **Eventos numerados.** Os bytes do agente são cortados em eventos completos e cada um sai com
   `id: <n>`. `GET /chat/conversations/:id/live?after=<n>` (ou `Last-Event-ID`) reenvia o que veio
   depois de `n` e segue ao vivo até o fim; 204 quando não há nada. Conversa alheia é 404, e o
   registro só entrega o turno à dona.
3. **Parar é explícito.** `POST /chat/conversations/:id/stop` corta o agente, fecha o fio com
   `done: stopped` e grava `stopped`. O botão "Parar" chama a rota; parar antes de o agente
   responder corta assim que ele abre.
4. **Um turno por conversa.** Um segundo `POST` enquanto o primeiro corre recebe 409
   `CHAT_RUN_IN_PROGRESS` — dois turnos na mesma thread do checkpointer se atropelariam.
5. **O cliente reconecta sozinho.** `streamChat` e `joinChatRun` (api-client) guardam o último `id`
   e, se a conexão cair antes do `done`, voltam pelo `live` com `after` (3 tentativas, 0,5 s,
   1,5 s e 4 s). Na web o runtime sobe para o layout do app inteiro: fora do chat aparece
   "Respondendo…" e, no fim, "Resposta pronta"; abrir uma conversa com `running: true` acompanha a
   resposta como se a pessoa nunca tivesse saído.
6. **Memória do processo.** Teto de 8 MB por turno (os eventos mais antigos saem do reenvio),
   disponível por 60 s depois do fim, comentário `: ping` a cada 15 s para proxy não cortar
   conexão parada.

## Consequências

- Sair do chat não perde mais resposta nem dinheiro; o app nativo herda isso de graça.
- **Uma instância da API.** Com réplicas, o `live` pode cair noutra e responder 204 (o cliente
  mostra a queda). A troca é por um Redis Stream por turno, sem mudar o protocolo.
- Reinício da API no meio de um turno perde o turno (como antes); o cliente recebe 204 no `live`
  e mostra "a conexão caiu".
- Fechar a aba não economiza mais a inferência; quem quer parar usa o botão.

## Alternativas consideradas

- **Buffer sem cursor, como a Lunia:** reenviar tudo obriga o cliente a descartar a tela e
  redesenhar; com o `id` ele continua de onde estava.
- **Redis Streams já:** certo para várias réplicas, mas um serviço novo para uma instância só.
- **Gravar cada fragmento no Postgres:** escrita por token na tabela de mensagens, para um caso
  (reconexão nos 60 s seguintes) que a memória atende.
