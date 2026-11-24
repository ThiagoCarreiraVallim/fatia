# HANDOFF frente A (chat da IA): #486, #487, #482 (PR 1) e #488 (PR 2)

Brief: /home/thiago/.cache/fatia-briefs/A.md

- Branch PR 1: `fix/486-chat-mais-simples` (de origin/main d0e8c6a9)
- Branch PR 2: `feat/488-voz-openrouter` (a criar, de origin/main)
- Portas: API 3114, web 3144. Banco `fatia_t486`. Trava: frente-A.

## Decisões (PR 1)

- #486 (app): lógica pura em `apps/mobile/src/chat/follow-end.ts` (testada). Segue o fim só se
  perto (< 96 px); arrasto do usuário decide; enviar volta a seguir; botão "Ir para o fim".
  Web já usa `use-stick-to-bottom` + `ConversationScrollButton` (nada a fazer).
- #487:
  - Tira "Raciocínio", PlanCard/PlanoDoTurno, tempo de resposta (app `durationMs`, web
    `MessageTiming`/turn-timing).
  - Cartão aberto por padrão só quando pede ação: `chatArtifactAsksAction` em api-client
    (`saved`, `app_only`, `file`). O resto vira linha recolhida.
  - Topo do app: só Conversas + Nova conversa. Config da IA vai para o topo da lista de conversas
    (`/chat`). Busca na web só em `/chat/settings` (já existia lá).
  - Web: topo só Conversas + Nova; Config da IA (e memórias, por dentro dela) abre de um botão
    dentro da gaveta de conversas.
- #482: toque na câmera abre a câmera e manda a foto na hora (com o texto do campo); segurar
  abre a galeria (até 3). Visão cai para `AI_MODEL_TEXT` quando `AI_MODEL_VISION` vazio
  (agente, settings) — o modelo continua passando pela lista revisada.

## Checklist PR 1

- [x] api-client: `chatArtifactAsksAction` + teste
- [x] mobile: follow-end + teste; [id].tsx
- [x] mobile: message-list (reasoning, plan, duração, cartões recolhidos)
- [x] mobile: topo + config na lista
- [x] mobile: composer câmera direta
- [x] web: thread/partes/chat-screen/conversas (renomeados: ConversationsDrawer, AiSettingsDrawer, MemoriesDrawer)
- [x] agente: visão cai para o modelo de texto + teste; prompt sobre foto
- [x] lint/typecheck/testes (api-client 1316, web 1281, mobile 622, agente 597)
- [x] prints web em ~/.cache/fatia-vis/486/web-*.png
- [ ] prints app (esperando a trava do emulador)
- [ ] PR

## Ambiente de teste (vivo)

- env: /tmp/claude-1000/fa/env.sh (banco fatia_t486, API 3114 com AI_REQUIRES_PLAN=false,
  agente uv na 8114 com o .env do agente de dev, web 3144 via /tmp/claude-1000/fa/webctl.sh)
- sessão web do demo: /tmp/claude-1000/fa/demo.json (login feito com a web na 3030: o Logto
  não tem redirect da 3144; cookie de localhost vale para qualquer porta)
- script de prints web: /tmp/claude-1000/fa/pw/web-chat.mjs (copiar para e2e/ e rodar com node)
- prova de vermelho web: ~/.cache/fatia-vis/486/red-web.txt

## Estado atual

PR 1 implementado e verde, falta print do app e abrir o PR. Depois PR 2 (#488).
