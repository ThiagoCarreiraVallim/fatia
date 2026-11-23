# HANDOFF #413 — Painel: configurações, integrações e novidades

NÃO COMMITAR NA PR FINAL (apagar antes do último commit).

Branch `redesign/413-configuracoes` (worktree agent-a4877466a5a7fba4d). API 3113, web 3143.
Banco descartável `fatia_t413` (DATABASE_URL = .env com `/fatia_t413`). Migration `20261123100000_group_settings_integrations`.
Pranchas em `.canvas/project/` (Pn-15, Pn-38, Pn-38b, Pn-27, Pn-27b, Onb-C2).

## Decisões (adotadas da issue / tomadas aqui)

- Cor e capa no banco (`Group.brandColor`, `Group.coverFileId`, purpose `group_cover`).
- Seções (do script da Pn-15): NUTRITION_TIPS, NUTRITION_PLANS, CHALLENGES, FEED, AGENDA. Só visual; AGENDA vale quando a #397 entrar.
- Cota: conta chamadas autenticadas por chave, teto por tipo de comunidade (SPONSORED 10.000, SOCIAL 2.000) por mês no fuso da comunidade.
- Integrações só do dono (`integration.manage`), o mais restritivo.
- Chave: `fatia_live_` + 32 base62; guarda sha256; mostra os 4 últimos.
- Chave nunca lê dado de saúde (nem com consentimento): convites, membros (nome, papel, origem, data), envios (planos e vendas de programa).
- Tipo da comunidade: só o dono muda, e não vira Social com assentos ativos.
- Webhooks (#324), Strava/Garmin (#339), redes (#323) fora.

## Checklist

- [x] schema + migration (novidades do painel em código: `you/panel-news-catalog.ts`, ids `painel-`, lidas em `UserNewsRead`)
- [x] API: configurações (marca, capa, seções, tipo) — vermelho, verde
- [x] API: chaves, guarda, cota, log, rotas /integrations/v1 — vermelho, verde
- [x] API: novidades e ideias — vermelho, verde
- [x] isolamento (user-isolation.spec) + matriz (PERMISSIONS.md)
- [ ] api-client (tipos, rotas, helpers puros) — vermelho, verde
- [ ] web: Configurações (Pn-15)
- [ ] web: Integrações (Pn-38/38b)
- [ ] web: Novidades (Pn-27/27b) + menu lateral
- [ ] web/app: seções escondidas na comunidade do membro + marca
- [ ] docs: REDESIGN_PROGRESS (etapa 10, #413), PERMISSIONS, DATA_RETENTION, MOBILE_PARITY
- [ ] passada visual (~/.cache/fatia-vis/413/)
- [ ] testes completos, lint, typecheck; PR

## Estado atual

- Rebase sobre a main com a #469 (#410) feito; conflitos em schema e invite.service resolvidos (preview tem avatarUrl + brandColor + coverUrl).
- API completa e verde (group-settings, integrations, panel-news, user-isolation, account.service, panel, permission-matrix). tsc api ok.
- `invite-email-retention.spec` falhou uma vez rodando junto com outros (passa sozinho): flake de banco compartilhado, ficar de olho na rodada completa.
- Próximo: api-client (tipos MyGroup, orgApi update/cover, apiKeys, panelNews, helpers, PanelSection 'integrations'/'updates', ROLE_ACTIONS integration.manage).
