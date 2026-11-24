# HANDOFF #481 — IA edita e exclui nutrição e treino

- Branch: `feat/481-ia-edicoes-nutricao-treino` (de origin/main d0e8c6a9)
- Portas: API 3117, web 3147 (não usadas até agora)
- Banco: `fatia_t481` (migrado + seed exercises/taco)
- Brief: /home/thiago/.cache/fatia-briefs/D.md

## Decisões

- Exclusões de nutrição/treino/água/peso/passos: `confirmableHint: true`, `destructiveHint: true`
  (continua destrutiva para o cliente MCP externo), `card: 'confirm'`, sem `appOnly`, com
  `aiCategory`. Nunca automáticas (autoEligible já exclui destrutiva; agente passa a excluir
  `destructiveHint` também, não só o prefixo).
- Restritas (lista travada no spec): delete_my_account, grant_data_sharing, revoke_data_sharing,
  set_group_sharing, accept_group_invite (consente scopes), join_group, block_user, unblock_user,
  export_my_data (link sem login com todos os dados), leave_group, delete_goal, delete_reminder,
  share_my_data e stop_sharing (intenção).
- export_my_data deixa de ser readOnly (cria link público).
- Ficam confirmáveis: mural (post/comentário/enquete), desafio, adotar plano, plano recebido.
- delete_goal / delete_reminder ficam restritas: fora do escopo (não é nutrição/treino).
- Categoria DAY_LOG também nas escritas de nutrição sem categoria citadas no brief
  (save_meal_template, create/update_custom_food, create_food_portion, set_food_favorite).
- Nova ADR para alterar a regra 2 da ADR 022.

## Checklist

- [ ] testes vermelhos (API tool-catalog lock, rotulos; agente automaticas destrutiva)
- [ ] anotações das tools
- [ ] prévia (rotulos/previa) para as exclusões; remover resolvers mortos de consentimento/bloqueio
- [ ] intenção stop_sharing → RESTRICTED
- [ ] agente: tool_policy, prompt, app_only
- [ ] docs: MCP_TOOL_SURFACE, eval-fronteira, PERMISSIONS, MCP.md, ADR
- [ ] números do MCP pelos specs
- [ ] lint/typecheck/testes
- [ ] PR

## Estado

Início.
