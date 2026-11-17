# ADR 039 — Modo automático: a IA grava sem pedir OK, quando a pessoa escolhe

**Status:** Accepted
**Data:** 2026-11-09
**Altera:** [ADR 022](./022-classificacao-3-camadas-do-chat.md), regra 2 (CONFIRMABLE "só após OK")

## Contexto

Pela ADR 022, toda tool que escreve (CONFIRMABLE) só roda depois que a pessoa aprova o cartão de
confirmação na conversa. É seguro, mas custa um toque por registro — e o registro diário (almoço,
água, a série que acabou) é exatamente o que a pessoa faz dez vezes por dia.

O redesign propõe três coisas que a ADR 022 não permitia: um modo "Automático" por categoria, a
troca de treino feita direto com "Desfazer" depois, e aprovar uma ação pelo cartão no topo da tela
Hoje, fora da conversa. O dono do produto decidiu adotar as três.

## Decisão

1. **Preferência por categoria, com três valores.** Perguntar antes (padrão para todos) ·
   Automático · Desligado. Categorias: Registros do dia (refeição, água, peso, passos) · Treino
   (sessão, séries, plano) · Metas · Memórias.
2. **O que nunca é automático:**
   - qualquer ação que apaga (`delete_*`);
   - as tools RESTRICTED, que continuam fora do alcance do modelo (ADR 022);
   - cobrança, consentimento e compartilhamento com a comunidade;
   - publicar ou comentar no mural da comunidade (é texto público em nome da pessoa).
3. **Toda gravação automática aparece na conversa** como cartão "Gravado", com o que foi criado ou
   o que mudou (antes → depois), e um **Desfazer**. Desfazer executa a operação inversa a partir do
   retrato guardado antes de gravar: apaga o que foi criado ou restaura os valores anteriores.
4. **Limites.** No máximo 5 gravações automáticas por resposta da IA (o mesmo teto de tools por
   rodada do agente); uma ação que mexe em mais de 10 itens de uma vez volta a pedir OK.
5. **"Desligado"** tira as tools da categoria do catálogo oferecido ao modelo naquela conversa.
6. **Aprovar fora da conversa.** O cartão no topo do Hoje (e do menu da IA) pode aprovar uma ação
   pendente, desde que mostre a **prévia completa** — as mesmas linhas da confirmação na conversa.
   O que roda continua sendo exatamente o que foi mostrado: os argumentos voltam literais e são
   conferidos antes de executar (ADR 022/023). Prévia resumida demais leva à conversa, não aprova.
