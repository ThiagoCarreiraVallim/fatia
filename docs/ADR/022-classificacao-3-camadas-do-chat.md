# ADR 022 — Classificação de tools em 3 camadas para o chat MCP

**Status:** Accepted  
**Data:** 2026-08-12  
**Substitui parcialmente:** [ADR 021](./021-agente-recebe-o-bearer-do-usuario.md), §"O recorte: o
chat hospedado só chama tool de **leitura**" — o recorte deixa de ser só leitura. O resto da 021
(o Bearer do usuário, sem `DATABASE_URL`, sem checkpointer) continua valendo inteiro.

## Contexto

O chat hospedado hoje oferece ao modelo apenas ferramentas de leitura (`readOnlyHint: true`).
Isso significa que "comi 200g de frango" não pode registrar a refeição — o agente simplesmente
não tem a tool. Mas uma ferramenta de escrita via chat, sem tela de confirmação, inverte a
propriedade da #139: **o que a IA produz é sugestão, quem grava é o caminho manual**.

A tela da #250 traz onde pedir confirmação. Com ela, o recorte do agente pode expandir:
ferramentas reversíveis ou idempotentes podem ser oferecidas ao modelo, mas **só executam após
aprovação explícita do usuário na tela**.

## Decisão

Cada tool do catálogo MCP é classificada em uma de três camadas, baseada nas anotações que o
servidor `/mcp` anuncia:

| Camada          | Critério                                                                    | Oferecida ao modelo? | Executa direto? | Exemplo                                                   |
| --------------- | --------------------------------------------------------------------------- | -------------------- | --------------- | --------------------------------------------------------- |
| **READ_ONLY**   | `annotations.readOnlyHint is True`                                          | Sim                  | Sim             | `get_meal`, `list_meals`, `search_food`                   |
| **CONFIRMABLE** | `annotations.readOnlyHint is False` e `annotations.confirmableHint is True` | Sim                  | Só após OK      | `log_meal`, `create_custom_food`, `start_workout_session` |
| **RESTRICTED**  | Tudo o mais (não READ_ONLY, não CONFIRMABLE)                                | Não                  | Nunca           | `delete_my_account`, `delete_meal`                        |

## Regras de ação

1. **READ_ONLY** — executa direto no nó `agir`. Sem interrupção.
2. **CONFIRMABLE** — o nó `confirmar` emite `proposal` e **não executa**. O turno fecha com
   `done`/`reason: "awaiting_confirmation"`. Se a pessoa aprovar, o PWA abre um turno novo com a
   proposta em `approved`, e o agente a executa antes de falar com o modelo.
3. **RESTRICTED** — nunca oferecida ao modelo. Se o modelo inventar um nome de tool RESTRICTED,
   `exigir_permitida` rejeita antes da chamada (falha fechada).

## Dois turnos HTTP, e não uma pausa no grafo

A leitura óbvia de "pausa para confirmar" é `interrupt()` do LangGraph. **Não dá**, e a razão é a
própria ADR 021: pausar e retomar exige checkpointer, e não há — a persistência é do NestJS
(ADR 015), e um checkpointer no agente gravaria histórico de saúde num segundo lugar, fora do banco
que a LGPD deste produto descreve.

Por isso o handshake é de dois turnos, com o estado da proposta vivendo na tela entre eles. O
agente continua sem memória: `approved` é entrada da requisição, como `message` e `history`.

**O segundo turno executa antes de consultar o modelo.** Pedir a ele que chame a tool de novo
trocaria uma garantia por uma probabilidade — ele pode reformular os argumentos, e o que rodaria
deixaria de ser o que a pessoa viu. Por isso os `arguments` viajam inteiros no `proposal` e voltam
literais: `exigir_aprovada` compara o texto, e o que não bate volta a ser proposta.

O eco pelo cliente não é furo de autorização: a tool roda com o Bearer da própria pessoa contra os
dados dela, e o recorte de camadas continua valendo. Adulterar `arguments` não alcança nada que ela
já não pudesse fazer pela tela do app.

