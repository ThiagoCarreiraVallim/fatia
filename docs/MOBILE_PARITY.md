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

| PWA                                  | App nativo                                               |     | Observação                                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------- | :-: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `(app)/page.tsx`                     | `app/(app)/index.tsx`                                    | ✅  | dashboard                                                                                                                                                                                       |
| `(app)/community`                    | `app/(app)/community/index.tsx`                          | ✅  | minhas comunidades + "Entrar com código" (drawer)                                                                                                                                               |
| `(app)/chat`                         | `app/(app)/chat/index.tsx`                               | ✅  | conversas; segurar renomeia ou apaga; "Nova conversa"; upsell no Free                                                                                                                           |
| `(app)/chat/[id]`                    | `app/(app)/chat/[id].tsx`                                | ✅  | a conversa (Fase 9e) — ver "Chat no app" abaixo                                                                                                                                                 |
| gaveta "Memórias" do chat            | `app/(app)/chat/memories.tsx`                            | ✅  | tela própria no app; na web é uma gaveta da conversa                                                                                                                                            |
| `(app)/community/[groupId]`          | `app/(app)/community/[groupId]/index.tsx`                | ✅  | nos dois a comunidade abre no mural; `/feed` só redireciona para lá                                                                                                                             |
| `(app)/community/[groupId]/settings` | `app/(app)/community/[groupId]/settings.tsx`             | ✅  | atrás da engrenagem do mural: equipe, o que compartilho, quem acessou, rever as boas-vindas (#410), sair                                                                                        |
| `(app)/community/[groupId]/content`  | `app/(app)/community/[groupId]/content/index.tsx`        | ✅  | planos prontos e dicas publicados (pílulas Planos/Dicas)                                                                                                                                        |
| `(app)/…/content/[templateId]`       | `app/(app)/community/[groupId]/content/[templateId].tsx` | ✅  | prévia e "Adotar"; nutrição escolhe o que copiar, metas com a comparação                                                                                                                        |
| `(invite)/c/[token]`                 | `app/c/[token].tsx`                                      | ✅  | fora do `(app)`; deslogado guarda o token no cofre e retoma depois do login                                                                                                                     |
| `(demo)/demo/[token]`                | `app/demo/[token].tsx`                                   | ✅  | Hoje da Ana Exemplo, só leitura (#412); fora do `(app)` e sem a sessão de quem está logado: só o token curto da demo                                                                            |
| `(app)/community/new`                | `app/(app)/community/new.tsx`                            | ✅  | criar comunidade; leva aos convites do painel                                                                                                                                                   |
| `(org)/org/[groupId]`                | `app/(app)/org/[groupId]/index.tsx`                      | ✅  | painel: visão geral e retenção agregada (dono)                                                                                                                                                  |
| `(org)/org/[groupId]/members`        | `app/(app)/org/[groupId]/members/index.tsx`              | ✅  | aprovar, recusar; "Gerenciar" (`Alert`) muda papel, assento e remove                                                                                                                            |
| `(org)/…/members/[membershipId]`     | `app/(app)/org/[groupId]/members/[membershipId].tsx`     | ✅  | leitura por categoria do que o membro compartilha                                                                                                                                               |
| `(org)/org/[groupId]/invites`        | `app/(app)/org/[groupId]/invites.tsx`                    | ✅  | link com `Share` nativo; e-mail; lote colado (sem `.csv`)                                                                                                                                       |
| `(org)/org/[groupId]/seats`          | `app/(app)/org/[groupId]/seats.tsx`                      | ⚠️  | ver, tirar e faturas; compra, quantidade e cancelar só na web, ver abaixo                                                                                                                       |
| `(org)/org/[groupId]/settings`       | `app/(app)/org/[groupId]/settings.tsx`                   | ⚠️  | perfil, avatar (galeria), código (`Share`), transferir e apagar. Marca (cor e capa), seções da comunidade, tipo e "Mais da comunidade" (#413) só na web; no app, com o painel no celular (#414) |
| `(org)/org/[groupId]/content`        | `app/(app)/org/[groupId]/content/index.tsx`              | ✅  | planos e dicas da equipe, rascunho e publicado                                                                                                                                                  |
| `(org)/…/content/plans/[templateId]` | `app/(app)/org/[groupId]/content/plans/[templateId].tsx` | ✅  | treino a partir de um plano seu; nutrição com metas e refeições salvas                                                                                                                          |
| `(org)/…/content/tips/[tipId]`       | `app/(app)/org/[groupId]/content/tips/[tipId].tsx`       | ✅  | dica com prévia do markdown, imagem da galeria, fixar e publicar                                                                                                                                |
| `(org)/org/[groupId]/welcome`        | —                                                        | ⚠️  | editor das boas-vindas (#410) só na web; no app, com o painel no celular (#414). O aluno vê as páginas no app (onboarding e Sobre)                                                              |
| `(org)/org/[groupId]/integrations`   | —                                                        | ⚠️  | chaves de API, cota do mês e receitas (#413) só na web; no app, com o painel no celular (#414)                                                                                                  |
| `(org)/org/[groupId]/updates`        | —                                                        | ⚠️  | novidades do painel e "Sugerir uma ideia" (#413) só na web; no app, com o painel no celular (#414)                                                                                              |
| `(app)/goals`                        | `app/(app)/goals.tsx`                                    | ✅  |                                                                                                                                                                                                 |
| `(app)/nutrition`                    | `app/(app)/nutrition/index.tsx`                          | ✅  |                                                                                                                                                                                                 |
| `(app)/nutrition/foods`              | `app/(app)/nutrition/foods.tsx`                          | ✅  | Meus alimentos (Al-N12): busca, abas Todos/Alimentos/Refeições (sem "Lidos", ADR 017), apagar refeição salva confirmado; `?novo=1` abre o cadastro                                              |
| `(app)/nutrition/meals/[id]`         | `app/(app)/nutrition/meals/[id].tsx`                     | ✅  | a refeição (Al-N8/N8b, #374)                                                                                                                                                                    |
| `(app)/nutrition/goals`              | `app/(app)/nutrition/goals.tsx`                          | ✅  |                                                                                                                                                                                                 |
| `(app)/nutrition/nutrient-targets`   | `app/(app)/nutrition/nutrient-targets.tsx`               | ✅  |                                                                                                                                                                                                 |
| `(app)/nutrition/plan`               | `app/(app)/nutrition/plan.tsx`                           | ✅  | Plano alimentar (#376): aceitar, comi isso, trocar e desfazer; a folha de troca é drawer irmão da `Screen`                                                                                      |
| —                                    | `app/(app)/nutrition/scan.tsx`                           | ➕  | leitor (#140, #375): abas Código/Rótulo; código seu abre direto na quantidade; desconhecido segue para o rótulo com o código; no PWA o leitor mora no drawer de busca                           |
| `nutrition/photo` (#385)             | `app/(app)/nutrition/photo.tsx`                          | ✅  | registro por foto (#139); aviso do provedor antes da primeira; "Guardar as fotos das refeições?" (#374); no PWA o arquivo faz o papel da câmera, ver abaixo                                     |
| `(app)/plan`                         | `app/(app)/plan.tsx`                                     | ⚠️  | Meu plano (ADR 024); o app vende só pela loja (RevenueCat), ver abaixo                                                                                                                          |
| `(app)/profile`                      | `app/(app)/profile/index.tsx`                            | ✅  |                                                                                                                                                                                                 |
| `(app)/profile/notifications`        | `app/(app)/profile/notifications.tsx`                    | ✅  | prancha Al-V4 nos dois (#389)                                                                                                                                                                   |
| `(app)/you/reminders`                | `app/(app)/you/reminders.tsx`                            | ✅  | "Liberar": Web Push no PWA, permissão do sistema no app (#389)                                                                                                                                  |
| `(app)/profile/connect`              | `app/(app)/profile/connect.tsx`                          | ✅  | Conectar sua IA (#388, Al-V6..V6e): mesma tela, endereço vindo da API (`/users/me/mcp-connections`), "Conectado" só com acesso nos últimos 30 dias                                              |
| `(app)/progress`                     | `app/(app)/progress/index.tsx`                           | ✅  |                                                                                                                                                                                                 |
| `(app)/progress/records`             | `app/(app)/progress/records.tsx`                         | ✅  |                                                                                                                                                                                                 |
| `(app)/workout`                      | `app/(app)/workout/index.tsx`                            | ✅  | a sessão ativa vira aviso com "Continuar treino" em vez de tomar a tela                                                                                                                         |
| `(app)/workout/history`              | `app/(app)/workout/history.tsx`                          | ✅  |                                                                                                                                                                                                 |
| `(app)/workout/offers/[id]`          | `app/(app)/workout/offers/[id].tsx`                      | ✅  | Plano recebido (#379): aceitar, recusar, desfazer e "o que mudou"                                                                                                                               |
| `(app)/workout/agenda`               | `app/(app)/workout/agenda.tsx`                           | ✅  | Agenda (#379): semana e mês; "Remarcar" de hoje ao fim do plano                                                                                                                                 |
| `(app)/workout/templates`            | `app/(app)/workout/templates.tsx`                        | ✅  | Modelos das comunidades (#379)                                                                                                                                                                  |
| `(app)/workout/block`                | `app/(app)/workout/block.tsx`                            | ✅  | Bloco de 3 a 6 semanas (#379)                                                                                                                                                                   |
| `(app)/workout/plans`                | `app/(app)/workout/plans/index.tsx`                      | ✅  |                                                                                                                                                                                                 |
| `(app)/workout/plans/new`            | `app/(app)/workout/plans/new.tsx`                        | ✅  | Novo plano (#378): nome e lote de exercícios; o Configurar fica no plano criado                                                                                                                 |
| `(app)/workout/plans/[id]`           | `app/(app)/workout/plans/[id].tsx`                       | ✅  |                                                                                                                                                                                                 |
| `(app)/workout/quick/[templateId]`   | `app/(app)/workout/quick/[templateId].tsx`               | ✅  |                                                                                                                                                                                                 |
| `(app)/workout/session/[id]`         | `app/(app)/workout/session/[id]/index.tsx`               | ✅  | uma rota para sessão ativa e concluída — o treino termina durante a visita                                                                                                                      |
| gaveta "Treino atual" (T17)          | `app/(app)/workout/session/[id]/edit.tsx`                | ✅  | no app é rota própria; a barra de navegação some nas duas                                                                                                                                       |
| `(auth)/login`                       | `app/login.tsx`                                          | ✅  | navegador do sistema em vez de redirect no servidor                                                                                                                                             |
| `(onboarding)/onboarding`            | `app/onboarding.tsx`                                     | ✅  | onboarding das pranchas Onb-* (#371); no app, a saúde do celular (Onb-P1) e o QR da recepção; teste grátis pela loja                                                                            |
| `(public)/privacy`                   | —                                                        | ⛔  | abre no navegador; ver "Fora de propósito"                                                                                                                                                      |
| `(public)/terms`                     | —                                                        | ⛔  | idem                                                                                                                                                                                            |

---

## Conectar a IA no app nativo — resolvido na #388

A #164 reescreveu o fluxo do PWA e o nativo ficou em `app/(app)/profile/tokens.tsx`, com o texto
antigo. A #388 trocou as duas pelas pranchas Al-V6..V6e: `app/(app)/profile/connect.tsx` replica
`apps/web/src/components/profile/connect-ai-screen.tsx`, os textos saem de `@fatia/api-client`
(`connect-ai.ts`) e o endereço vem da API, não de `env.mcpUrl` (removido). `profile/tokens.tsx` e
`profile/copy-mcp-url.tsx` foram apagados; na web, `/profile/tokens` só redireciona.

### Metas e perfil — 4 de 4

| PWA                                  | App nativo                                                       |     | Observação                                                                                          |
| ------------------------------------ | ---------------------------------------------------------------- | :-: | --------------------------------------------------------------------------------------------------- |
| `goals/new-goal-drawer`              | `goals/new-goal-drawer`                                          | ✅  | prazo é campo de texto `AAAA-MM-DD` — não há `<input type="date">` no RN                            |
| `profile/connect-ai-screen`          | `app/(app)/profile/connect.tsx`                                  | ✅  | `expo-clipboard`; recusa ou `false` vira aviso para copiar à mão (`profile/copy-text`), como na web |
| `profile/edit-height-drawer`         | `profile/edit-height-drawer`                                     | ✅  |                                                                                                     |
| `profile/profile-metrics`            | `profile/profile-metrics`                                        | ✅  |                                                                                                     |
| `MainGoalCard` etc. (dentro da page) | `goals/main-goal-card`, `secondary-goal-card`, `recent-goal-row` | ✅  | extraídos                                                                                           |
| —                                    | `profile/export-data-button`                                     | ➕  | LGPD art. 18, V — ver abaixo                                                                        |
| —                                    | `profile/delete-account-drawer`                                  | ➕  | LGPD art. 18, VI + exigência das lojas                                                              |

### Comunidade — 6 de 6

| PWA                                  | App nativo                      |     | Observação                                                |
| ------------------------------------ | ------------------------------- | :-: | --------------------------------------------------------- |
| `community/consent-form`             | `community/consent-form`        | ✅  | checkbox nativo no PWA; `Pressable` com papel de checkbox |
| `community/join-by-code-drawer`      | `community/join-by-code-drawer` | ✅  | código → prévia → consentimento no mesmo sheet            |
| `community/invite` (cartão e aceite) | dentro de `app/c/[token].tsx`   | ✅  | a prévia deslogada vem da API pública nas duas pontas     |
| `org/org-shell`                      | `org/org-panel`                 | ✅  | barra lateral/abas na web; abas no topo no app            |
| `org/insights-card`                  | `org/insights-card`             | ✅  | recorte e período em pílulas; célula < 5 tracejada        |
| `sharing/member-reading`             | `sharing/member-reading`        | ✅  | a mesma leitura auditada, uma categoria por vez           |

### Layout e UI base — 17 de 17

| PWA                         | App nativo                  |     | Observação                                                                                                                                                                                                                                                  |
| --------------------------- | --------------------------- | :-: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout/bottom-nav`         | `layout/bottom-nav`         | ✅  | Hoje · Nutrição · Treino · Comunidade · Você, só ícone com nome acessível, e o botão da IA à direita (`layout/ai-fab`), de `navigation.ts`; some nas tarefas de foco (`navBarMode`); acima dela, a barra do treino em andamento e o cartão "esperando você" |
| `app/(app)/you`             | `app/(app)/you`             | ✅  | a aba Você: as seções de `menuSections` (com a linha Notificações); "Conectar sua IA" leva a `/profile/connect` nas duas plataformas                                                                                                                        |
| `layout/side-nav`           | —                           | ⛔  | só o desktop do PWA                                                                                                                                                                                                                                         |
| `layout/ai-drawer`          | `layout/ai-drawer`          | ✅  | "O que vamos registrar?": registro manual primeiro, conversas, Free com "Com a IA Pro", sugestões, foto, ditado, enviar; regras de `ai-drawer.ts` do api-client. O treino retoma em `/workout/session/:id` aqui e em `/workout` no PWA                      |
| `layout/ai-pending-card`    | `layout/ai-pending-card`    | ✅  | aprova a pausa fora da conversa (ADR 039 §6); toast sem "Desfazer" por ora, nos dois                                                                                                                                                                        |
| `layout/active-workout-bar` | `layout/active-workout-bar` | ✅  | "treino em andamento" com descanso e "+30 s"; o descanso mora acima das telas (`rest-timer-provider`) nos dois                                                                                                                                              |
| `layout/app-top-bar`        | `layout/top-bar`            | ✅  | barra de topo estilo iOS em toda tela menos o Início: voltar hierárquico por `routeInfo` (api-client), título pequeno, ações à direita; `onBack` na sessão de treino                                                                                        |
| `ui/button`                 | `ui/button`                 | ✅  | todos os tamanhos com 44pt mínimos                                                                                                                                                                                                                          |
| `ui/card`                   | `ui/card`                   | ✅  |                                                                                                                                                                                                                                                             |
| `ui/carousel` (embla)       | `ui/carousel`               | ✅  | `FlatList` paginada                                                                                                                                                                                                                                         |
| `ui/drawer` (vaul)          | `ui/drawer`                 | ✅  | `@gorhom/bottom-sheet`                                                                                                                                                                                                                                      |
| `ui/form`                   | `ui/form`                   | ✅  | rótulo vira `accessibilityLabel`, não `<label for>`                                                                                                                                                                                                         |
| `ui/input`                  | `ui/input`                  | ✅  |                                                                                                                                                                                                                                                             |
| `ui/label`                  | `ui/label`                  | ✅  |                                                                                                                                                                                                                                                             |
| `ui/tabs`                   | `ui/tabs`                   | ✅  | implementação própria, sem `pager-view`                                                                                                                                                                                                                     |
| `ui/skeleton`               | `ui/state` (`LoadingState`) | ✅  | o PWA mostra o formato do conteúdo; o nativo, o indicador central                                                                                                                                                                                           |
| `ui/empty-state`            | `ui/state` (`EmptyState`)   | ✅  | título, texto com o próximo passo e ação                                                                                                                                                                                                                    |
| `ui/toaster` (sonner)       | `ui/toast`                  | ✅  | aviso com "Desfazer" (`UNDO_MS`). No PWA, dentro de drawer o "Desfazer" fica na lista (`useUndoSlot`): o vaul deixa a página inerte; o nativo usa sempre o `useToast`, acima dos sheets                                                                     |
| —                           | `ui/state`                  | ➕  | carregamento, erro e vazio centralizados                                                                                                                                                                                                                    |
| —                           | `layout/screen`             | ➕  | moldura com safe area e pull-to-refresh                                                                                                                                                                                                                     |
| `legal-doc`                 | —                           | ⛔  | só serve às rotas legais, que abrem no navegador                                                                                                                                                                                                            |

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
| Avisos da comunidade (push)                       | Fase 8c, ADR 033 — o PWA no iOS não entrega push com confiança                         |

**Registro por foto: o PWA usa arquivo no lugar da câmera (#385).** `/nutrition/photo` abre o
seletor com `capture` (no celular, a câmera do sistema) e recodifica no canvas para JPEG sem EXIF,
o que também converte HEIC onde o navegador sabe abrir. Daí em diante é o mesmo fluxo do app: aviso
do provedor, a pergunta de guardar e a revisão com ±10 g. Sem câmera ao vivo, flip nem aba Rótulo
nesta tela (o rótulo continua no formulário de alimento próprio).

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

A cor e a capa da comunidade (#413) entram no topo do convite de quem ainda não tem conta, nas duas
pontas: no PWA pelo `--brand` (`brandStyle`), no app pelo `vars()` do NativeWind com a mesma conta de
contraste (`brandColors`). As seções que a comunidade esconde (Mural, Desafios, planos alimentares e
dicas de nutrição) somem igual na web e no app, pelos mesmos helpers (`communityTabs`,
`isSectionHidden`, `visibleCommunityPlans`, `visibleCommunityTips`); com o mural escondido nenhuma das
duas lê posts nem mostra carregamento.

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
- **Planos e dicas (Fase 7a):** iguais à web. A imagem vem da galeria (`expo-image-picker`, que
  reencoda em JPEG e resolve o HEIC) e vai direto ao bucket pela URL assinada, como no navegador;
  o markdown das dicas é desenhado pelos mesmos tokens (`parseMarkdownLite`), nunca HTML.
- **Exercícios da comunidade (Fase 7b):** iguais à web, com duas diferenças. O vídeo do tutorial
  abre no navegador do sistema (`expo-web-browser`), não num player dentro do app: um player
  nativo (`expo-video`) é dependência nativa nova e pediria build novo. E o vídeo vem da galeria:
  gravar pela câmera do Fatia pediria a permissão de microfone. O envio lê o arquivo do disco
  (`createUploadTask`), com progresso, para um vídeo grande não ficar na memória.
- **Agente da comunidade (Fase 7c):** o dono configura no app como na web (nome, avatar,
  orientações, ligar e desligar), com "Ligado / Desligado" em pílulas. Desde a Fase 9e o membro
  escolhe o agente também no chat do app.
- **Desafios da comunidade (Fase 8a):** o membro vê a prévia na comunidade, a lista e o detalhe
  com o ranking, entra com apelido e sai, como na web. No painel, marcar um desafio usa escolhas
  prontas — começa hoje, amanhã ou na próxima segunda; dura 7, 14 ou 30 dias
  (`components/challenges/window-choice.ts`) — em vez do calendário; datas livres e editar um
  desafio marcado ficam na web. Encerrar e apagar existem nos dois.
- **Mural da comunidade (Fase 8b):** nos dois, tocar numa comunidade abre o mural, com as abas
  Mural, Desafios e Planos e dicas; o que era a aba Início (sobre, o que compartilho, quem
  acessou, sair) fica numa tela discreta atrás da engrenagem do topo, e o painel da equipe no ícone
  ao lado. Publicar com até 4 imagens da galeria, reagir, comentar e denunciar são
  iguais; o menu do post é um `Alert` (a web abre um diálogo). A Moderação do painel (regra do
  mural, denúncias, removidos e banidos) existe nos dois.

- **Comunidade de demonstração (#412):** criar, entrar, apagar e o QR de "Abrir no app como Ana
  Exemplo" ficam no painel da web; a seção `demo` está em `MOBILE_MISSING_SECTIONS` até o painel no
  celular (#414). O app abre o link (`fatia://demo/<token>` ou, com `APP_LINKS_HOST`,
  `https://<app>/demo/<token>`, `pathPrefix: '/demo/'` no Android) e mostra o Hoje da Ana com os
  mesmos cartões, sem toque: os links dos cartões levariam à conta de quem está logado. O pedido vai
  direto à API com o token como Bearer (`demoSessionRequest`, só `GET`, só as rotas do Hoje), nunca
  pelo transporte do app, que carrega a sessão do Logto.

## Chat no app (Fase 9e)

O app não tem o runtime do assistant-ui que a web usa. A conversa vira estado puro no api-client
(`applyChatFrame`, `threadFromHistory`, testados sem tela) e a `ChatSession`
(`src/chat/chat-session.ts`) cuida do fio: abrir, enviar, responder pausa, parar, reconectar.

| Recurso da web                                               | No app | Como                                                                                        |
| ------------------------------------------------------------ | :----: | ------------------------------------------------------------------------------------------- |
| Resposta token a token                                       |   ✅   | `expo/fetch` só para o stream (`streamFetch` do transporte); o resto segue no `fetch` do RN |
| Raciocínio recolhido, tools com estado e título              |   ✅   | `catalog` dá o título; ✓, girando ou ✗ com o motivo                                         |
| Cartões das tools (métrica, evolução, relatório, comparação) |   ✅   | `ArtifactCard`, gráfico com o kit do ADR 012                                                |
| Plano do turno                                               |   ✅   | `PlanCard`                                                                                  |
| Pausas: confirmar escrita com resumo, pergunta, continuar    |   ✅   | `PauseCard`, mesmos ajudantes da web (`askFieldsOf`, `questionAnswer`)                      |
| Parar, tentar de novo, erro com o caminho certo              |   ✅   | parar vai ao servidor (`stopChatRun`); 402 leva ao plano; cota diz quando volta             |
| Voto 👍/👎, copiar, tempo da resposta                        |   ✅   | o motivo do 👎 fica só na web                                                               |
| Agente da comunidade: escolha na conversa nova, nome no topo |   ✅   | pílulas "Quem responde"                                                                     |
| Foto (câmera ou galeria, até 3)                              |   ✅   | JPEG `quality: 0.6`; a API tira o EXIF de novo                                              |
| Ditado                                                       |   ✅   | `expo-audio` (módulo novo, permissão de microfone); o texto volta ao campo, não envia       |
| Memórias                                                     |   ✅   | tela própria                                                                                |
| Resposta segue ao trocar de aba / F5                         |   ✅   | sessão no layout; o anel do botão da IA gira; ao voltar do segundo plano, `live?after=`     |
| Resposta pronta com o app fechado                            |   ➕   | push `CHAT` "Sua resposta está pronta." — a web não tem push                                |
| Busca nas conversas                                          |   ❌   | a lista do app não filtra; fica para quando houver muitas                                   |
| Motivo do 👎 e nota                                          |   ❌   | só na web                                                                                   |

## Plano PRO — a mesma tela, outro caixa

A tela "Meu plano" mostra o mesmo plano que o PWA (`billingApi.plan`, `PRO_BENEFITS`,
`FREE_INCLUDES`, `planSummary` do api-client), mas a compra é diferente de propósito: as lojas
exigem compra in-app, então o app vende pela App Store / Google Play via RevenueCat
(`src/billing/purchases.ts`) e **nunca mostra link de pagamento externo**. Quem assinou pela web vê
"gerencie pela web", sem link. A compra só aparece com `EXPO_PUBLIC_IAP_ENABLED=true` e as chaves
`EXPO_PUBLIC_REVENUECAT_*` no build; sem isso (o piloto, o Expo Go) a tela não vende nada e diz que o
PRO chega pela comunidade, sem preço e sem apontar para a web (`src/billing/plan-offer.ts`).

O cadeado: a câmera da Nutrição continua visível no Free, com cadeado, e leva a
`/plan?recurso=foto`; a tela de foto trata o 402 com "Ver o plano PRO". O Chat do menu leva a
`/plan?recurso=chat` no Free, e o 402 dentro da conversa mostra "Ver o plano PRO".

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

**Cores por tema, lidas no render.** Os macros mantêm o código de cor do produto
(no escuro, proteína `#6ea3ff`, carboidrato `#2ce500`, gordura `#ffb4ab`) e trocam
de tom no claro (ADR 041). As props que pedem string usam `colors.<token>` de
`src/theme/colors.ts`, que lê o tema que vale agora; copiar para constante de
módulo congelaria o tema do carregamento. Texto de erro usa `text-danger`.

**Design system v2 "Noite" (#368).** Paridade nova a conferir em aparelho:

- **Fontes:** Sora e Manrope pelo `@expo-google-fonts`, carregadas antes de esconder
  a splash. Uma família por peso (`font-sans-bold`, `font-display`…): o Android não
  sintetiza negrito em fonte própria. As telas antigas continuam na fonte do sistema
  até serem redesenhadas; os componentes novos já usam as famílias.
- **Tema:** Sistema/Escuro/Claro em Perfil → Aparência, guardado no `SecureStore`;
  `colorScheme.set` do NativeWind troca as variáveis do `global.css`, e a árvore
  remonta para as cores em JS (`colors`) acompanharem.
- **Swipe:** `SwipeRow` com `ReanimatedSwipeable` (RNGH 3.5) e as mesmas ações como
  ações de acessibilidade do leitor de tela. Na web, ponteiro + botão "Mais ações".
- **Painel lateral:** a folha abre como painel lateral de 480 px só na web (`md+`);
  no app é sempre folha de baixo.

---

## O que ainda precisa de aparelho

Este documento prova **cobertura**, não comportamento. O que só se confirma
rodando, e deve ser feito antes de publicar:

- [ ] Os números batem com o PWA para a mesma conta, no mesmo dia
- [ ] Hoje (#373): chip "Metas N/M" abrindo Metas de hoje, sino com e sem aviso novo, "+" da água com o toast, copo enchendo na folha de água (Ontem/Hoje, lixeira), − e + do peso com o traço se desenhando, e Compartilhar meu dia pelo WhatsApp e pela folha do sistema
- [ ] Login, refresh e logout nos dois sistemas, com o token saindo do cofre
- [ ] Sheet de busca de alimento com o teclado aberto em tela pequena (iPhone SE)
- [ ] Estrela de favorito e "Concluir · N itens" no sheet de busca (toque de 44 pt, leitor de tela)
- [ ] Chips de medida caseira, botões − e + (44 pt) e "Nova medida" com o teclado aberto no sheet
- [ ] Formulário de alimento no sheet com o teclado numérico aberto (vírgula decimal), e "Cadastrar à mão" do scanner abrindo o cadastro com o código lido
- [ ] Aba Rótulo do leitor no Expo Go: foto e galeria, valores lidos no formulário, Free vendo o PRO; código vinculado abrindo direto na quantidade (#375)
- [ ] Botão "Ler código de barras" do sheet de busca abrindo o scanner no mesmo dia e tipo, e "Guardar em Meus alimentos" fazendo o produto aparecer na busca
- [ ] "Mais ações" da refeição (copiar, salvar) e "Copiar dia": setas do dia de destino e "Ver dia" trocando a data da tela
- [ ] Dia de água, peso e passos: seta "Próximo dia" apagada em hoje, e o registro de ontem aparecendo na lista com a data certa
- [ ] Barra nova (#369): cinco abas com o nome no TalkBack/VoiceOver, a aba acesa certa em Metas/Perfil/Progresso (Você) e no painel (Comunidade); o botão da IA abrindo o menu, o "voltar" do Android fechando-o, o treino retomando a sessão aberta; o anel e o selo com uma conversa pensando e outra esperando; "Gravar assim" no cartão; a barra do treino com o "+30 s" fora da sessão e a notificação do descanso seguindo ao sair dela
- [ ] Barra de topo: área segura no iPhone com notch, título longo com reticências, ações à direita com 44 pt, "voltar" subindo pelo mapa até o Início (inclusive aberto por link direto) e a sessão de treino perguntando antes de sair
- [ ] Assistente de primeira vez: conta nova cai nele, "Pular por agora" não volta a perguntar, e "Recalcular com meus dados" volta às metas
- [ ] "Desfazer" do aviso no rodapé: apagar água/peso/passos no sheet e item na timeline, tocar em Desfazer dentro de 5 s e o registro voltar (o aviso tem de ficar acima do sheet e da barra)
- [ ] Meu plano (dev build com `EXPO_PUBLIC_REVENUECAT_*` e conta de teste da loja): pacotes com o preço da loja, compra virando PRO na hora (`revenuecat/sync`), "Restaurar compras", "Gerenciar na loja", e a câmera da Nutrição saindo do cadeado
- [ ] Logout trocando a conta da RevenueCat (`Purchases.logOut`) e o login seguinte com outra pessoa não herdando a compra
- [ ] Convite: `fatia://c/<token>` abrindo a tela do convite; deslogado, entrar e voltar ao convite (inclusive fechando o app no meio do login e passando pelo assistente)
- [ ] Link universal (`APP_LINKS_HOST` no build, `APPLE_TEAM_ID`/`ANDROID_CERT_SHA256` na web): `https://<app>/c/<token>` abrindo o app em vez do navegador
- [ ] Comunidade: checkboxes do consentimento com leitor de tela (estado marcado anunciado), "Entrar com código" com o teclado aberto no sheet, e "Sair" voltando à lista
- [ ] Painel da comunidade (conta da equipe): abas no topo rolando sem cortar, "Aprovar" e "Gerenciar" com 44 pt, `Alert` de papel e assento, `Share` do link de convite e do código, lote colado com o teclado aberto, e o "voltar" do painel levando à comunidade
- [ ] Planos e dicas: escolher imagem da galeria (iPhone com HEIC e Android sem tipo), ver a capa depois de enviar, publicar um treino e adotá-lo com outra conta, e o link de uma dica abrindo no navegador
- [ ] Exercícios da comunidade: enviar um vídeo MOV de iPhone e um MP4 de Android (com a barra de progresso andando e o app em primeiro plano), até 4 fotos de uma vez, "Assistir" abrindo o vídeo assinado, e "Na minha academia" nos seletores de exercício
- [ ] Agente da comunidade: trocar o avatar pela galeria, salvar ligado e conferir no chat da web que o agente aparece para um membro
- [ ] Desafios: marcar pelo painel (hoje, 7 dias), entrar com outra conta com apelido, ver a própria linha no ranking, puxar para atualizar, sair pelo `Alert` e encerrar pelo painel
- [ ] Mural: publicar com 2 imagens da galeria (iPhone com HEIC), reagir, comentar com o teclado aberto, denunciar pelo `Alert`, e a dona removendo e restaurando pela Moderação
- [ ] Avisos (build com `EAS_PROJECT_ID` e API com `PUSH_ENABLED=true`): ligar em Perfil → Notificações (diálogo do sistema no iOS e no Android 13+), receber o comentário de outra conta com o app fechado e em primeiro plano, o toque abrindo o mural, negar a permissão e ver "Abrir configurações", e sair da conta parando os avisos
- [ ] Chat: pergunta com resposta chegando aos pedaços, trocar de aba no meio e ver o anel do botão da IA girando, voltar e ver a resposta; mandar o app para o segundo plano no meio e voltar (a resposta continua de onde estava); "Parar resposta"
- [ ] Chat: confirmar uma escrita (registrar refeição) com o resumo, responder uma pergunta do assistente, foto pela câmera e pela galeria, ditado (diálogo do microfone na primeira vez, recusar e ver o aviso), memórias e apagar uma
- [ ] Chat com o app fechado (dev build com push): mandar pergunta, fechar o app e receber "Sua resposta está pronta."; o toque abre a conversa
- [ ] Cores dos macros e de erro (`apps/mobile/src/theme/colors.ts`) iguais às do PWA lado a lado
- [ ] Diagrama muscular destacando os grupos certos
- [ ] Aparelho de entrada, não só simulador — os gráficos são o ponto a observar
- [ ] Leitor de tela e fonte ampliada nos dois sistemas
- [ ] Estados de erro, vazio e carregamento comparados lado a lado com o PWA

## Redesign (#367) — o que muda para a paridade

O redesign refaz as duas pontas a partir do mesmo canvas. Até cada issue entrar, as tabelas acima
descrevem o código de hoje; o que já está decidido:

- **Toda tela do redesign entra com o par app/PWA no mesmo PR.** A issue de cada tela lista as
  superfícies; uma tela só num cliente é pendência e entra aqui como linha sem ✅.
- **Navegação** ([ADR 040](./ADR/040-navegacao-com-aba-hoje-e-botao-da-ia.md), revisada; #369):
  cinco abas — Hoje, Nutrição, Treino, Comunidade e **Você** — e o botão da IA, nos dois (entregue
  na #369). A rota **Você** (tela única com seções) substituiu o drawer "Mais" do PWA e o menu do
  app; o **painel da
  equipe** passa a abrir dentro da aba Comunidade ("Mural | Painel"), no app (`org/[groupId]`) e no
  PWA (`(org)/org/[groupId]`). A fonte continua `navigation.ts`.
- **Tema claro nos dois** ([ADR 041](./ADR/041-tema-claro.md); #368): o bloco claro de
  `globals.css` e de `global.css` tem os mesmos nomes e valores, conferidos pelo `palette.test.ts`;
  a escolha Sistema/Escuro/Claro fica no aparelho (`localStorage` no PWA, armazenamento local no
  app).
- **Cores dos macros** continuam as mesmas nos dois e citadas aqui pelo hex de `apps/mobile/src/theme/colors.ts`; a troca
  da proteína para o tom do canvas vem com os tokens da #368.
- **Dados novos** de cada tela e a issue que os cria: [`DADOS_REDESIGN.md`](./DADOS_REDESIGN.md).

## Como manter

O que sustenta este documento:

1. `apps/mobile/src/theme/__tests__/palette.test.ts` — compara token a token a
   paleta do app com a do PWA. Mudar o verde da marca num lado só quebra aqui.
2. `packages/api-client` — os dois apps falam com a API pelo mesmo código, então
   uma rota nova não pode existir num cliente e não no outro.
3. `pnpm --filter @fatia/mobile build` no CI — `expo export` pega import quebrado
   antes de alguém instalar o app.
