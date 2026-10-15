# Novo direcionamento do Fatia

> Free/Pago, comunidades de academias e influencers, dashboard web da equipe, gamificação, timeline moderada, UX sem IA e reset de senha.
>
> **Status:** proposta. As decisões que contrariam ADRs aceitas só valem depois das ADRs 024–029 (Fase 0). Este plano vira épica e sub-issues no GitHub, conforme [`TASKS.md`](./TASKS.md); este arquivo registra o desenho, não o andamento.

## Contexto

Hoje o Fatia é "self-hosted, MCP-first, gratuito para o aluno". O B2B (#152) existe pela metade: grupos, papéis, consentimento, insights agregados e o cálculo de cobrança estão prontos; social (#161/#162), persistência da cobrança e painel do dono não foram feitos. O novo direcionamento:

1. **Usuário comum: Free ou Pago.** Free = app + MCP (traz a própria IA). Pago = preço simples que libera a IA hospedada (chat, foto, ditado).
2. **Academia/influencer cria comunidades** e compra **assentos** do plano pago para membros escolhidos.
3. **Dashboard web** para a equipe: dados dos membros (com consentimento dado ao entrar), convites, planos prontos e dicas.
4. **Gamificação** (desafios por aderência à própria meta e por atividade, ranking) e **timeline de posts com imagem**, moderada pela equipe.
5. **Otimização completa da UI**, validada com Playwright (antes/depois de cada mudança), e **usabilidade forte das funções básicas**, já que o Free não tem IA no app.
6. **Esqueci minha senha** via Logto + conector de e-mail.

Decisões tomadas com o usuário:

- Desafio de nutrição = **aderência à própria meta** (dias na faixa de kcal/proteína), nunca o valor bruto.
- Dashboard = **consentimento por escopo ao entrar** (reusa `ProfessionalLink`), individual de quem consentiu e agregado do resto.
- Pagamento = **Asaas na web + IAP (RevenueCat) no mobile**, uma tabela de assinatura só.
- B2B = **assentos escolhidos** pelo dono.
- Posts **com imagem** (storage S3/R2/MinIO).
- Playwright com **Logto real + usuário seed** (sem bypass de auth).
- Reset de senha = **Logto nativo + conector de e-mail**, configurado por script.
- Branch: **`feat/comunidades-planos`**, criada a partir de `fix/chat`.

## O que já existe e será reaproveitado

| Área                | Reuso                                                                                                                                                                                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Grupos/papéis       | `Group`, `GroupMembership`, `GroupRole`, `MembershipStatus` (schema.prisma l.579+); `sharing/permissions.ts` (matriz `GROUP_PERMISSIONS`, já tem `invite.*`, `content.publish/moderate`, `billing.*`, `offer.create`); `sharing/guards/group-role.guard.ts`; decorators `@RequireGroupAction/@SelfOnly/@ConsentGoverned`; `permission-matrix.spec.ts` |
| Consentimento       | `ProfessionalLink` + `ProfessionalAccessLog`; `sharing/professional-access.service.ts#assertReadable` (único ponto de leitura cruzada); `student-view.service.ts`; tela `(pro)/students`                                                                                                                                                              |
| Planos prontos      | `sharing/plan-snapshot.ts` + `plan-materializer.service.ts` (cópia no aceite, ADR 014); propostas de schema `PlanTemplate`/`PlanTemplatePublication` do PR #243                                                                                                                                                                                       |
| Social              | `social/scoreboard.service.ts` (ranking com empate), `social/challenge-metric.ts`; proposta de `GroupPost`/`GroupChallenge`/`GroupChallengeParticipant` do PR #244                                                                                                                                                                                    |
| Insights            | `insights/*` (supressão `MIN_CELL=5`), `stats-participation.port.ts` (`NoStatsParticipation` hoje)                                                                                                                                                                                                                                                    |
| Billing             | `billing/billing-provider.port.ts`, `billing/asaas/asaas.provider.ts`, `close-cycle.ts`, `cycle.ts`, `ai-tier.ts#decideAiTier`, `entitlements.port.ts`, `static-entitlements.service.ts`                                                                                                                                                              |
| Cota IA             | `ai/ai-quota.ts`, `ai/ai-usage.service.ts` (`assertDentroDaCota`, `registrar`), `chat/chat.service.ts#converse/transcrever`, `GET /chat/availability`, `GET /chat/quota`, `components/chat/cota.tsx`                                                                                                                                                  |
| Gamificação pessoal | `progress/streak.service.ts`, `progress/achievement-catalog.ts`, `achievement.service.ts`, `goals/`, `UserGoals` (faixa kcal/macros)                                                                                                                                                                                                                  |
| Logto               | `auth/logto-management.service.ts` (M2M), `apps/web/src/lib/logto.ts`, `apps/mobile/src/auth/auth-context.tsx`                                                                                                                                                                                                                                        |
| UI                  | shadcn/Radix + vaul (`apps/web/src/components/ui`), gorhom bottom-sheet (mobile), tokens em `apps/web/src/app/globals.css` + `apps/mobile/src/theme` (paridade testada em `palette.test.ts`), `@fatia/api-client` (transporte por app)                                                                                                                |

Convenções a seguir (docs/CLAUDE.md, CONTRIBUTING.md): REST e MCP chamam o mesmo service; isolamento na aplicação (recurso alheio → `NOT_FOUND`); `@CurrentUser()` sempre; um tool MCP por arquivo com Zod e `hostedInference`; atualizar `docs/MCP.md`/`MCP_TOOL_SURFACE.md` (contagem testada); migrations append-only com índice `[userId, X]` e `onDelete: Cascade`; testes em `__tests__/` provando o vermelho; ADR nova a partir de `docs/ADR/_template.md` (próxima = 024); commits Conventional em português.

## Fase 0 — Branch, plano versionado e ADRs (fundação de decisão)

1. `git checkout -b feat/comunidades-planos` a partir de `fix/chat`.
2. ~~Versionar este plano como `docs/NOVO_DIRECIONAMENTO.md`~~ (feito). Abrir a épica e as sub-issues por fase e atualizar `docs/TASKS.md` e o Roadmap do README.
3. ADRs (cada uma substitui/complementa explicitamente o que conflita):
   - **024 — Plano Free/Pago do usuário**: supera a doutrina "nunca vende" (`ai-quota.ts`, `ai-tier.ts`, Termos). Free = app + MCP; Pago = IA hospedada. Entitlement único `aiTierForUser`.
   - **025 — Assentos B2B**: troca o "por aluno ativo" do `BILLING.md` por assentos; `SOCIAL` (influencer) passa a poder pagar assentos.
   - **026 — Consentimento ao entrar na comunidade**: escopos aceitos no join viram `ProfessionalLink` para a equipe (OWNER/PROFESSIONAL/CREATOR); revogável; individual só com link ativo, resto agregado.
   - **027 — Desafios por aderência**: libera métricas `KCAL_IN_RANGE_DAYS`/`PROTEIN_TARGET_DAYS` (binário, contra a própria meta); nunca valor bruto nem corpo.
   - **028 — Imagens de posts**: complementa ADR 004/020 (foto de refeição continua sem armazenamento); storage S3-compatível, strip de EXIF, exclusão com a conta/post.
   - **029 — Playwright e usuário de teste**: supera "sem E2E na v1"; sem bypass de auth.
4. Atualizar `docs/PERMISSIONS.md`, `docs/BILLING.md`, `docs/DATA_RETENTION.md`, `docs/THREAT_MODEL.md`, `docs/DESIGN.md` (hoje desatualizado e contrário a "forms rápidos"), Termos/Privacidade (`apps/web/src/app/(public)/terms|privacy`).

## Fase 1 — Infra de verificação visual (Playwright) e baseline "antes"

- `scripts/logto-bootstrap.ts` (Management API, M2M já suportado): cria apps/resource se faltarem, **sign-in experience como código** (e-mail+senha, cadastro aberto, "esqueci a senha"), branding Fatia, e o **usuário demo** `demo@fatia.local`.
- `packages/db/prisma/seed-demo.ts` + script `db:seed:demo`: preenche 30 dias de refeições, treinos, água, peso, metas para o demo; e uma comunidade demo (dono, profissional, membros) para as fases seguintes.
- Pacote novo `e2e/` (workspace) com `@playwright/test` usando `executablePath` do Chromium pré-instalado:
  - `auth.setup.ts`: login real no Logto uma vez → `storageState`.
  - `screens.spec.ts`: percorre todas as rotas de `apps/web/src/app` em viewport mobile (390×844) e desktop (1440×900), salva screenshots em `e2e/screenshots/<etapa>/`.
  - Fluxos críticos: logar refeição, água, peso, passos, treino livre, metas.
  - Para mobile (Expo): screenshots via `expo start --web` no mesmo runner, onde suportado.
- Script `pnpm ui:snap <etapa>` gera o conjunto; **rodar antes de qualquer mudança de UI** ("00-baseline") e **após cada PR/etapa de UI** ("NN-<nome>"), comparando lado a lado (relatório HTML do Playwright). Screenshots ficam fora do git (artefato de CI), só os relatórios de comparação vão para a PR.
- Job novo opcional em `.github/workflows/ci.yml` (`e2e`, com Postgres + Logto em service).

## Fase 2 — Esqueci minha senha e conta

- Conector de e-mail no Logto (SMTP genérico ou Resend) via `logto-bootstrap.ts`; envs `EMAIL_*` em `.env.example`, `infra/docker-compose*.yml`, `infra/dokploy/README.md`.
- Templates de e-mail em PT-BR (verificação, reset, convite) com marca Fatia.
- Telas de login (web `(auth)/login/page.tsx`, mobile `app/login.tsx`): botões "Entrar", "Criar conta" (`interactionMode: 'signUp'`) e "Esqueci minha senha" (`firstScreen: 'reset_password'` / `identifier:...`), sem citar "Logto".
- Perfil (web+mobile): "Segurança" → trocar senha (Logto account center / Management API `PATCH users/:id/password` com verificação da senha atual em endpoint REST próprio), exportar dados e excluir conta também na web (hoje só mobile).
- Serviço de e-mail próprio na API (`apps/api/src/notifications/email.service.ts`) para convites de comunidade (Fase 5).
- Atualizar `docs/LOCAL_AUTH.md`.

## Fase 3 — Otimização de UI e usabilidade sem IA (web + mobile)

Cada item = 1 commit pequeno + `pnpm ui:snap` antes/depois.

**Bugs a corrigir primeiro**

- Refeição em data passada grava hoje: usar `instanteNoDia(date)` em `components/nutrition/food-search-drawer.tsx:107` (web) e `:111` (mobile).
- Adicionar exercício cria série fake `reps:1`: `exercise-search-drawer.tsx:52-56` (web) e `:59` (mobile) passam só a adicionar à sessão.
- Exclusão sem confirmação em `meal-timeline.tsx` (web).
- "Timeline de Hoje" fixo; placeholders de refeição somem após o 1º lançamento do tipo; sino morto em `top-bar.tsx`; saudação "Atleta" fixa.

**Registro rápido (o coração do Free)**

- Busca de alimento: **recentes e favoritos** (novo endpoint `GET /nutrition/foods/recent` derivado de `MealItem`; `FavoriteFood` model), **multi-adição** sem fechar o drawer, **medidas caseiras** (colher, unidade, fatia) além de gramas, último gramado sugerido.
- **Copiar refeição / copiar dia** e **refeições salvas (templates)** — service + REST + tool MCP.
- **Alimento personalizado na UI** (API já existe; criar `api-client` + form).
- **Leitor de código de barras na web** (BarcodeDetector/zxing) — mobile já tem.
- Água/peso/passos com **seletor de data** (prop `date` já existe em `log-steps-drawer.tsx`).
- **FAB "+" global** (refeição, água, peso, treino) no dashboard e na nav.
- **Onboarding** de 1ª execução: objetivo, dados corporais, cálculo TDEE → `UserGoals` sugerido.
- Metas acessíveis direto (hoje 3 níveis: Progresso → Perfil → Metas).

**Navegação e design**

- Nav por plano: Free → Dashboard, Nutrição, Treino, Comunidade, Perfil; Pago → aba Chat/IA no lugar acessível (FAB ou Dashboard). Mesma estrutura web e mobile (`bottom-nav.tsx` nos dois).
- Revisão de design system: tokens únicos, tipografia, estados vazios, skeletons, toasts de desfazer, acessibilidade (contraste, foco, `aria`, alvos ≥44px), desktop responsivo (hoje é mobile-first esticado).
- Reescrever `docs/DESIGN.md` com o sistema real; atualizar `docs/MOBILE_PARITY.md`.
- Ferramentas MCP equivalentes para cada função nova (regra MCP-first), mantendo o Free 100% utilizável por IA externa.

### Andamento da Fase 3 — concluída

Entregue em `feat/comunidades-planos`, cada etapa com `ui:snap` antes/depois (`e2e/screenshots/compare-*.html`):

- **Bugs:** refeição em dia passado, série fantasma no treino livre, exclusão sem confirmação, títulos e placeholders da timeline, saudação.
- **Registro rápido:** recentes e favoritos, vários itens por abertura, medidas caseiras, copiar refeição/dia e refeições salvas, alimento próprio, código de barras na web, dia do registro em água/peso/passos, "+" global (Registrar).
- **Onboarding com TDEE:** assistente de primeira vez (Mifflin-St Jeor), metas sugeridas e editáveis, "Recalcular com meus dados"; o PUT de metas passou a recusar min > max e valores absurdos.
- **Navegação:** barra **Início · Nutrição · + · Treino · Mais**, igual no PWA e no app (`navigation.ts`); menu "Mais" com todas as telas; barra lateral no desktop; metas a um toque do Início. Chat no menu só com IA disponível (vira o critério do plano Pago na Fase 4). A aba Comunidade entra na Fase 5.
- **Design e acessibilidade:** tokens de estado e de macros nas duas pontas (`cores.ts` no app, com teste), `Skeleton`/`EmptyState`/avisos, "Desfazer" para registros pequenos, alvos de 44 px, foco visível, rótulos, zoom liberado, drawers centralizados no desktop; `e2e/tests/a11y.spec.ts` (axe) verde nas 13 rotas, no menu e no Registrar, em celular e desktop. Sistema descrito em [`DESIGN.md`](./DESIGN.md).

**Auditoria MCP-first (118 tools):** cada função nova tem tool — `list_my_foods`, `set_food_favorite`, `create_food_portion`/`delete_food_portion`, `copy_meal`, `copy_day`, `list_meal_templates`/`save_meal_template`/`log_meal_template`/`delete_meal_template`, `list_custom_foods` (+ `portions` em `create_custom_food`), `suggest_nutrition_goals` e os campos de perfil em `update_me`; o dia do registro já existia em `log_water`/`log_steps`/`log_weight`. Ficam sem tool, de propósito: o **leitor de código de barras** (uma IA externa não lê código; a consulta continua em REST), a **navegação** e o **desfazer** (são da interface; pelo MCP, desfazer é registrar de novo).

**Fica para as próximas fases ou para aparelho:** checklist de aparelho em [`MOBILE_PARITY.md`](./MOBILE_PARITY.md) (o app nativo não roda neste ambiente); a API ainda aceita duas sessões de treino abertas (o "+" evita no cliente; uma trava no `start` muda plano, treino rápido e MCP e merece etapa própria); a data do mapa de intensidade da Progresso é calculada em UTC no servidor e diverge da do navegador à noite (aviso de hidratação no dev).

## Fase 4 — Plano Free/Pago e entitlements

**Schema** (`packages/db/prisma/schema.prisma`, migration nova):

- `enum PlanTier { FREE, PRO }`, `enum SubscriptionSource { ASAAS, APPLE, GOOGLE, GROUP_SEAT }`, `enum SubscriptionStatus { ACTIVE, PAST_DUE, CANCELED, EXPIRED }`.
- `UserSubscription` (userId, tier, source, status, providerRef, currentPeriodEnd, graceEndsAt) — índice `[userId, status]`.
- `BillingWebhookEvent` (provider, eventId único, payload, processedAt) para idempotência.
- `AiUsage` ganha `paidBy` (`USER | GROUP | FREE`) e `groupId?`.

**API**

- `billing/entitlements.port.ts` ganha `aiTierForUser(userId)` = máximo entre assinatura pessoal ativa e assento de grupo (Fase 5); `SubscriptionEntitlementsService` substitui o estático. Reusa `decideAiTier`.
- Gate em `chat.service.ts#converse/transcrever` e em `nutrition/meal-recognition.service.ts` (hoje sem cota): `assertAiEntitled` → 402 `AI_PLAN_REQUIRED` antes de `assertDentroDaCota`; limites de cota por tier em `ai-quota.ts`.
- `GET /me/entitlements` (tier, fonte, validade, cota) e `/chat/availability` com `allowed` + motivo.
- Checkout web: `POST /billing/checkout` (Asaas `/v3/subscriptions`, Pix/cartão — estender `asaas.provider.ts`), `POST /billing/webhooks/asaas` (raw body, `verifyWebhook`), `POST /billing/cancel`.
- Mobile: RevenueCat (`react-native-purchases`), `POST /billing/webhooks/revenuecat` mapeando para `UserSubscription`.
- Revisar `billing/__tests__/no-billing-in-student-surface.spec.ts`: continua proibindo vocabulário de cobrança em **tools MCP**, mas permite o `BillingController` próprio. Novo spec: rotas de IA hospedada exigem entitlement.

**UI**

- Paywall/upgrade (web e mobile) quando 402; seção "Meu plano" no perfil; ocultar chat/foto/ditado no Free com CTA; badge PRO.

## Fase 5 — Comunidades, convites, consentimento e assentos

**Schema**

- `Group` += `description`, `avatarUrl`, `timezone`, `visibility (PUBLIC|PRIVATE)`, `joinPolicy (OPEN|APPROVAL|INVITE_ONLY)`.
- `GroupInvite` (groupId, email?, token único hash, role, expiresAt, usedAt, createdById).
- `GroupMembership` += `statsOptIn`, `displayName?`, `consentScopes ShareScope[]` (registro do aceite).
- `GroupSeatPool` (groupId, seats, status, providerRef, currentPeriodEnd) e `GroupSeatAssignment` (poolId, membershipId único, assignedAt, revokedAt).
- `User` += `avatarUrl?`, `nickname?`.

**API (módulo `sharing/` + novo `community/`)**

- Rotas que faltam na matriz: `PATCH/DELETE /groups/:id` (`group.update/delete`), `POST/DELETE /groups/:id/invites` (`invite.create/revoke`), `POST /groups/invites/:token/accept` (SelfOnly), transferência de dono.
- Join com tela de consentimento: os escopos aceitos criam `ProfessionalLink` para cada membro da equipe com `canReceiveLink` (estender para OWNER/CREATOR conforme ADR 026, atualizando `PERMISSIONS.md` e `permission-matrix.spec.ts`). Revogar no app remove o acesso.
- Trocar `NoStatsParticipation` por implementação real sobre `statsOptIn`.
- Assentos: `POST /groups/:id/seats/checkout` (Asaas), atribuir/remover assento a membership (`billing.manage`), webhook; `aiTierForUser` considera assento ativo; inadimplência → `decideAiTier` rebaixa (sem bloquear app).
- E-mail de convite via `email.service.ts`; link `fatia.app/c/<token>` com deep link no mobile.
- MCP (membro): `list_my_groups` (já), `accept_group_invite`, `list_group_consents`; administração continua fora do MCP (decisão existente).

## Fase 6 — Dashboard web da academia/influencer

- Route group novo `apps/web/src/app/(org)/org/[groupId]/…` com layout desktop (sidebar), seletor de comunidade e verificação de papel (`GET /groups/:id` → role); reaproveita padrões de `(pro)/students`.
- Páginas: **Visão geral** (membros ativos, retenção, aderência, insights existentes), **Membros** (lista, status, assento IA, consentimento por escopo, aprovar/remover, detalhe individual via `student-view.service.ts` só com link ativo), **Convites** (gerar link, enviar por e-mail, CSV em lote, revogar), **Assentos e cobrança** (comprar/ajustar, atribuir, faturas), **Planos e dicas** (Fase 7), **Desafios** e **Moderação** (Fase 8), **Configurações** (perfil da comunidade, equipe e papéis).
- `packages/api-client`: `groupsApi`, `invitesApi`, `seatsApi`, `insightsApi`, `contentApi`, `socialApi`.
- Login: mesmo Logto; a web detecta papel de equipe e oferece "Painel da comunidade". (Opcional: subdomínio `painel.` apontando para o mesmo app.)

## Fase 7 — Planos prontos e dicas

- Schema do PR #243: `PlanTemplate` (snapshot Json, autor), `PlanTemplatePublication` (template ↔ grupo), `WorkoutPlan.fromTemplateId`; + `NutritionPlanTemplate` (metas de kcal/macros + refeições sugeridas) e `GroupTip` (título, corpo markdown, imagem?, categoria, publishedAt, pinned).
- Service reusa `plan-materializer.service.ts` (cópia no aceite). REST de CRUD para a equipe (`content.publish`), REST + MCP para o membro: `list_group_plans`, `adopt_group_plan`, `list_group_tips`.
- UI: editor no dashboard (reusa componentes de plano de `workout/plans`); no app, aba Comunidade → Planos/Dicas com "Adotar".

## Fase 8 — Gamificação e timeline moderada

**Desafios**

- Schema do PR #244 + métricas novas da ADR 027: `ChallengeMetric { WORKOUT_SESSIONS, STEPS, WATER_ML, ACTIVE_DAYS, KCAL_IN_RANGE_DAYS, PROTEIN_TARGET_DAYS, STREAK_DAYS }`.
- `social.module.ts` (hoje não existe) registrando `scoreboard.service.ts`; `challenge.service.ts` computa score a partir de `nutrition summary` vs `UserGoals` (só booleano por dia); recálculo agendado (`@nestjs/schedule`) + on-write.
- Ajustar `no-body-comparison.spec.ts` para permitir só métricas de aderência e manter `no-inference-cost.spec.ts`.
- Ranking só para participantes (opt-in), apelido, medalhas → integra `achievement-catalog.ts` (conquistas de comunidade).
- Equipe cria/encerra desafios no dashboard; membro entra/sai e vê ranking no app; MCP `list_group_challenges`, `join_group_challenge`, `get_challenge_leaderboard`.

**Timeline**

- `GroupPost` (texto, imagens[], autor, `removedAt/removedById`, pinned), `GroupPostReaction`, `GroupPostComment`, `GroupPostReport`.
- Storage (ADR 028): `apps/api/src/storage/` com S3 SDK (R2 em prod, MinIO no compose local), upload via URL pré-assinada, `sharp` para strip de EXIF + resize, exclusão em cascata com conta (`delete_my_account`) e com post.
- Moderação: equipe (`content.moderate`) remove/fixa posts, trata denúncias, bane membro; política de quem pode postar (todos/só equipe) por comunidade. Removido continua visível ao autor.
- UI no app (web+mobile): aba Comunidade com Feed, Desafios, Planos/Dicas; no dashboard, fila de moderação.
- Notificações: registrar Expo push token (`UserDevice`), `notifications/push.service.ts`; eventos: convite, desafio novo/encerrado, ranking, resposta a post, post removido.

## Ordem de entrega sugerida (PRs pequenas, todas em `feat/comunidades-planos` ou sub-branches dela)

0 → 1 → 2 → 3 (UI/UX em várias PRs, a mais longa) → 4 → 5 → 6 → 7 → 8. As Fases 2 e 3 já entregam valor ao Free sem depender de cobrança.

## Verificação

- Por fase: `pnpm lint && pnpm typecheck && pnpm --filter @fatia/api test` (Postgres de teste), `pnpm --filter @fatia/web test`, `@fatia/mobile test`, `@fatia/api-client test`; agente Python inalterado salvo gate.
- Testes obrigatórios novos: isolamento (`user-isolation.spec.ts` estendido para posts, convites, assentos, templates), `permission-matrix.spec.ts` com novas rotas, `tool-catalog.spec.ts`/`tool-user-scoping.spec.ts` para tools novas, entitlement (Free recebe 402 no chat/foto/ditado; PRO e assento passam; inadimplência rebaixa), webhooks idempotentes (evento repetido não duplica), score de aderência sem vazar valor bruto, strip de EXIF.
- Playwright: `pnpm ui:snap 00-baseline` antes da Fase 3 e `pnpm ui:snap NN-<etapa>` após cada mudança de UI, relatório comparativo anexado à PR; fluxos E2E (login, esqueci a senha até a tela de código, registrar refeição em data passada, copiar dia, entrar em comunidade por convite com consentimento, postar com imagem, moderar, entrar em desafio).
- Reset de senha manual: no compose local com MinIO/MailHog (SMTP de teste), solicitar reset do demo e concluir pelo e-mail capturado.
- Billing: `pnpm billing:dry-run`, sandbox Asaas e RevenueCat sandbox.
- MCP: `pnpm mcp:smoke` com as tools novas.