## Consequências

- **Para o NestJS**: `confirmableHint` é **obrigatório** nas 103 tools, como os outros dois hints, e
  vai no fio junto de `annotations` — é o campo de que o agente deriva o recorte. `tool-catalog.spec.ts`
  reprova quem não declarar, quem marcar leitura como confirmável e quem marcar destrutiva como
  confirmável. O payload do catálogo sobe de 78,4 k para 80,8 k caracteres.
- **Para o agente Python**: `tool_policy.py` ganha as três camadas e `exigir_aprovada`; o grafo ganha
  o nó `confirmar` e a aresta `receber → agir` do turno de aprovação.
- **Para o prompt do sistema**: o modelo é instruído a **chamar** a ferramenta em vez de pedir
  confirmação por texto — a tela já pergunta, e um modelo que pergunta antes faz a pessoa confirmar
  duas vezes.
- **Para o PWA Web**: um cartão no fim da conversa, não um popup. A decisão é sobre a mensagem logo
  acima, e um overlay esconderia justamente o que precisa ser relido antes de aprovar.
- **37 tools ficam CONFIRMABLE.** `grant_data_sharing` e `join_group` ficam **fora**, apesar de serem
  escrita não-destrutiva: elas mudam quem vê a saúde de quem, e revogar não desfaz — quem leu, leu. O
  critério da camada é reversibilidade, e exposição não é reversível.

## Regras de anotação (falha fechada)

1. `readOnlyHint` é booleano obrigatório — `true` = READ_ONLY.
2. `destructiveHint` é booleano obrigatório — `true` = destrutiva irreversível → RESTRICTED.
3. `confirmableHint` é booleano **obrigatório** — `true` = reversível/idempotente → CONFIRMABLE.
   Obrigatório e não opcional pelo motivo dos outros dois: um default classificaria toda tool nova
   como fora do chat, e a capacidade sumiria sem ninguém ligar "o chat não registra mais peso" a um
   campo esquecido num decorator.
4. Tool sem nenhuma anotação clara entra em **RESTRICTED** por padrão. Não existe "implícito".
5. Ferramentas admin destrutivas irreversíveis (`delete_my_account`, bulk import) continuam
   RESTRICTED — nunca expostas ao chat, nem confirmáveis.

## Alternativas consideradas e descartadas

- **Lista de nomes no agente**: apodrece se tool renomeada some do recorte ou tool nova nasce fora dele.
  O critério é um campo que o servidor já serve em toda sessão.
- **`interrupt()` do LangGraph**: exige checkpointer, que a ADR 021 descarta. Ver a seção acima.
- **Pedir ao modelo que chame a tool de novo no segundo turno**: ele pode reformular os argumentos, e
  o que executa deixaria de ser o que foi aprovado.
- **A API persistir a proposta pendente**: resolve o eco pelo cliente, mas custa tabela e migration
  para uma garantia que o Bearer do usuário já dá. Reconsiderar se a proposta passar a valer entre
  dispositivos.
- **Modal popup sobreposto**: cobre a mensagem que torna a decisão decidível. E no mobile/Expo não há
  tela nenhuma até a #208 — lá o chat segue só leitura.
- **Boolean identity vs truthiness**: `1 == True` em Python faria `"true"` e `1` passarem. Checagem
  por identidade com `True`.

## Verificação

- `tool-catalog.spec.ts`: as três anotações declaradas nas 103 tools, e a coerência entre elas.
- `tests/chat/test_confirmacao.py`: proposta não executa, aprovada executa, aprovada com argumento
  diferente **não** executa, restrita não executa nem aprovada. Cada caso confere o que chegou ao
  `/mcp`, e não só o evento emitido.
- `chat-view.test.tsx`: cartão aparece sem gravar, cancelar não chama o servidor, confirmar devolve
  os argumentos byte a byte.
- Smoke: "Comi 200 g de frango" → cartão de confirmação; confirmar → salvo; cancelar → não salvo.
