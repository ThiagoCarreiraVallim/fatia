# ADR 034 — Langfuse Cloud para o chat, com máscara e sem o resultado das tools

**Status:** Accepted (Fase 9c, 18/10/2026)
**Data:** 2026-10-18

## Contexto

Em produção, quase toda pergunta ao chat falhava na hora e passava no "tentar de novo". Sem
nenhum registro do que cada turno fez, a investigação foi por leitura de código (a causa estava no
pool do checkpointer, corrigida na Fase 9b). O agente não tinha tracing: só `logger.warning(code)`.
O OpenTelemetry da `api` (Tempo) mede latência de requisição, não o que o modelo recebeu, quanto
custou e qual tool falhou.

O chat fala de saúde. Qualquer ferramenta de observabilidade de LLM recebe, por definição, o
texto da conversa — é um operador de dados novo.

## Decisão

1. **Langfuse Cloud, região UE**, pelo SDK v4 (OpenTelemetry). Self-host foi descartado: o
   Langfuse v3+ exige ClickHouse, Redis e S3, pesado para o VPS atual. Sem `LANGFUSE_PUBLIC_KEY` e
   `LANGFUSE_SECRET_KEY`, nada é enviado.
2. **Um trace por turno**, com id derivado do `runId` (`Langfuse.create_trace_id(seed=runId)`):
   - `session_id` = id da conversa;
   - `user_id` = **HMAC-SHA256 do id da pessoa** com a `AGENT_API_KEY`, que o Langfuse não tem;
   - uma `generation` por chamada ao modelo (modelo, tokens, custo do OpenRouter, tempo até o
     primeiro token), um span `tool` por tool (nome, duração, deu erro, **tamanho** do resultado);
   - o desfecho do turno (`completed`, `interrupted`, `error` com o `code`, `stopped`).
3. **O que sai do texto passa por `mask`** (e-mail, CPF, CNPJ e telefone viram marcadores, com
   limites que não casam dentro de UUID) e por `messages_for_trace`, que **não envia**: o resultado
   das tools, os argumentos das tools, as imagens (viram `[imagem]`) e o áudio.
4. **Observações com pai explícito**, encerradas à mão. O turno é um gerador assíncrono consumido
   pela resposta HTTP; mexer no contexto "corrente" do OpenTelemetry entre um `yield` e outro o
   restauraria fora de ordem. O `TracerProvider` é próprio, não o global.
5. **O voto 👍/👎 vira score `user_feedback`** no trace do turno: a `api` manda `runId`, sinal e
   motivos fechados ao `POST /feedback` do agente (com a `X-Fatia-Agent-Key`). O comentário livre
   da pessoa **não** vai. Desfazer o voto apaga o score.
6. **Nunca derruba o chat.** Toda chamada ao SDK é protegida; a exportação é em lote, fora do
   caminho da resposta; o `lifespan` esvazia a fila no desligamento.

## Consequências

- A causa de uma resposta ruim ou de um erro é uma busca por conversa ou por horário, não uma
  leitura de código.
- **Operador novo na política de privacidade**, com o que recebe e o que não recebe. A retenção é
  a do projeto no Langfuse (30 dias no plano Hobby).
- A pergunta e a resposta continuam sendo dado de saúde em prosa, mesmo mascaradas. Quem não
  aceitar isso desliga tirando as chaves — o resto do chat não muda.
- `LANGFUSE_SAMPLE_RATE` reduz volume e custo; a decisão é pelo trace id, então o voto segue o
  turno.

## Alternativas consideradas

- **Self-host no Dokploy:** dados na nossa infraestrutura, mas ClickHouse + Redis + S3 não cabem
  no VPS de hoje.
- **Só logs estruturados:** não dão custo por conversa, tempo até o primeiro token nem a árvore de
  chamadas de um turno.
- **Mandar o resultado das tools:** facilitaria depurar resposta errada, mas é o registro de
  saúde inteiro da pessoa num fornecedor externo. O tamanho do resultado e o nome da tool bastam
  para achar o turno; o conteúdo se confere no banco da Fatia.
