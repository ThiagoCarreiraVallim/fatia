# HANDOFF frente A — PR 2: #488 (voz pela OpenRouter)

Brief: /home/thiago/.cache/fatia-briefs/A.md

- Branch: `feat/488-voz-openrouter` (de origin/main b78791ac). PR 1 (#486/#487/#482) já aberto: #494.
- Portas: API 3114, agente 8114. Banco `fatia_t486`. Trava do emulador: frente-A.
- Scripts da API/agente próprios: scratchpad da sessão `fa/api.sh` e `fa/agent.sh`
  (API = node dist/main com DATABASE_URL fatia_t486, AGENT_BASE_URL 8114, AI_REQUIRES_PLAN=false;
  agente = env de apps/agent/.env da main, MCP 3114, checkpointer fatia_t486).

## Pesquisa (2026-11-24)

- OpenRouter: chat/completions aceita `{"type":"input_audio","input_audio":{"data":<base64>,"format":...}}`.
- Testado ao vivo com `google/gemini-3.5-flash-lite`, `provider.zdr=true` + `data_collection=deny`
  (provedor: Google): m4a, aac, mp4, webm, ogg, mp3 e wav — todos transcreveram certo
  ("Almocei 200 g de arroz, um bife e uma salada de alface."). ~150 tokens de entrada para 5 s.
- Sem conversão: o AAC do app (audio/mp4) e o webm/opus da web passam como estão.
- O `/audio/transcriptions` da OpenRouter existe, mas é multipart e não leva o `provider.zdr`; fica de fora.

## Decisões

- Modelo padrão da transcrição: `google/gemini-3.5-flash-lite` (o mais barato com ZDR e áudio
  na lista da OpenRouter; áudio a US$ 0,30/M tokens). Entra em `ALLOWED_MODELS["transcription"]`.
- Padrão só quando `AI_BASE_URL` é openrouter.ai e `AI_MODEL_TRANSCRIPTION` vazio; local fica vazio.
- Transcrição vira chat/completions com input_audio (mesma rota com retenção zero). Uso volta em
  tokens (inputUnits/outputUnits), não mais segundos.
- /privacy e aceite do chat precisam nomear o modelo da voz (mesma PR, regra do allowed_models).

## Checklist

- [x] agente: testes vermelhos (transcrição por chat, padrão, formato) → implementação (red em ~/.cache/fatia-vis/488/red-agent.txt)
- [x] API: hosted-ai grava tokens de entrada e saída do ditado (red-api.txt)
- [x] /privacy + aceite (nome do modelo da voz; aceite do chat pede de novo porque o nome mudou)
- [x] .env.example, apps/agent/.env.example, .env.production.example (AI_PRICE_TABLE), README do agente
- [x] lint/typecheck/testes
- [x] teste ao vivo: /transcribe do agente 8114 com m4a e webm (~/.cache/fatia-vis/488/agente-ao-vivo.txt)
- [ ] prints do app (microfone aparecendo, transcrição no campo) — trava do emulador
- [ ] PR (apagar este arquivo antes)

## Estado atual

Tudo verde e testado ao vivo no agente. Falta print do app (trava) e o PR.
