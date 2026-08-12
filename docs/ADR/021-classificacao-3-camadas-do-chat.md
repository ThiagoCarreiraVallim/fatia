# ADR 021 — Classificação de tools em 3 camadas para o chat MCP

**Status:** proposta  
**Data:** 2026-08-12  
**Autores:** agente Python + NestJS  

## Contexto

O chat hospedado hoje oferece ao modelo apenas ferramentas de leitura (`readOnlyHint: true`).
Isso significa que "comi 200g de frango" não pode registrar a refeição — o agente simplesmente
não tem a tool. Mas uma ferramenta de escrita via chat, sem tela de confirmação, inverte a
propriedade da #139: **o que a IA produz é sugestão, quem grava é o caminho manual**.

A solução da #247 (PWA com design system swervable) traz um modal de confirmação visual no fio.
Com ele, o recorte do agente pode expandir: ferramentas que são reversíveis ou idempotentes
podem ser oferecidas ao modelo, mas **só executam após aprovação explícita do usuário na tela**.

## Decisão

Cada tool do catálogo MCP é classificada em uma de três camadas, baseada nas anotações que o
servidor `/mcp` anuncia:

| Camada          | Critério                                                        | Oferecida ao modelo? | Executa direto? | Exemplo                              |
|-----------------|-----------------------------------------------------------------|----------------------|-----------------|--------------------------------------|
| **READ_ONLY**   | `annotations.readOnlyHint is True`                               | Sim                  | Sim             | `get_meal`, `list_meals`, `search_food` |
| **CONFIRMABLE** | `annotations.readOnlyHint is False` e `annotations.confirmableHint is True` | Sim                  | Só após OK      | `log_meal`, `create_custom_food`, `start_workout_session` |
| **RESTRICTED**  | Tudo o mais (não READ_ONLY, não CONFIRMABLE)                     | Não                  | Nunca           | `delete_my_account`, `delete_meal`   |

## Regras de ação

1. **READ_ONLY** — executa direto no nó `agir`. Sem interrupção.
2. **CONFIRMABLE** — pausa o grafo em um novo estado `proposta_confirmavel`. Emite evento
   SSE de tipo `proposta` com os detalhes da operação pendente e as tools confirmáveis.
   O NestJS repassa esse evento ao PWA, que mostra o modal; o usuário aprova ou recusa por
   texto/emoji na conversa. Só após aprovação volta para `agir`.
3. **RESTRICTED** — nunca oferecida ao modelo. Se o modelo inventar um nome de tool RESTRICTED,
   `exigir_permitida` rejeita antes da chamada (falha fechada).

## Consequências

- **Para o NestJS**: 12 tools precisam ganhar `confirmableHint: true`. Tools destrutivas (`delete_`)
  continuam com apenas `destructiveHint: true`, sem confirmação no chat — elas são RESTRICTED.
- **Para o agente Python**: `tool_policy.py` ganha duas novas funções de classificação; o grafo
  LangGraph ganha um nó `confirmar` que pausa pra aprovação.
- **Para o prompt do sistema**: instrui o modelo a "PARE antes de executar" ações CONFIRMABLE,
  gerar uma proposta e esperar resposta.
- **Para o PWA Web**: componente de modal de confirmação usando design system swervable já integrado.

## Regras de anotação (falha fechada)

1. `readOnlyHint` é booleano obrigatório — `true` = READ_ONLY.
2. `destructiveHint` é booleano obrigatório — `true` = destrutiva irreversível → RESTRICTED.
3. `confirmableHint` é booleano opcional — `true` = reversível/idempotente → CONFIRMABLE.
4. Tool sem nenhuma anotação clara entra em **RESTRICTED** por padrão. Não existe "implícito".
5. Ferramentas admin destrutivas irreversíveis (`delete_my_account`, bulk import) continuam
   RESTRICTED — nunca expostas ao chat, nem confirmáveis.

## Alternativas consideradas e descartadas

- **Lista de nomes no agente**: apodrece se tool renomeada some do recorte ou tool nova nasce fora dele.
  O critério é um campo que o servidor já serve em toda sessão.
- **Modal popup no mobile/Expo**: escopo deste ADR é PWA Web só. Mobile continua sem modal até #208.
- **Boolean identity vs truthiness**: `1 == True` em Python faria `"true"` e `1` passarem. Checagem
  por identidade com `True`.

## Verificação

- MCP Inspector: 12 tools com `confirmableHint: true`, leitura continua readOnly, deletoras continuam destrutivas.
- Smoke test: "Comi 200g de frango" → pausa pra confirmação; confirmar → dados salvos; cancelar → dados não salvos.
- Erro: tool sem anotação clara não aparece no chat — resta apenas leitura ou admin restrita.