7. **Avisar o profissional** de uma troca feita pela IA depende das mensagens entre aluno e equipe
   (#306) e fica fora desta ADR.
8. **O conector MCP não muda.** Quem usa a própria IA continua com a confirmação do cliente dele.

## Consequências

### Positivas

- O registro do dia a dia cai para zero toque extra para quem quiser.
- O controle continua com a pessoa, por categoria, e todo efeito é visível e reversível.

### Negativas

- O erro do modelo vira registro sem revisão: a estimativa por foto erra 20–30% na porção. O cartão
  "Gravado" com Desfazer é a mitigação, e a categoria fica em "Perguntar antes" por padrão.
- Infra nova: preferência por categoria, retrato "antes" de cada gravação automática para o Desfazer,
  operação inversa por tool, e o cartão "Gravado" nos dois clientes.
- Testes obrigatórios: categoria em Automático executa sem pausa; apagar e RESTRICTED nunca executam
  sem OK; limite por resposta; Desfazer restaura exatamente o estado anterior; aprovar pelo Hoje
  executa só os argumentos mostrados.

### Neutras

- A classificação de camadas (READ_ONLY, CONFIRMABLE, RESTRICTED) continua a mesma; muda só o que
  CONFIRMABLE faz quando a pessoa escolheu Automático.

## Alternativas consideradas

- **Um interruptor global de "IA automática".** Rejeitada: grosso demais; quem quer automático para
  água não quer necessariamente para o plano de treino.
- **Automático também para apagar.** Rejeitada: apagar não tem desfazer simples e é onde um engano
  do modelo mais custa.
- **Automático sem Desfazer.** Rejeitada: sem volta, a pessoa deixa de confiar no modo e desliga.
- **Manter a ADR 022 como está.** Rejeitada pelo dono do produto: o toque por registro pesa mais no
  uso diário que o risco, dado o Desfazer.

## Nota — redesign (#370, 2026-11-14)

A conferência do redesign confirma onde cada parte desta decisão aparece, sem mudar nada nela:

- O **modo por categoria** (Perguntar antes · Automático · Desligado) vive na tela
  **Configurações da IA** (`Al-M24-Config-IA`, #385), aberta por Você → IA.
- A **aprovação fora da conversa** (item 6) é o cartão "Fatia · esperando você" no menu da IA e no
  topo do Hoje (`Al-H6c8-Menu-IA-ativa`, #369), com a regra da prévia completa: se a prévia não
  couber, o botão vira "Abrir conversa".

## Nota — implementação (#385, 2026-11-17)

- **Onde mora:** `AiWriteModeSetting` (sem linha = Perguntar antes) e `AiAutoWrite` (o "antes", o
  resultado e o `undoneAt` de cada gravação automática), migration
  `20261117100000_ai_write_modes_and_memory_category`. A tela é a engrenagem no topo do chat (web e
  app), não Você → IA.
- **Quem decide é a API.** Cada tool confirmável declara `aiCategory` (39 tools). A cada turno a API
  manda ao agente `toolModes { auto, off }`. O agente chama a tool automática com o header
  `x-fatia-auto-write` (`{conversationId, runId, toolCallId}`), e o `AutoWriteService` confere de
  novo: dono da conversa, modo Automático, não apagar, até 10 itens, até 5 por resposta (por
  `runId`), `toolCallId` repetido. Fora disso a API recusa com `AUTO_WRITE_NEEDS_OK`, e o agente
  devolve a escrita ao cartão de confirmação. O agente também nunca torna automática `delete_*` ou
  `forget_*`, mesmo que a lista diga.
- **Só é automática a tool com inversa.** `AUTO_UNDO` (`chat/auto-write/undo-specs.ts`) tem retrato e
  volta exatos para refeição, item, água, peso, passos, série, sessão iniciada (só sem séries), meta
  e memória. Tool sem inversa numa categoria em Automático continua pedindo OK; o
  `tool-catalog.spec.ts` amarra isso.
- **Desfazer:** `POST /chat/auto-writes/:id/undo`, só o dono, uma vez, em até 24 h; se o registro
  mudou depois, 409 e nada muda. O cartão "Gravado" traz o `autoWriteId`.
- **Desligado** tira as escritas da categoria do catálogo do turno; as leituras continuam.
- **Fora do MCP de propósito:** não há tool para ler ou mudar o modo, nem para apagar todas as
  memórias (`DELETE /chat/memories` é só do app).
- Os testes obrigatórios estão em `auto-write.integration.spec.ts` (API) e
  `tests/chat/test_gravacao_automatica.py` (agente).

## Nota — endurecimento depois da revisão (#385, 2026-11-18)

A revisão adversarial achou seis furos. A migration `20261118090000_ai_auto_write_hardening` e estas
regras os fecham:

- **O Desfazer confere o depois.** A gravação guarda também o retrato de depois (`after`), com os
  filhos que importam: os itens e os registros do plano da refeição, as séries e o check-in da sessão.
  O Desfazer compara o estado de agora com esse retrato dentro da transação. Se algo mudou (item a
  mais, ml editado, série gravada, outra gravação por cima), responde 409 `AUTO_WRITE_CHANGED` e não
  muda nada.
- **Timeout não vira cartão.** A linha nasce pendente antes de a tool rodar e só fica `doneAt` com o
  resultado. Se a tool falha, a linha some; se a linha não entra, a tool não roda. Quando o agente
  perde a resposta, ele consulta pelo `toolCallId`, com `lookup: true` no header. Se a linha existe
  e terminou, mostra o "Gravado" dela. Se não, o modelo lê que a gravação pode não ter acontecido e
  pergunta à pessoa. Não abre o cartão de confirmação, que gravaria duas vezes.
- **Só o agente manda o header.** `x-fatia-auto-write` exige `X-Fatia-Agent-Key` igual à
  `AGENT_API_KEY`, comparada em tempo constante. Sem a chave, inclusive de cliente OAuth ou de
  token de API, é 403. O `runId` do header é o token de um `ChatRun` ativo daquela conversa e
  daquela pessoa (`runToken`, que a API manda ao agente a cada turno). O modo é conferido de novo no
  servidor.
- **Teto por mensagem da pessoa.** As 5 gravações contam por `answerKey`. A retomada de uma pausa e o
  "Continuar" (`CHAT_CONTINUE_MESSAGE`) herdam a chave da volta anterior.
- **`toolCallId` repetido.** Com o mesmo input na mesma conversa, devolve o "Gravado" que já existe.
  Com qualquer outra coisa, `AUTO_WRITE_NEEDS_OK`.
- **As cópias duram pouco.** `input`, `result`, `before`, `after` e `card` são zerados (com
  `clearedAt`) ao desfazer, depois das 24 h e quando o registro some pela tela dele. Fica o
  metadado. Ver `DATA_RETENTION.md`.
- **A tela.** `GET /chat/auto-writes/:id` dá o estado, e o cartão recarregado mostra "Desfeito" ou
  o prazo vencido. As recusas (`AUTO_WRITE_UNDONE`, `AUTO_WRITE_EXPIRED`, `AUTO_WRITE_CHANGED`) viram
  texto no web e no app. Numa alteração, o "Gravado" mostra antes → depois.
