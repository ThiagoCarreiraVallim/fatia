# Paridade entre o app nativo e o PWA

> Entregável da issue #130, última sub-issue da épica [#132](https://github.com/ThiagoCarreiraVallim/fatia/issues/132).
>
> Existe porque paridade é fácil de **achar** que se tem e difícil de provar. Uma
> linha vazia aqui é uma pendência silenciosa, que é o que este documento serve
> para impedir.

**Alvo:** o estado da `main` no momento da abertura da épica — 18 rotas e 57
componentes em `apps/web`. Paridade significa: qualquer coisa que a pessoa faz
hoje em `app.fat.ia.br`, ela faz no app nativo.

**Estado:** 15 de 15 rotas de aplicação replicadas, 3 fora de propósito.
Nenhum placeholder restante no código.

## Legenda

|     |                                          |
| --- | ---------------------------------------- |
| ✅  | replicado                                |
| ➕  | existe no mobile e **não** existe no PWA |
| ⛔  | fora de propósito, com motivo registrado |

---

## Rotas

| PWA                                | App nativo                                 |     | Observação                                                                  |
| ---------------------------------- | ------------------------------------------ | :-: | --------------------------------------------------------------------------- |
| `(app)/page.tsx`                   | `app/(app)/index.tsx`                      | ✅  | dashboard                                                                   |
| `(app)/goals`                      | `app/(app)/goals.tsx`                      | ✅  |                                                                             |
| `(app)/nutrition`                  | `app/(app)/nutrition/index.tsx`            | ✅  |                                                                             |
| `(app)/nutrition/goals`            | `app/(app)/nutrition/goals.tsx`            | ✅  |                                                                             |
| `(app)/nutrition/nutrient-targets` | `app/(app)/nutrition/nutrient-targets.tsx` | ✅  |                                                                             |
| —                                  | `app/(app)/nutrition/scan.tsx`             | ➕  | scanner de código de barras (#140); o PWA não tem, ver abaixo               |
| `(app)/profile`                    | `app/(app)/profile/index.tsx`              | ✅  |                                                                             |
| `(app)/profile/connect`            | `app/(app)/profile/tokens.tsx`             | ⚠️  | o PWA virou fluxo guiado (#164); o nativo ainda é a tela antiga, ver abaixo |
| `(app)/progress`                   | `app/(app)/progress/index.tsx`             | ✅  |                                                                             |
| `(app)/progress/records`           | `app/(app)/progress/records.tsx`           | ✅  |                                                                             |
| `(app)/workout`                    | `app/(app)/workout/index.tsx`              | ✅  | a sessão ativa vira aviso com "Continuar treino" em vez de tomar a tela     |
| `(app)/workout/history`            | `app/(app)/workout/history.tsx`            | ✅  |                                                                             |
| `(app)/workout/plans`              | `app/(app)/workout/plans/index.tsx`        | ✅  |                                                                             |
| `(app)/workout/plans/[id]`         | `app/(app)/workout/plans/[id].tsx`         | ✅  |                                                                             |
| `(app)/workout/quick/[templateId]` | `app/(app)/workout/quick/[templateId].tsx` | ✅  |                                                                             |
| `(app)/workout/session/[id]`       | `app/(app)/workout/session/[id].tsx`       | ✅  | uma rota para sessão ativa e concluída — o treino termina durante a visita  |
| `(auth)/login`                     | `app/login.tsx`                            | ✅  | navegador do sistema em vez de redirect no servidor                         |
| `(public)/privacy`                 | —                                          | ⛔  | abre no navegador; ver "Fora de propósito"                                  |
| `(public)/terms`                   | —                                          | ⛔  | idem                                                                        |

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

### Dashboard — 6 de 6

| PWA                    | App nativo                       |     | Observação                                                        |
| ---------------------- | -------------------------------- | :-: | ----------------------------------------------------------------- |
| `next-workout-card`    | `dashboard/next-workout-card`    | ✅  |                                                                   |
| `nutrition-macro-card` | `dashboard/nutrition-macro-card` | ✅  | gradiente vira véu chapado (sem `expo-linear-gradient`)           |
| `quick-log-actions`    | `dashboard/quick-log-actions`    | ✅  | **corrigido**: o botão "Log Água" do PWA abria o drawer de passos |
| `steps-card`           | `dashboard/steps-card`           | ✅  |                                                                   |
| `streak-card`          | `dashboard/streak-card`          | ✅  | textos vêm do `@fatia/api-client` para os dois dizerem igual      |
| `water-card`           | `dashboard/water-card`           | ✅  | erro do atalho é exibido; no PWA some                             |
| —                      | `dashboard/macro-bar`            | ➕  | o alvo aqui é único, não faixa mín–máx como em nutrição           |

### Nutrição — 10 de 10, mais 3 do scanner

| PWA                     | App nativo                         |     | Observação                                                                          |
| ----------------------- | ---------------------------------- | :-: | ----------------------------------------------------------------------------------- |
| `calories-ring-card`    | `nutrition/calories-ring-card`     | ✅  | anel em `react-native-svg`                                                          |
| `date-navigator`        | `nutrition/date-navigator`         | ✅  | data em estado, não na URL — senão o voltar do Android percorreria o calendário     |
| `edit-meal-item-drawer` | `nutrition/edit-meal-item-drawer`  | ✅  |                                                                                     |
| `food-search-drawer`    | `nutrition/food-search-drawer`     | ✅  | replica o que o teste do web documenta (debounce, formulário manual, 2+ caracteres) |
| `macro-bar`             | `nutrition/macro-bar`              | ✅  |                                                                                     |
| `macro-bento-grid`      | `nutrition/macro-bento-grid`       | ✅  |                                                                                     |
| `meal-list`             | `nutrition/meal-list`              | ✅  | portado; nenhuma rota usa, igual ao web                                             |
| `meal-timeline`         | `nutrition/meal-timeline`          | ✅  |                                                                                     |
| `nutrient-targets-card` | `nutrition/nutrient-targets-card`  | ✅  |                                                                                     |
| `weekly-trend-chart`    | `nutrition/weekly-trend-chart`     | ✅  | barras em `react-native-svg`                                                        |
| —                       | `nutrition/barcode-camera`         | ➕  | `expo-camera` (o `expo-barcode-scanner` foi descontinuado)                          |
| —                       | `nutrition/scanned-product-drawer` | ➕  | produto do Open Food Facts + atribuição ODbL na própria tela (ADR 017)              |
| —                       | `nutrition/barcode`                | ➕  | lógica pura do scanner: trava de leitura repetida, porção, ficha incompleta         |

### Treino — 13 de 13

| PWA                      | App nativo                              |     | Observação                                                                   |
| ------------------------ | --------------------------------------- | :-: | ---------------------------------------------------------------------------- |
| `add-exercise-drawer`    | `workout/add-exercise-drawer`           | ✅  |                                                                              |
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

### Progresso — 12 de 12

| PWA                              | App nativo                        |     | Observação                                         |
| -------------------------------- | --------------------------------- | :-: | -------------------------------------------------- |
| `cardio-chart`                   | `progress/cardio-chart`           | ✅  |                                                    |
| `consistency-card`               | `progress/consistency-card`       | ✅  |                                                    |
| `exercise-picker-drawer`         | `progress/exercise-picker-drawer` | ✅  |                                                    |
| `log-steps-drawer`               | `progress/log-steps-drawer`       | ✅  | editar e apagar nos dois (#116)                    |
| `log-water-drawer`               | `progress/log-water-drawer`       | ✅  | idem                                               |
| `log-weight-drawer`              | `progress/log-weight-drawer`      | ✅  | idem                                               |
| `personal-records`               | `progress/personal-records`       | ✅  |                                                    |
| `steps-chart`                    | `progress/steps-chart`            | ✅  |                                                    |
| `strength-chart`                 | `progress/strength-chart`         | ✅  |                                                    |
| `training-intensity`             | `progress/training-intensity`     | ✅  |                                                    |
| `weight-chart`                   | `progress/weight-chart`           | ✅  |                                                    |
| `WeightBarMini` (dentro da page) | `progress/weight-mini-bars`       | ✅  | extraído para arquivo próprio                      |
| `log-history`                    | `progress/log-history`            | ✅  | lista de registros recentes, base do editar/apagar |

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

### Layout e UI base — 10 de 10

| PWA                   | App nativo          |     | Observação                                             |
| --------------------- | ------------------- | :-: | ------------------------------------------------------ |
| `layout/bottom-nav`   | `layout/bottom-nav` | ✅  | mesmos 5 destinos, mesma ordem, com safe area          |
| `layout/top-bar`      | `layout/top-bar`    | ✅  | ganha seta de voltar — no navegador ela é do navegador |
| `ui/button`           | `ui/button`         | ✅  | todos os tamanhos com 44pt mínimos                     |
| `ui/card`             | `ui/card`           | ✅  |                                                        |
| `ui/carousel` (embla) | `ui/carousel`       | ✅  | `FlatList` paginada                                    |
| `ui/drawer` (vaul)    | `ui/drawer`         | ✅  | `@gorhom/bottom-sheet`                                 |
| `ui/form`             | `ui/form`           | ✅  | rótulo vira `accessibilityLabel`, não `<label for>`    |
| `ui/input`            | `ui/input`          | ✅  |                                                        |
| `ui/label`            | `ui/label`          | ✅  |                                                        |
| `ui/tabs`             | `ui/tabs`           | ✅  | implementação própria, sem `pager-view`                |
| —                     | `ui/state`          | ➕  | carregamento, erro e vazio centralizados               |
| —                     | `layout/screen`     | ➕  | moldura com safe area e pull-to-refresh                |
| `legal-doc`           | —                   | ⛔  | só serve às rotas legais, que abrem no navegador       |

---

## Fora de propósito

| O quê                                               | Por quê                                                                                                                                                                                   |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pwa-install-prompt`, `pwa-register`, `sw-register` | são o PWA se instalando e se atualizando. O app nativo já **é** instalado; a atualização vem da loja                                                                                      |
| Rotas `/privacy` e `/terms`                         | abrem no navegador do sistema (`expo-linking`). Reimplementá-las criaria duas cópias do mesmo texto legal, que divergem no primeiro ajuste — e é justamente o texto que não pode divergir |
| Paridade offline                                    | o PWA tem service worker; o app não tem equivalente nesta épica, por decisão da épica                                                                                                     |
| Notificação local do fim do descanso                | `expo-notifications` não entrou. Com o app em segundo plano o háptico só dispara na volta ao primeiro plano. Vale issue própria                                                           |

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
| Scanner de código de barras                       | #140 — e não é escolha: o PWA depende de `BarcodeDetector`, que o Safari não tem       |

**Correção que volta para o PWA:** o botão "Log Água" do dashboard, com ícone de
gota e rótulo de água, abria o drawer de **passos**. Corrigido nos dois.

**Ganho que voltou para o PWA:** editar e apagar registro de peso, passos e água
(#116) nasceu aqui e foi portado de volta na direção inversa da habitual. O
`log-history` do web é o mesmo componente traduzido para DOM, com uma diferença:
a confirmação de exclusão é inline na própria linha, não um diálogo do sistema —
`ui/` não tem `alert-dialog`, e um `window.confirm` sobre um sheet do vaul rouba
o foco e, no iOS instalado como PWA, aparece com o nome do domínio.

**Reordenar exercício do plano saiu desta tabela (#183).** Estava listada como
ganho do mobile — "existe na API e no MCP, não no PWA". Era falso: o PWA
reordena desde a #115. Reordenava pior, com dois PATCH concorrentes no mesmo
tick, mas reordenava. Hoje os dois apps usam o mesmo
`workoutApi.reorderPlanExercises`, numa escrita atômica só. A nova posição
também é anunciada nos dois — `announceForAccessibility` no nativo, uma região
`role="status" aria-live="polite"` no PWA — e nos dois o anúncio sai depois da
resposta: dito no toque, ele afirmaria um movimento que a rede ainda pode
recusar.

**Ganho que hoje é do PWA: o otimismo da reordenação (#115).** No web o
`onMutate` troca os dois `order` no cache e o `onError` desfaz, então o card sai
do lugar no toque. O nativo não tem nada disso — `moveExercise` em
`apps/mobile/app/(app)/workout/plans/[id].tsx` só tem `onSuccess` e `onError`, e
o card fica parado até a resposta voltar. No 4G do vestiário, que é o cenário
que motivou a #115, o comportamento dos dois apps é diferente. A assimetria não
fechou: trocou de lado.

---

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
