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

### Andamento da Fase 4 — concluída

Decisões com o usuário: PRO a **R$ 19,90/mês ou R$ 179/ano**; o Free **sem** IA hospedada; no app,
**RevenueCat completo**. O desenho final está na atualização da
[ADR 024](./ADR/024-plano-free-e-pago-do-usuario.md) e o operacional em
[`BILLING.md`](./BILLING.md#plano-pro-do-usuário-adr-024).

- [x] **Schema:** `UserSubscription` (origens `ASAAS`/`APPLE`/`GOOGLE`/`MANUAL`, status com
      `PENDING`), `BillingWebhookEvent` idempotente, `User.asaasCustomerId`, `AiUsage.paidBy`/`groupId`;
      assinatura no export LGPD.
- [x] **Direito e portão:** `resolverDireitoIa` (função pura, carência de 7 dias, sem job),
      `AiEntitlements` e `AiAccessService` em `ai/` → 402 `AI_PLAN_REQUIRED` antes da cota no chat,
      ditado e foto (a foto passou a registrar uso). `AI_REQUIRES_PLAN=false` libera a IA no
      self-host. Guarda estático `hosted-ai-requires-plan.spec.ts`.
- [x] **Web/Asaas:** checkout com CPF não gravado, link reaproveitado, troca de intervalo,
      cancelamento ao fim do período, webhook com corpo cru e idempotência; `billing:grant-pro`.
- [x] **App/RevenueCat:** webhook autenticado em tempo constante e sync pela REST (fonte da
      verdade); `POST /billing/revenuecat/sync` depois da compra.
- [x] **Conta:** apagar a conta cancela a recorrência do Asaas antes (`ACCOUNT_DELETION_HOOKS`).
- [x] **UI:** "Meu plano" na web e no app, selo FREE/PRO, cadeado no chat e na foto, upsell no chat,
      402 tratado; Termos e Privacidade reescritos.
- [x] **MCP inalterado** (118 tools, sem vocabulário de cobrança).

**Não exercitado aqui:** o sandbox do Asaas e a compra nas lojas (precisam das chaves do dono, de
dev build e de contas de teste). Os roteiros estão no `BILLING.md`.

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

### Andamento da Fase 5 — concluída

Decisões com o usuário: assento a **R$ 14,90/mês**, sem mínimo; **aumento vale na hora** com
cobrança proporcional e **redução na renovação**; nesta fase só **API e telas do membro** (as do
dono são a Fase 6); navegação **C sem Início** com barra de topo estilo iOS. Desenho nas
[ADR 025](./ADR/025-assentos-de-ia-por-comunidade.md) e
[ADR 026](./ADR/026-consentimento-ao-entrar-na-comunidade.md); operacional em
[`BILLING.md`](./BILLING.md#assentos-de-comunidade-adr-025).

- [x] **Navegação:** Nutrição · Treino · [+] · Comunidade · Mais, e a barra de topo com voltar
      hierárquico (`ROUTES`/`routeInfo`) em todas as telas, web e app.
- [x] **Schema:** `joinPolicy`, `visibility`, consentimento na associação, `GroupInvite` (só o hash
      do token), `GroupSeatPool`/`Assignment`/`Adjustment`; tudo no export LGPD.
- [x] **Comunidade na API:** consentimento à equipe (dono, profissionais e criadores) por categoria,
      nos dois sentidos; entrada por código conforme a regra; convites por link e por e-mail
      (`nodemailer`, `MAIL_SMTP_URL`); transferir, editar e apagar; estatísticas com opt-in real.
- [x] **MCP (118 → 121):** `get_group_invite`, `accept_group_invite`, `set_group_sharing`;
      administração continua fora do MCP.
- [x] **Assentos:** checkout, aumento proporcional, redução na renovação, atribuição, webhook nas três
      tabelas, fonte `GROUP` no direito e `paidBy = GROUP`; `billing:grant-seat`.
- [x] **Telas do membro (web e app):** `/c/<token>` (sem login, volta ao link depois do login e do
      assistente), minhas comunidades, entrar com código, detalhe (equipe, o que compartilho, quem
      acessou, assento, sair), "PRO pela comunidade" no plano, "Membros" para a equipe, Privacidade e
      Termos; links universais por env.
- [x] **E2E e fotos:** Academia Demo no seed e conta da equipe no bootstrap, `community:invite`,
      fluxos de link, e-mail (Mailpit só lido), código e assento; `ui:snap 30-comunidade`.
- [x] **Correções que a fase expôs:** o primeiro acesso em paralelo gravava a conta com e-mail
      provisório; o expurgo do e-mail do convite só rodava quando alguém criava outro convite; o
      compose de produção não repassava as envs de cobrança, e-mail e `LOGTO_M2M_*`.

**Não exercitado aqui:** o sandbox do Asaas para assentos, os links universais (precisam de
`APPLE_TEAM_ID`, `ANDROID_CERT_SHA256` e build assinado) e o app em aparelho.

## Fase 6 — Dashboard web da academia/influencer

- Route group novo `apps/web/src/app/(org)/org/[groupId]/…` com layout desktop (sidebar), seletor de comunidade e verificação de papel (`GET /groups/:id` → role); reaproveita padrões de `(pro)/students`.
- Páginas: **Visão geral** (membros ativos, retenção, aderência, insights existentes), **Membros** (lista, status, assento IA, consentimento por escopo, aprovar/remover, detalhe individual via `student-view.service.ts` só com link ativo), **Convites** (gerar link, enviar por e-mail, CSV em lote, revogar), **Assentos e cobrança** (comprar/ajustar, atribuir, faturas), **Planos e dicas** (Fase 7), **Desafios** e **Moderação** (Fase 8), **Configurações** (perfil da comunidade, equipe e papéis).
- `packages/api-client`: `groupsApi`, `invitesApi`, `seatsApi`, `insightsApi`, `contentApi`, `socialApi`.
- Login: mesmo Logto; a web detecta papel de equipe e oferece "Painel da comunidade". (Opcional: subdomínio `painel.` apontando para o mesmo app.)

### Andamento da Fase 6 — concluída

Decisões com o usuário: o painel é do **dono e do profissional** (cada um vê as seções do seu papel);
fecham-se nesta fase **mudar papel, convite em lote, histórico de faturas e o aviso do add-on**;
"Criar comunidade" nasce em Minhas comunidades; e o painel existe **também no app**, pensando no
instrutor que quase não usa computador no trabalho. Planos e dicas (Fase 7), desafios e moderação
(Fase 8) ficam para as próximas.

- [x] **API:** `PATCH /groups/:id/members/:membershipId` (ação `member.role`, só o dono, vínculos no
      mesmo commit, ADR 026); `POST /groups/:id/invites/batch` (até 50, teto do dia contando o lote
      inteiro, pulados com o motivo); a lista de membros mostra à equipe o que cada um compartilha com
      quem pergunta e o assento; o profissional mexe só em convites de membro;
      `GET /groups/:id/insights/panels`; `GroupSeatInvoice` alimentada pelo webhook e
      `GET /groups/:id/seats/invoices`.
- [x] **api-client:** `orgApi`, `seatsApi`, `insightsApi` e as regras comuns do painel
      (`community-panel.ts`); rotas `/org/:id/…` e `/community/new` no mapa, com `:param` no "voltar".
- [x] **Web:** `/org/<id>` com barra lateral no desktop e abas no celular — visão geral (números,
      retenção e comportamento com o add-on), membros (aprovar, recusar, papel, assento, remover, ver
      dados), convites (link, e-mail, lote por colar ou `.csv`), assentos (comprar, ajustar, cancelar,
      faturas) e configurações (perfil, código, transferir, apagar); criar comunidade; "Abrir painel"
      no detalhe da comunidade.
- [x] **App:** as mesmas seções, com `Share` nativo e `Alert`; assentos sem compra (regra das lojas).
- [x] **E2E e fotos:** sessão da equipe no `auth.setup`, Academia Demo com pedidos, treinos e
      assentos de cortesia no seed, `panel.spec` (aprovar, recusar, papel, assento, convite, lote,
      criar e apagar), axe no painel; `ui:snap 32-painel`.

**Não exercitado aqui:** compra real de assentos e faturas no sandbox do Asaas (os testes usam um
provedor falso e o pool de cortesia), e o painel no app em aparelho.

## Fase 7 — Conteúdo da comunidade

Ampliada em 17/10/2026: além de planos prontos e dicas, a comunidade terá **o próprio catálogo de
exercícios** (só os aparelhos que a academia tem, com fotos, vídeos e dicas dela; o influencer com
os tutoriais que gravou) e **o próprio agente** (nome, avatar e instruções). Três entregas:

- **7a — Armazenamento, planos prontos e dicas.**
- **7b — Catálogo de exercícios da comunidade:** `Exercise.groupId`, equipamentos da academia,
  fotos e vídeo enviados ao R2, "comunidade primeiro" na busca e filtro "Na minha academia", o
  tutorial da comunidade no lugar do vídeo padrão, `plan-snapshot` com exercício da comunidade.
- **7c — Agente da comunidade:** `GroupAgent` (nome, avatar, instruções cercadas abaixo das regras
  de segurança), escolha do agente no chat (padrão: a comunidade do assento), evals de injeção.

Decisões do usuário: vídeo por **upload direto no R2** (não link do YouTube); a pessoa **escolhe o
agente no chat**; no catálogo, **a comunidade aparece primeiro**, com filtro, e o catálogo geral
continua acessível.

### Andamento da Fase 7a — concluída

- [x] **Mídia (ADR 028 aceita):** bucket S3 privado (R2 em produção, SeaweedFS no dev), envio direto
      por URL assinada com tipo e tamanho na assinatura, `sharp` sem EXIF/GPS em WebP, leitura só
      assinada (10 min), faxina de 24 h, exclusão com o item, a comunidade e a conta; avatar da
      comunidade; envs `MEDIA_S3_*`.
- [x] **API:** `GroupPlanTemplate` (treino e nutrição), `GroupTip`, `fromTemplateId`;
      `content.publish` inclui o dono e `content.read` abre para todos; adoção pelo
      `PlanMaterializerService`, uma vez por treino, metas só com `applyGoals`; tools
      `list_group_plans`, `adopt_group_plan`, `list_group_tips` (124 tools); export LGPD.
- [x] **api-client, web e app:** seção "Planos e dicas" no painel (editor de treino a partir de um
      plano seu, de nutrição com metas e refeições salvas, de dica com prévia do markdown e imagem),
      vitrine do membro com "Adotar", avatar; markdown por tokens, nunca HTML.
- [x] **E2E e fotos:** seed com planos e dicas, `content.spec` (dica com imagem real, publicar,
      adotar), fotos 88, 89 e 92–95, axe; `ui:snap 34-conteudo`.

**Não exercitado aqui:** o R2 de produção (o dev usa SeaweedFS) e o envio de imagem no app em
aparelho. **Pendente:** cópia do bucket no `infra/backup.sh`.

### Andamento da Fase 7b — concluída

- [x] **API (ADR 030):** `Exercise.groupOwned` + `groupId`, `GroupExerciseGuide` (vídeo, até 4 fotos,
      dicas) por cima de qualquer exercício, `Group.equipment`; helper único de acesso a exercício;
      busca com a comunidade primeiro e `onlyMyGym`; vídeo conferido pela caixa `ftyp`; snapshot com
      `source: 'group'`; exercício em uso sai da comunidade sem virar catálogo público; `CHECK` no
      banco. Corrige `addExercise`, que aceitava o exercício pessoal de outra pessoa (#92).
- [x] **api-client, web e app:** seção "Exercícios" no painel (equipamento, exercício da casa,
      tutorial do catálogo, vídeo com progresso), tutorial no detalhe do exercício no lugar do
      YouTube, "Na minha academia" nos seletores, aba "Exercícios" para o membro.
- [x] **E2E e fotos:** seed com equipamento, exercício da casa e tutorial; `exercises.spec` (vídeo
      real no bucket, tutorial assinado, filtro); fotos 96–99, axe; `ui:snap 36-catalogo`.

**Fora desta entrega:** gravar vídeo pela câmera do Fatia (pede microfone e build nativo; o app
escolhe da galeria) e player dentro do app (abre no navegador do sistema). **Não exercitado aqui:**
vídeo enviado de aparelho de verdade e o R2 de produção.

### Andamento da Fase 7c — concluída

- [x] **API (ADR 031):** `GroupAgent` (nome, avatar, orientações, ligado) configurado pelo dono;
      `GET /chat/agents` com o agente da comunidade do assento como padrão; a escolha gravada na
      conversa nova (`Conversation.agentGroupId`) e a persona conferida a cada turno.
- [x] **Agente Python:** `persona` no `/chat`, depois das regras fixas, com as orientações cercadas;
      quatro casos `persona-*` no benchmark (12 de 12 com `glm-5.3-flash`).
- [x] **api-client, web e app:** seção "Agente" no painel (só o dono, web e app); no chat da web, a
      escolha na conversa nova e o nome e o avatar do agente no topo e acima das respostas.
- [x] **E2E e fotos:** seed com o "Treinador Demo"; `agent.spec` (o dono liga, o membro escolhe, o
      dono desliga e ele some); fotos 100–101, axe; `ui:snap 38-agente`.

**Fora desta entrega:** chat no app (continua só na web) e trocar de agente no meio de uma conversa
(começa-se outra).

## Fase 8 — Gamificação e timeline moderada

**Desafios**

- Schema do PR #244 + métricas novas da ADR 027: `ChallengeMetric { WORKOUT_SESSIONS, STEPS, WATER_ML, ACTIVE_DAYS, KCAL_IN_RANGE_DAYS, PROTEIN_TARGET_DAYS, STREAK_DAYS }`.
- `social.module.ts` (hoje não existe) registrando `scoreboard.service.ts`; `challenge.service.ts` computa score a partir de `nutrition summary` vs `UserGoals` (só booleano por dia); recálculo agendado (`@nestjs/schedule`) + on-write.
- Ajustar `no-body-comparison.spec.ts` para permitir só métricas de aderência e manter `no-inference-cost.spec.ts`.
- Ranking só para participantes (opt-in), apelido, medalhas → integra `achievement-catalog.ts` (conquistas de comunidade).
- Equipe cria/encerra desafios no dashboard; membro entra/sai e vê ranking no app; MCP `list_group_challenges`, `join_group_challenge`, `get_challenge_leaderboard`.

### Andamento da Fase 8a — desafios, concluída

- [x] **API (ADR 027 aceita):** `GroupChallenge` e participações com apelido; sete métricas, as
      três de nutrição como dias na própria meta (`nutrition/daily-adherence`, só datas); ranking
      só para quem participa; recálculo na leitura e encerramento de hora em hora com claim
      atômico (sem `@nestjs/schedule`); medalhas e as conquistas `challenge_finished` e
      `challenge_podium`; MCP `list_group_challenges`, `get_challenge_leaderboard` e
      `join_group_challenge` (127 tools); export LGPD.
- [x] **api-client, web e app:** seção "Desafios" no painel (dono e profissional) e, para o
      membro, prévia na comunidade, lista e detalhe com ranking; no app, início e duração prontos.
- [x] **E2E e fotos:** seed com dois desafios; `challenges.spec` (a dona marca, o membro entra,
      se vê no ranking e sai, a dona encerra); fotos 102–106, axe; `ui:snap 40-desafios`.

**Fora desta entrega:** a 8b (timeline moderada) e a 8c (notificações push). "Aba Comunidade com
Feed, Desafios, Planos/Dicas" fica para a 8b, quando o feed existir.

### Andamento da Fase 8b — mural moderado, concluída

- [x] **API (ADR 032):** `GroupPost` com autor pela associação e apelido da comunidade, até 4
      imagens (`post_image`, só da própria pessoa), reações (uma por pessoa), comentários e
      denúncias; `Group.postPolicy` (todos ou só a equipe, conferido também no envio da imagem);
      moderação (`content.moderate`: remover, restaurar, fixar até 3, fila de denúncias sem quem
      denunciou); banimento (`member.ban`, só o dono; `BANNED` barra código e convite); MCP
      `list_group_posts`, `create_group_post` e `comment_on_group_post` (130 tools); export LGPD.
- [x] **api-client, web e app:** abas da comunidade (Início, Mural, Desafios, Planos e dicas),
      o mural e a seção "Moderação" do painel (só o dono).
- [x] **E2E e fotos:** seed com o mural; `feed.spec` (o membro publica com imagem, comenta e
      denuncia; a dona remove, trata a fila e restaura); fotos 107–110, axe;
      `ui:snap 42-timeline`.

**Fora desta entrega:** a 8c (notificações push), inclusive o aviso de resposta e de post
removido.

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
