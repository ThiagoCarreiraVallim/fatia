# Paridade entre o app nativo e o PWA

> Entregável da issue #130, última sub-issue da épica [#132](https://github.com/ThiagoCarreiraVallim/fatia/issues/132).
>
> Existe porque paridade é fácil de **achar** que se tem e difícil de provar. Uma
> linha vazia aqui é uma pendência silenciosa, que é o que este documento serve
> para impedir.

**Alvo:** o estado da `main` no momento da abertura da épica — 18 rotas e 57
componentes em `apps/web`. Paridade significa: qualquer coisa que a pessoa faz
hoje em `app.fat.ia.br`, ela faz no app nativo.

**Estado:** 17 de 17 rotas de aplicação replicadas, 3 fora de propósito.
Nenhum placeholder restante no código.

## Legenda

|     |                                          |
| --- | ---------------------------------------- |
| ✅  | replicado                                |
| ➕  | existe no mobile e **não** existe no PWA |
| ⛔  | fora de propósito, com motivo registrado |

---

## Rotas

| PWA                                | App nativo                                           |     | Observação                                                                  |
| ---------------------------------- | ---------------------------------------------------- | :-: | --------------------------------------------------------------------------- |
| `(app)/page.tsx`                   | `app/(app)/index.tsx`                                | ✅  | dashboard                                                                   |
| `(app)/community`                  | `app/(app)/community/index.tsx`                      | ✅  | minhas comunidades + "Entrar com código" (drawer)                           |
| `(app)/community/[groupId]`        | `app/(app)/community/[groupId].tsx`                  | ✅  | equipe, o que compartilho, quem acessou, assento, sair (`Alert`)            |
| `(invite)/c/[token]`               | `app/c/[token].tsx`                                  | ✅  | fora do `(app)`; deslogado guarda o token no cofre e retoma depois do login |
| `(app)/community/new`              | `app/(app)/community/new.tsx`                        | ✅  | criar comunidade; leva aos convites do painel                               |
| `(org)/org/[groupId]`              | `app/(app)/org/[groupId]/index.tsx`                  | ✅  | painel: visão geral e retenção agregada (dono)                              |
| `(org)/org/[groupId]/members`      | `app/(app)/org/[groupId]/members/index.tsx`          | ✅  | aprovar, recusar; "Gerenciar" (`Alert`) muda papel, assento e remove        |
| `(org)/…/members/[membershipId]`   | `app/(app)/org/[groupId]/members/[membershipId].tsx` | ✅  | leitura por categoria do que o membro compartilha                           |
| `(org)/org/[groupId]/invites`      | `app/(app)/org/[groupId]/invites.tsx`                | ✅  | link com `Share` nativo; e-mail; lote colado (sem `.csv`)                   |
| `(org)/org/[groupId]/seats`        | `app/(app)/org/[groupId]/seats.tsx`                  | ⚠️  | ver, tirar e faturas; compra, quantidade e cancelar só na web, ver abaixo   |
| `(org)/org/[groupId]/settings`     | `app/(app)/org/[groupId]/settings.tsx`               | ✅  | perfil, código (`Share`), transferir e apagar digitando o nome              |
| `(app)/goals`                      | `app/(app)/goals.tsx`                                | ✅  |                                                                             |
| `(app)/nutrition`                  | `app/(app)/nutrition/index.tsx`                      | ✅  |                                                                             |
| `(app)/nutrition/foods`            | `app/(app)/nutrition/foods.tsx`                      | ✅  | Meus alimentos; `?novo=1` abre o cadastro (card vazio e scanner)            |
| `(app)/nutrition/goals`            | `app/(app)/nutrition/goals.tsx`                      | ✅  |                                                                             |
| `(app)/nutrition/nutrient-targets` | `app/(app)/nutrition/nutrient-targets.tsx`           | ✅  |                                                                             |
| —                                  | `app/(app)/nutrition/scan.tsx`                       | ➕  | scanner de código de barras (#140); no PWA o leitor mora no drawer de busca |
| —                                  | `app/(app)/nutrition/photo.tsx`                      | ➕  | registro por foto (#139); o PWA não tem, ver abaixo                         |
| `(app)/plan`                       | `app/(app)/plan.tsx`                                 | ⚠️  | Meu plano (ADR 024); o app vende só pela loja (RevenueCat), ver abaixo      |
| `(app)/profile`                    | `app/(app)/profile/index.tsx`                        | ✅  |                                                                             |
| `(app)/profile/connect`            | `app/(app)/profile/tokens.tsx`                       | ⚠️  | o PWA virou fluxo guiado (#164); o nativo ainda é a tela antiga, ver abaixo |
| `(app)/progress`                   | `app/(app)/progress/index.tsx`                       | ✅  |                                                                             |
| `(app)/progress/records`           | `app/(app)/progress/records.tsx`                     | ✅  |                                                                             |
| `(app)/workout`                    | `app/(app)/workout/index.tsx`                        | ✅  | a sessão ativa vira aviso com "Continuar treino" em vez de tomar a tela     |
| `(app)/workout/history`            | `app/(app)/workout/history.tsx`                      | ✅  |                                                                             |
| `(app)/workout/plans`              | `app/(app)/workout/plans/index.tsx`                  | ✅  |                                                                             |
| `(app)/workout/plans/[id]`         | `app/(app)/workout/plans/[id].tsx`                   | ✅  |                                                                             |
| `(app)/workout/quick/[templateId]` | `app/(app)/workout/quick/[templateId].tsx`           | ✅  |                                                                             |
| `(app)/workout/session/[id]`       | `app/(app)/workout/session/[id].tsx`                 | ✅  | uma rota para sessão ativa e concluída — o treino termina durante a visita  |
| `(auth)/login`                     | `app/login.tsx`                                      | ✅  | navegador do sistema em vez de redirect no servidor                         |
| `(onboarding)/onboarding`          | `app/onboarding.tsx`                                 | ✅  | assistente de primeira vez; nascimento digitado com máscara DD/MM/AAAA      |
| `(public)/privacy`                 | —                                                    | ⛔  | abre no navegador; ver "Fora de propósito"                                  |
| `(public)/terms`                   | —                                                    | ⛔  | idem                                                                        |

---

## Pendência aberta — conectar a IA no app nativo

A #164 reescreveu o fluxo do PWA: `(app)/profile/tokens` virou `(app)/profile/connect`, com passo
a passo sem jargão, endereço montado de `NEXT_PUBLIC_API_URL` e diagnóstico dos três erros comuns.

O nativo continua em `app/(app)/profile/tokens.tsx`, com o texto antigo — "Adicionar servidor MCP",
"login Logto". Ele **não** tem o defeito que motivou a issue (usa `env.mcpUrl`, não um domínio de
exemplo), então é divergência de linguagem, não instrução quebrada. `src/components/profile/mcp-section.tsx`
está no mesmo caso.

Alinhar os dois textos é trabalho de paridade e sai em issue própria: manter aqui uma linha ✅ que
esconde a diferença é exatamente o que este documento existe para impedir.

---

## Componentes

### Dashboard — 5 de 5

| PWA                    | App nativo                       |     | Observação                                                   |
| ---------------------- | -------------------------------- | :-: | ------------------------------------------------------------ |
| `next-workout-card`    | `dashboard/next-workout-card`    | ✅  |                                                              |
| `nutrition-macro-card` | `dashboard/nutrition-macro-card` | ✅  | gradiente vira véu chapado (sem `expo-linear-gradient`)      |
| `steps-card`           | `dashboard/steps-card`           | ✅  |                                                              |
| `streak-card`          | `dashboard/streak-card`          | ✅  | textos vêm do `@fatia/api-client` para os dois dizerem igual |
| `water-card`           | `dashboard/water-card`           | ✅  | erro do atalho é exibido; no PWA some                        |
| —                      | `dashboard/macro-bar`            | ➕  | o alvo aqui é único, não faixa mín–máx como em nutrição      |

### Nutrição — 19 de 19, mais 1 do scanner

| PWA                     | App nativo                           |     | Observação                                                                                                                                                                                                                                                                      |
| ----------------------- | ------------------------------------ | :-: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `calories-ring-card`    | `nutrition/calories-ring-card`       | ✅  | anel em `react-native-svg`                                                                                                                                                                                                                                                      |
| `copy-day-drawer`       | `nutrition/copiar-dia-drawer`        | ✅  | copiar o dia inteiro; mesmo texto de resultado (`copyDayText`)                                                                                                                                                                                                                  |
| `copy-to-day`           | `nutrition/copiar-para-dia`          | ✅  | dia de destino nas setas ◀ ▶ em vez de `<input type="date">`: o app não carrega date picker                                                                                                                                                                                     |
| `custom-food-drawer`    | `nutrition/alimento-drawer`          | ✅  | novo e edição; apagar confirma por `Alert` em vez do `ConfirmDialog`                                                                                                                                                                                                            |
| `custom-food-form`      | `nutrition/formulario-de-alimento`   | ✅  | por porção ou por 100 g; a conta e os limites são os de `@fatia/api-client/custom-food`                                                                                                                                                                                         |
| `custom-foods-card`     | `nutrition/meus-alimentos-card`      | ✅  |                                                                                                                                                                                                                                                                                 |
| `date-navigator`        | `nutrition/date-navigator`           | ✅  | data em estado, não na URL — senão o voltar do Android percorreria o calendário                                                                                                                                                                                                 |
| `edit-meal-item-drawer` | `nutrition/edit-meal-item-drawer`    | ✅  | gramas ou medida caseira (`seletor-de-quantidade`, réplica de `amount-picker`); item livre só em gramas                                                                                                                                                                         |
| `food-search-drawer`    | `nutrition/food-search-drawer`       | ✅  | replica o que o teste do web documenta (debounce, formulário manual, 2+ caracteres, favoritos/recentes, vários itens por abertura, medidas caseiras, refeições salvas, criar alimento pela busca vazia); a lógica comum está em `@fatia/api-client/food-shortcuts` e `portions` |
| `macro-bar`             | `nutrition/macro-bar`                | ✅  |                                                                                                                                                                                                                                                                                 |
| `macro-bento-grid`      | `nutrition/macro-bento-grid`         | ✅  |                                                                                                                                                                                                                                                                                 |
| `meal-actions-drawer`   | `nutrition/acoes-da-refeicao-drawer` | ✅  | copiar refeição e salvar como refeição salva; drawer e não `Alert` (no Android, só 3 botões)                                                                                                                                                                                    |
| `meal-list`             | `nutrition/meal-list`                | ✅  | portado; nenhuma rota usa, igual ao web                                                                                                                                                                                                                                         |
| `meal-timeline`         | `nutrition/meal-timeline`            | ✅  |                                                                                                                                                                                                                                                                                 |
| `nutrient-targets-card` | `nutrition/nutrient-targets-card`    | ✅  |                                                                                                                                                                                                                                                                                 |
| `weekly-trend-chart`    | `nutrition/weekly-trend-chart`       | ✅  | barras em `react-native-svg`                                                                                                                                                                                                                                                    |
| `barcode-scanner`       | `nutrition/barcode-camera`           | ✅  | `expo-camera` no app; no PWA, `BarcodeDetector` nativo ou `@zxing/browser` (Safari, Firefox, Chrome desktop), com o campo "Digitar o código" sempre à mão                                                                                                                       |
| `scanned-product-panel` | `nutrition/scanned-product-drawer`   | ✅  | produto do Open Food Facts + atribuição ODbL na própria tela (ADR 017) e "Guardar em Meus alimentos"; checkbox no PWA, `Pressable` com papel de checkbox no app                                                                                                                 |
| `barcode-flow`          | `app/(app)/nutrition/scan.tsx`       | ✅  | no PWA é um modo do drawer de busca; no app é tela (câmera inteira), aberta pelo cabeçalho da Nutrição ou pelo botão do drawer                                                                                                                                                  |
| —                       | `nutrition/barcode`                  | ➕  | só os formatos do `expo-camera`; a lógica pura (trava, porção, ficha incompleta, guardar) é comum em `@fatia/api-client` (`barcode.ts`)                                                                                                                                         |

### Treino — 14 de 14

| PWA                      | App nativo                              |     | Observação                                                                   |
| ------------------------ | --------------------------------------- | :-: | ---------------------------------------------------------------------------- |
| `add-exercise-drawer`    | `workout/add-exercise-drawer`           | ✅  |                                                                              |
| `block-timeline`         | `workout/block-timeline`                | ✅  | bloco de periodização (#145); a frase explicativa vem pronta da API          |
| `exercise-detail-card`   | `workout/exercise-detail-card`          | ✅  | aceita `renderSet` para receber a linha editável da sessão                   |
| `exercise-detail-drawer` | `workout/exercise-detail-drawer`        | ✅  |                                                                              |
| `exercise-edit-drawer`   | `workout/exercise-edit-drawer`          | ✅  |                                                                              |
| `exercise-search-drawer` | `workout/exercise-search-drawer`        | ✅  |                                                                              |
| `muscle-diagram`         | `workout/muscle-diagram`                | ✅  | 206 traços com `id` e `data-muscle` preservados                              |
| `active-exercise-card`   | `workout/session/active-exercise-card`  | ✅  |                                                                              |
| `active-cardio-card`     | `workout/session/active-cardio-card`    | ✅  |                                                                              |
| `set-row`                | `workout/session/set-row`               | ✅  |                                                                              |
| `rpe-badge`              | `workout/session/rpe-badge`             | ✅  |                                                                              |
| `rpe-modal`              | `workout/session/rpe-drawer`            | ✅  | virou drawer: cinco opções com emoji não cabem num `Alert`                   |
| `finish-session-modal`   | `workout/session/finish-session-drawer` | ✅  | virou drawer: tem campo de observações, e `Alert` com input só existe no iOS |
| `cancel-session-modal`   | `workout/session/use-cancel-session`    | ✅  | virou `Alert` do sistema: pergunta sim/não destrutiva                        |
| —                        | `workout/exercise-detail-host`          | ➕  | hospeda o drawer de detalhe fora do card (ver "O que o React Native impôs")  |
| —                        | `workout/session/rest-timer`            | ➕  | cronômetro de descanso                                                       |
| —                        | `workout/session/session-header`        | ➕  | header fixo com "X/Y exercícios"                                             |

### Progresso — 13 de 13

| PWA                              | App nativo                        |     | Observação                                         |
| -------------------------------- | --------------------------------- | :-: | -------------------------------------------------- |
| `cardio-chart`                   | `progress/cardio-chart`           | ✅  |                                                    |
| `consistency-card`               | `progress/consistency-card`       | ✅  |                                                    |
| `exercise-picker-drawer`         | `progress/exercise-picker-drawer` | ✅  |                                                    |
| `log-steps-drawer`               | `progress/log-steps-drawer`       | ✅  | editar e apagar nos dois (#116); dia do registro   |
| `log-water-drawer`               | `progress/log-water-drawer`       | ✅  | idem                                               |
| `log-weight-drawer`              | `progress/log-weight-drawer`      | ✅  | idem                                               |
| `personal-records`               | `progress/personal-records`       | ✅  |                                                    |
| `steps-chart`                    | `progress/steps-chart`            | ✅  |                                                    |
| `strength-chart`                 | `progress/strength-chart`         | ✅  |                                                    |
| `training-intensity`             | `progress/training-intensity`     | ✅  |                                                    |
| `weight-chart`                   | `progress/weight-chart`           | ✅  |                                                    |
| `WeightBarMini` (dentro da page) | `progress/weight-mini-bars`       | ✅  | extraído para arquivo próprio                      |
| `log-history`                    | `progress/log-history`            | ✅  | lista de registros recentes, base do editar/apagar |
| `log-day-field`                  | `progress/seletor-de-dia`         | ✅  | só setas ◀ ▶ no app; o PWA tem também o calendário |

### Metas e perfil — 4 de 4

| PWA                                  | App nativo                                                       |     | Observação                                                               |
| ------------------------------------ | ---------------------------------------------------------------- | :-: | ------------------------------------------------------------------------ |
| `goals/new-goal-drawer`              | `goals/new-goal-drawer`                                          | ✅  | prazo é campo de texto `AAAA-MM-DD` — não há `<input type="date">` no RN |
| `profile/copy-mcp-url`               | `profile/copy-mcp-url`                                           | ✅  | `expo-clipboard`                                                         |
| `profile/edit-height-drawer`         | `profile/edit-height-drawer`                                     | ✅  |                                                                          |
| `profile/profile-metrics`            | `profile/profile-metrics`                                        | ✅  |                                                                          |
| `MainGoalCard` etc. (dentro da page) | `goals/main-goal-card`, `secondary-goal-card`, `recent-goal-row` | ✅  | extraídos                                                                |
| —                                    | `profile/export-data-button`                                     | ➕  | LGPD art. 18, V — ver abaixo                                             |
| —                                    | `profile/delete-account-drawer`                                  | ➕  | LGPD art. 18, VI + exigência das lojas                                   |

### Comunidade — 6 de 6

| PWA                                  | App nativo                      |     | Observação                                                |
| ------------------------------------ | ------------------------------- | :-: | --------------------------------------------------------- |
| `community/consent-form`             | `community/consent-form`        | ✅  | checkbox nativo no PWA; `Pressable` com papel de checkbox |
| `community/join-by-code-drawer`      | `community/join-by-code-drawer` | ✅  | código → prévia → consentimento no mesmo sheet            |
| `community/invite` (cartão e aceite) | dentro de `app/c/[token].tsx`   | ✅  | a prévia deslogada vem da API pública nas duas pontas     |
| `org/org-shell`                      | `org/org-panel`                 | ✅  | barra lateral/abas na web; abas no topo no app            |
| `org/insights-card`                  | `org/insights-card`             | ✅  | recorte e período em pílulas; célula < 5 tracejada        |
| `sharing/member-reading`             | `sharing/member-reading`        | ✅  | a mesma leitura auditada, uma categoria por vez           |

### Layout e UI base — 15 de 15

| PWA                   | App nativo                  |     | Observação                                                                                                                                                                                                                              |
| --------------------- | --------------------------- | :-: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout/bottom-nav`   | `layout/bottom-nav`         | ✅  | Nutrição · Treino · [ + ] · Comunidade · Mais, de `navigation.ts` do api-client; o "+" central é o Registrar; sem aba Início (a barra de topo volta a ele)                                                                              |
| `layout/menu-mais`    | `layout/menu-mais`          | ✅  | mesmas seções de `menuSections`; o app não tem chat, e "Conectar sua IA" leva a `/profile/tokens`                                                                                                                                       |
| `layout/side-nav`     | —                           | ⛔  | só o desktop do PWA                                                                                                                                                                                                                     |
| `layout/quick-add`    | `layout/registro-rapido`    | ✅  | o menu Registrar; refeição pela hora e treino que retoma vêm do `@fatia/api-client`. O gatilho é o "+" da barra (`useQuickAdd` no PWA, `useRegistroRapido` aqui). O treino retoma em `/workout/session/:id` aqui e em `/workout` no PWA |
| `layout/app-top-bar`  | `layout/top-bar`            | ✅  | barra de topo estilo iOS em toda tela menos o Início: voltar hierárquico por `routeInfo` (api-client), título pequeno, ações à direita; `onBack` na sessão de treino                                                                    |
| `ui/button`           | `ui/button`                 | ✅  | todos os tamanhos com 44pt mínimos                                                                                                                                                                                                      |
| `ui/card`             | `ui/card`                   | ✅  |                                                                                                                                                                                                                                         |
| `ui/carousel` (embla) | `ui/carousel`               | ✅  | `FlatList` paginada                                                                                                                                                                                                                     |
| `ui/drawer` (vaul)    | `ui/drawer`                 | ✅  | `@gorhom/bottom-sheet`                                                                                                                                                                                                                  |
| `ui/form`             | `ui/form`                   | ✅  | rótulo vira `accessibilityLabel`, não `<label for>`                                                                                                                                                                                     |
| `ui/input`            | `ui/input`                  | ✅  |                                                                                                                                                                                                                                         |
| `ui/label`            | `ui/label`                  | ✅  |                                                                                                                                                                                                                                         |
| `ui/tabs`             | `ui/tabs`                   | ✅  | implementação própria, sem `pager-view`                                                                                                                                                                                                 |
| `ui/skeleton`         | `ui/state` (`LoadingState`) | ✅  | o PWA mostra o formato do conteúdo; o nativo, o indicador central                                                                                                                                                                       |
| `ui/empty-state`      | `ui/state` (`EmptyState`)   | ✅  | título, texto com o próximo passo e ação                                                                                                                                                                                                |
| `ui/toaster` (sonner) | `ui/toast`                  | ✅  | aviso com "Desfazer" (`UNDO_MS`). No PWA, dentro de drawer o "Desfazer" fica na lista (`useUndoSlot`): o vaul deixa a página inerte; o nativo usa sempre o `useToast`, acima dos sheets                                                 |
| —                     | `ui/state`                  | ➕  | carregamento, erro e vazio centralizados                                                                                                                                                                                                |
| —                     | `layout/screen`             | ➕  | moldura com safe area e pull-to-refresh                                                                                                                                                                                                 |
| `legal-doc`           | —                           | ⛔  | só serve às rotas legais, que abrem no navegador                                                                                                                                                                                        |

---

## Fora de propósito

| O quê                                               | Por quê                                                                                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa-install-prompt`, `pwa-register`, `sw-register` | são o PWA se instalando e se atualizando. O app nativo já **é** instalado; a atualização vem da loja                                                                                      |
| Rotas `/privacy` e `/terms`                         | abrem no navegador do sistema (`expo-linking`). Reimplementá-las criaria duas cópias do mesmo texto legal, que divergem no primeiro ajuste — e é justamente o texto que não pode divergir |
| Paridade offline                                    | o PWA tem service worker; o app não tem equivalente nesta épica, por decisão da épica                                                                                                     |
| ~~Notificação local do fim do descanso~~            | **Saiu daqui na #182**: `expo-notifications` entrou e o aviso do fim do descanso é agendado no sistema. Virou ganho do nativo, abaixo                                                     |

---

## O que o mobile ganhou e o PWA não tem

Não é escopo esticado: cada item fecha uma lacuna já aberta como issue, ou é
exigência de loja.

| Ganho                                             | Origem                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Exportar meus dados                               | LGPD art. 18, V — endpoint existia sem interface                                       |
| Apagar minha conta                                | LGPD art. 18, VI + Apple e Google **rejeitam** app que cria conta e não deixa apagá-la |
| Pull-to-refresh                                   | expectativa nativa, pedida pela #123                                                   |
| Tela acesa durante o treino                       | #126 — no meio de uma série ninguém quer desbloquear o celular                         |
| Feedback tátil e cronômetro de descanso           | #126                                                                                   |
| Confirmação antes de apagar                       | em tela de toque o alvo erra, e a API não desfaz                                       |
| Estados de erro onde o web deixa a tela em branco | a auditoria pede estados equivalentes; "equivalente a nada" não serve                  |
| Notificação local do fim do descanso              | #182 — o descanso é o momento em que o celular vai para o bolso                        |
| Registro de refeição por foto                     | #139 — depende de câmera e galeria; ver abaixo                                         |

**Registro por foto (#139) não é dívida de paridade — é dependência de aparelho.**
Câmera e galeria não existem no PWA de forma comparável (o `input[capture]` do
Safari abre a câmera do sistema e devolve HEIC, que os modelos de visão não
aceitam), e o fluxo inteiro se apoia em capturar, reduzir e recomprimir no
dispositivo. O PWA continua na busca por nome, que é o caminho que sempre
funcionou e é onde o nativo também termina, na tela de confirmação.

**A entrada por foto some quando não há IA configurada.** O botão só aparece se
`GET /api/nutrition/photo-recognition` responder `available: true`, o que exige
`AGENT_BASE_URL` **e** um modelo de visão no agente. Numa instância sem IA
hospedada — que é o default — o app fica exatamente como antes.

**Correção que volta para o PWA:** o botão "Log Água" do dashboard, com ícone de
gota e rótulo de água, abria o drawer de **passos**. Corrigido nos dois.

**Ganho que voltou para o PWA:** editar e apagar registro de peso, passos e água
(#116) nasceu aqui e foi portado de volta na direção inversa da habitual. O
`log-history` do web é o mesmo componente traduzido para DOM. Desde a Fase 3 os
dois apagam sem pergunta e oferecem "Desfazer" por 5 s (registros pequenos; ver
`docs/DESIGN.md`): no PWA o aviso fica no topo da lista, porque o drawer modal
deixa o resto da página inerte; no app é o `useToast`.

**Reordenar exercício do plano saiu desta tabela (#183).** Estava listada como
ganho do mobile — "existe na API e no MCP, não no PWA". Era falso: o PWA
reordena desde a #115. Reordenava pior, com dois PATCH concorrentes no mesmo
tick, mas reordenava. Hoje os dois apps usam o mesmo
`workoutApi.reorderPlanExercises`, numa escrita atômica só. A nova posição
também é anunciada nos dois — `announceForAccessibility` no nativo, uma região
`role="status" aria-live="polite"` no PWA — e nos dois o anúncio sai depois da
resposta: dito no toque, ele afirmaria um movimento que a rede ainda pode
recusar.

**O otimismo da reordenação fechou nos dois (#221).** Foi ganho só do PWA entre
a #115 e a #221: lá o `onMutate` trocava os dois `order` no cache e o `onError`
desfazia, enquanto o `moveExercise` do nativo tinha só `onSuccess` e `onError` —
o card ficava parado até a resposta voltar, justamente no 4G do vestiário que
motivou a #115. Hoje os dois têm `onMutate` com `cancelQueries`, snapshot e
rollback, e nos dois o `onError` **também invalida**: restaurar o snapshot sem
confirmar ressuscitaria na tela um exercício apagado durante o voo. A conta do
anúncio sai da resposta nos dois (`planMoveAnnouncement` no nativo), nunca da
lista que estava na tela no toque.

**Ganho que voltou para o PWA na #221: o foco não se perde ao reordenar.** Era
defeito dos dois, medido no PWA — `isMoving` desabilita justamente o botão sob o
foco, e o card muda de lugar no DOM, então o foco caía no `<body>` e quem navega
por teclado voltava para o começo do documento a cada movimento. O
`ExerciseDetailCard` do web devolve o foco à seta que moveu, ou à irmã quando o
exercício para na borda. **No nativo não há o que consertar:** não existe foco
de teclado percorrendo a lista, e o `Pressable` desabilitado não tira o foco do
leitor de tela — o TalkBack e o VoiceOver anunciam a mudança pelo
`announceForAccessibility` do `onSuccess`.

---

## Comunidade — o convite abre o app

O convite é o mesmo link nas duas pontas: `https://<app>/c/<token>` no PWA e, no app, `fatia://c/<token>`
ou o link universal quando o build tem `APP_LINKS_HOST` (e a web serve
`/.well-known/apple-app-site-association` e `/.well-known/assetlinks.json` com `APPLE_TEAM_ID` e
`ANDROID_CERT_SHA256`). Os textos e as regras (`groupsApi`, `community-consent`) vêm do api-client.

A diferença é o login: no PWA o `?next=` passa por um cookie e volta ao link; no app o login abre o
navegador do sistema e o app pode ser fechado no meio, então o token fica no cofre
(`src/community/pending-invite.ts`) e o `(app)/_layout` volta ao convite quando a pessoa está dentro
e já passou pelo assistente. O consentimento é um `Pressable` com papel de checkbox — não há
Switch nem Checkbox no app.

## Painel da comunidade — a equipe no celular

O painel (Fase 6) existe no app pensando em quem atende de pé, entre um aluno e outro: as seções do
papel viram abas no topo (`OrgPanel`), as regras e os textos vêm do api-client
(`community-panel.ts`, `orgApi`, `seatsApi`, `insightsApi`), e as escolhas que na web são `Select`
viram pílulas (`Choice`). Diferenças de propósito:

- **Assentos:** o app mostra os assentos, quem usa, tira assento e lista as faturas, mas **não
  compra, não muda a quantidade e não cancela** — é pagamento fora da loja, e o app não mostra
  link de pagamento externo (mesma regra do Plano PRO). Dar assento fica em Membros › Gerenciar.
- **Convite em lote:** só colando a lista; subir `.csv` é da web.
- **Comportamento (add-on):** o painel pago e o export CSV ficam na web; o app mostra a retenção.

## Plano PRO — a mesma tela, outro caixa

A tela "Meu plano" mostra o mesmo plano que o PWA (`billingApi.plan`, `PRO_BENEFITS`,
`FREE_INCLUDES`, `planSummary` do api-client), mas a compra é diferente de propósito: as lojas
exigem compra in-app, então o app vende pela App Store / Google Play via RevenueCat
(`src/billing/purchases.ts`) e **nunca mostra link de pagamento externo**. Quem assinou pela web vê
"gerencie pela web", sem link. Sem as chaves `EXPO_PUBLIC_REVENUECAT_*` (Expo Go, por exemplo) a
tela diz que a assinatura não está disponível neste build.

O cadeado: a câmera da Nutrição continua visível no Free, com cadeado, e leva a
`/plan?recurso=foto`; a tela de foto trata o 402 com "Ver o plano PRO". O app não tem chat, então
o menu não muda.

## O que o React Native impôs

Diferenças que não são escolha de produto — são consequência da plataforma. Estão
aqui para que a próxima pessoa não as leia como descuido.

**O bottom sheet não é portal.** O `vaul` teletransporta o drawer para o `<body>`,
então ele pode ser declarado dentro do card que o abre. O sheet nativo se
posiciona com `absoluteFill` **dentro do pai**: declarado dentro de um card de
150 px, abre com 150 px. Por isso todo drawer é irmão do `<Screen>`, dentro de um
`<DrawerLayer>`, e o componente que o abriria recebe um callback. Documentado em
`apps/mobile/src/components/ui/drawer.tsx`.

**`className` não chega em componente de terceiro.** O NativeWind traduz
`className` para `style` só nos componentes do core do React Native. Num
componente compilado de biblioteca a prop é ignorada — e o sintoma não é erro: o
campo renderiza com a cor padrão do sistema, invisível sobre o fundo escuro.
Resolvido com `cssInterop` uma vez, no primitivo.

**O modificador de opacidade do Tailwind não funciona.** A paleta usa
`hsl(var(--x))` sem canal alfa, então `bg-primary/40` não resolve. Opacidade vai
por `style`.

**`Intl` do Hermes é irregular entre Androids.** Números e datas em pt-BR são
formatados à mão ou com `date-fns` + locale `ptBR`, nunca com `toLocaleString`.

**Cores fora da paleta, de propósito.** Os macros mantêm o código de cor do
produto (proteína `#4b8eff`, gordura `#f43f5e`) e os estados de aviso usam
âmbar/vermelho claros: `--destructive` é `#93000a`, que some como preenchimento
de barra sobre `#131313`. Texto de erro continua em `text-destructive`.

---

## O que ainda precisa de aparelho

Este documento prova **cobertura**, não comportamento. O que só se confirma
rodando, e deve ser feito antes de publicar:

- [ ] Os números batem com o PWA para a mesma conta, no mesmo dia
- [ ] Login, refresh e logout nos dois sistemas, com o token saindo do cofre
- [ ] Sheet de busca de alimento com o teclado aberto em tela pequena (iPhone SE)
- [ ] Estrela de favorito e "Concluir · N itens" no sheet de busca (toque de 44 pt, leitor de tela)
- [ ] Chips de medida caseira, botões − e + (44 pt) e "Nova medida" com o teclado aberto no sheet
- [ ] Formulário de alimento no sheet com o teclado numérico aberto (vírgula decimal), e "Cadastrar à mão" do scanner abrindo Meus alimentos
- [ ] Botão "Ler código de barras" do sheet de busca abrindo o scanner no mesmo dia e tipo, e "Guardar em Meus alimentos" fazendo o produto aparecer na busca
- [ ] "Mais ações" da refeição (copiar, salvar) e "Copiar dia": setas do dia de destino e "Ver dia" trocando a data da tela
- [ ] Dia de água, peso e passos: seta "Próximo dia" apagada em hoje, e o registro de ontem aparecendo na lista com a data certa
- [ ] Barra nova: "+" central abrindo o Registrar (treino retomando a sessão aberta), "Mais" abrindo o menu com rolagem no sheet de 85%, e a aba acesa certa em Metas/Perfil/Progresso
- [ ] Barra de topo: área segura no iPhone com notch, título longo com reticências, ações à direita com 44 pt, "voltar" subindo pelo mapa até o Início (inclusive aberto por link direto) e a sessão de treino perguntando antes de sair
- [ ] Assistente de primeira vez: conta nova cai nele, "Pular por agora" não volta a perguntar, e "Recalcular com meus dados" volta às metas
- [ ] "Desfazer" do aviso no rodapé: apagar água/peso/passos no sheet e item na timeline, tocar em Desfazer dentro de 5 s e o registro voltar (o aviso tem de ficar acima do sheet e da barra)
- [ ] Meu plano (dev build com `EXPO_PUBLIC_REVENUECAT_*` e conta de teste da loja): pacotes com o preço da loja, compra virando PRO na hora (`revenuecat/sync`), "Restaurar compras", "Gerenciar na loja", e a câmera da Nutrição saindo do cadeado
- [ ] Logout trocando a conta da RevenueCat (`Purchases.logOut`) e o login seguinte com outra pessoa não herdando a compra
- [ ] Convite: `fatia://c/<token>` abrindo a tela do convite; deslogado, entrar e voltar ao convite (inclusive fechando o app no meio do login e passando pelo assistente)
- [ ] Link universal (`APP_LINKS_HOST` no build, `APPLE_TEAM_ID`/`ANDROID_CERT_SHA256` na web): `https://<app>/c/<token>` abrindo o app em vez do navegador
- [ ] Comunidade: checkboxes do consentimento com leitor de tela (estado marcado anunciado), "Entrar com código" com o teclado aberto no sheet, e "Sair" voltando à lista
- [ ] Painel da comunidade (conta da equipe): abas no topo rolando sem cortar, "Aprovar" e "Gerenciar" com 44 pt, `Alert` de papel e assento, `Share` do link de convite e do código, lote colado com o teclado aberto, e o "voltar" do painel levando à comunidade
- [ ] Cores dos macros e de erro (`cores.ts`) iguais às do PWA lado a lado
- [ ] Diagrama muscular destacando os grupos certos
- [ ] Aparelho de entrada, não só simulador — os gráficos são o ponto a observar
- [ ] Leitor de tela e fonte ampliada nos dois sistemas
- [ ] Estados de erro, vazio e carregamento comparados lado a lado com o PWA

## Como manter

O que sustenta este documento:

1. `apps/mobile/src/theme/__tests__/palette.test.ts` — compara token a token a
   paleta do app com a do PWA. Mudar o verde da marca num lado só quebra aqui.
2. `packages/api-client` — os dois apps falam com a API pelo mesmo código, então
   uma rota nova não pode existir num cliente e não no outro.
3. `pnpm --filter @fatia/mobile build` no CI — `expo export` pega import quebrado
   antes de alguém instalar o app.
