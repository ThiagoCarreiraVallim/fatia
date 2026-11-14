# Design — PWA, painel, app nativo e site

O sistema visual e de interação do Fatia: o **design system v2 "Noite"** (#368). Fundo grafite,
verde Fatia, números grandes, pouco texto. O PWA (`apps/web`, que também serve o painel da
comunidade), o app nativo (`apps/mobile`) e o site (`apps/site`) seguem o mesmo desenho; as
diferenças entre web e app estão em [`MOBILE_PARITY.md`](./MOBILE_PARITY.md).

A fonte única dos valores é o pacote **`@fatia/design`** (`packages/design`): tokens dos dois
temas, contraste, validação da cor da comunidade, mapa de ícones e movimento. Os três CSS repetem
os tokens em HSL e o teste `packages/design/src/__tests__/css-parity.test.ts` confere os três
contra `tokens.ts`. A referência visual são as pranchas do canvas (Main, Componentes,
Componentes-plano e Movimento); quando o canvas e este documento divergem, vale o canvas e este
documento é corrigido.

## Princípios

1. **Um número por bloco.** O dado vem primeiro e grande (Sora); o rótulo vem pequeno embaixo.
2. **Ícone no lugar de frase.** Explicação só no primeiro uso ou no estado vazio.
3. **Registrar em 1 toque.** O botão + abre tudo; atalhos com valores prontos. O Free não tem IA
   no app ([ADR 024](./ADR/024-plano-free-e-pago-do-usuario.md)), então o registro manual é o
   caminho principal.
4. **Movimento que informa.** Anéis enchem, barras crescem, folhas sobem. Nada decorativo, e nada
   anda com "reduzir movimento".
5. **Desfazer em vez de perguntar, quando refazer é barato.** Registros pequenos apagam na hora
   e oferecem "Desfazer"; o que é caro de refazer pede confirmação numa folha curta.
6. **Tudo que o app faz, o MCP faz.** Cada função nova tem tool equivalente
   ([`MCP.md`](./MCP.md)), para quem traz a própria IA.

## Tema: escuro, claro e a escolha da pessoa

Pela [ADR 041](./ADR/041-tema-claro-com-escolha-do-usuario.md) o produto tem os dois temas, com
os **mesmos nomes de token**. O padrão é seguir o sistema; a pessoa escolhe **Sistema, Escuro ou
Claro** em Perfil → Aparência. A escolha é preferência de interface, guardada no aparelho
(`localStorage` na web, `SecureStore` no app, chave `fatia.theme`), nunca na conta.

- **Web e painel:** o `<html>` recebe `data-theme` (tema resolvido) de um script inline no
  `<head>` (`src/lib/theme-script.ts`), antes da pintura, sem piscar. O CSS tem o escuro em
  `:root`, o claro em `:root[data-theme='light']` e de novo sob
  `@media (prefers-color-scheme: light)` em `:root:not([data-theme='dark'])` (para quem está sem
  JS). `dark:` do Tailwind vale com `[data-theme="dark"]`. O `theme-color` do navegador acompanha.
- **App:** `colorScheme.set` do NativeWind troca as variáveis do `global.css` (no app o
  escuro fica sob `@media (prefers-color-scheme: dark)`, o único bloco que o NativeWind reconhece); `colors` de `src/theme/colors.ts` lê o tema que vale
  agora. `userInterfaceStyle: 'automatic'`; a barra de status e a do sistema seguem o tema.
- **Site:** segue o sistema, sem seletor.

## Paleta e tokens

Os nomes são os do shadcn que o código já usava, mais os novos do canvas. Mapa do canvas:
`bg → background`, `s1 → muted`, `s2 → card` (escuro), `s3 → surface-3`, `line → border`,
`line2 → border-strong`, `tx → foreground`, `tx2 → muted-foreground`, `tx3 → faint-foreground`,
`lime → primary`, `ink → primary-foreground`, `bad → danger`, `warn → warning`.

No claro o cartão é branco (o `s1` do canvas) sobre o fundo `#f4f5f2`: é onde as cores de dado
passam 4,5:1. No escuro o cartão continua `#2a2a2a`.

| Token                | Escuro    | Claro     | Uso                                                            |
| -------------------- | --------- | --------- | -------------------------------------------------------------- |
| `background`         | `#131313` | `#f4f5f2` | fundo das telas                                                |
| `muted`              | `#1f1f1f` | `#eceee9` | campos, chips, trilhos                                         |
| `card`               | `#2a2a2a` | `#ffffff` | cartões e linhas de lista                                      |
| `surface-3`          | `#343434` | `#e1e4dd` | segmento ativo, trilho de anel e barra, esqueleto              |
| `border`             | `#383838` | `#e1e4dd` | linha entre itens, borda de campo                              |
| `border-strong`      | `#3d3d3d` | `#cdd1c8` | contorno de botão, check vazio, alça da folha                  |
| `foreground`         | `#e5e2e1` | `#141613` | texto principal                                                |
| `muted-foreground`   | `#baccaf` | `#4f544b` | texto secundário                                               |
| `faint-foreground`   | `#9aa593` | `#646a60` | rótulo pequeno, sobretítulo, ícone inativo                     |
| `primary`            | `#2ce500` | `#2ce500` | verde da marca: **só superfície** (botão principal, anel, aba) |
| `primary-foreground` | `#0b1a05` | `#0b1a05` | texto sobre o verde                                            |
| `primary-text`       | `#2ce500` | `#1a7f00` | verde como texto ou ícone (`text-primary` usa este)            |
| `kcal`               | `#e5e2e1` | `#141613` | kcal, neutra para não se confundir com macro                   |
| `protein`            | `#6ea3ff` | `#2563eb` | proteína em todo gráfico e barra                               |
| `carbs`              | `#2ce500` | `#1a7f00` | carboidrato                                                    |
| `fat`                | `#ffb4ab` | `#b93a2e` | gordura                                                        |
| `water`              | `#60a5fa` | `#1a66c2` | hidratação                                                     |
| `steps`              | `#2dd4bf` | `#0e7468` | passos                                                         |
| `ok`                 | `#2ce500` | `#1a7f00` | "na meta"                                                      |
| `info`               | `#60a5fa` | `#1a66c2` | informação neutra                                              |
| `warning`            | `#fbbf24` | `#8a5a00` | aviso, "perto do limite", "pendente"                           |
| `danger`             | `#fb7185` | `#b42318` | texto e ícone de erro, "em risco"                              |
| `success`            | `#10b981` | `#0b7a50` | confirmação pontual                                            |
| `destructive`        | `#93000a` | `#b42318` | **só fundo** de botão perigoso                                 |
| `brand`              | `#ff7a1a` | `#ff7a1a` | cor da comunidade (padrão), ver abaixo                         |
| `brand-foreground`   | `#1f0e00` | `#1f0e00` | texto sobre a cor da comunidade                                |

Os tons de `warning`, `danger`, `success` e `destructive` do claro não vinham no canvas: são os
mais próximos dos do escuro que passam 4,5:1 e pedem revisão de design.

Translúcidos (só web, `hsl(var(--x))` já com alfa): `border-subtle`, `primary-soft` e
`brand-soft`.

Regras:

- **Texto sobre superfície passa 4,5:1 nos dois temas.** O teste
  `packages/design/src/__tests__/tokens-contrast.test.ts` cobre texto e cores de dado sobre
  `background` e `card` (texto principal e secundário também sobre `muted` e `surface-3`).
- **Verde da marca nunca é texto no claro** (1,7:1 com branco). `text-primary` aponta para
  `primary-text`; no app, ícone e texto usam `colors.primaryText`.
- **Texto de erro é `text-danger`**, nunca `text-destructive`.
- **Macros têm cor fixa** no produto inteiro; a cor da comunidade nunca as substitui.
- Cor literal (`#…`, `text-rose-500`, `bg-[#…]`) em componente é defeito: vira token ou sai. No
  nativo, onde a prop pede string, use `colors.<token>` de `src/theme/colors.ts`, lido dentro do
  componente (nunca copiado para constante de módulo, que congelaria o tema).

### Cor da comunidade

`--brand`/`--brand-foreground`/`--brand-soft` (padrão `#ff7a1a`/`#1f0e00`) são trocados por
comunidade (`style` na web, `vars()` do NativeWind no app) e aparecem **só** em capa, aba ativa,
botão principal, convite, e-mail e card. Nunca em macros, estados, anéis ou barras.

O editor de marca (`components/org/brand-color-field.tsx`) e a API (`@IsBrandColor()`) usam a
mesma regra, `checkBrandColor` de `@fatia/design`:

- o texto é branco ou `#0b1a05`, o que passar 4,5:1;
- se nenhum passa, a cor é aceita com aviso e a sugestão do tom mais próximo que passa com
  folga (5,5:1, mesmo matiz em OKLab): o roxo `#7c5cff` (4,3:1) vira ≈ `#6a4ae0`;
- verde a menos de 0,1 de distância OKLab do `#2ce500` é recusado.

## Tipografia

- **Sora** (`font-display`) em números e títulos; **Manrope** (`font-sans`) no texto. Web:
  `next/font` em `app/layout.tsx`; site: `@fontsource-variable`; app: `@expo-google-fonts`,
  carregadas antes de esconder a splash, com uma família por peso (o Android não sintetiza peso
  em fonte própria; ver `src/theme/fonts.ts`).
- Escala (classe `text-<passo>` nos três Tailwind):

| Passo | Tamanho/peso | Uso                           |
| ----- | ------------ | ----------------------------- |
| `d1`  | 56/700 Sora  | o número do bloco principal   |
| `d2`  | 40/700 Sora  | número de bloco secundário    |
| `d3`  | 28/700 Sora  | número em card pequeno        |
| `h1`  | 28/700 Sora  | título da tela                |
| `h2`  | 22/700 Sora  | título de seção               |
| `h3`  | 17/600 Sora  | título de card, barra de topo |
| `b1`  | 15 Manrope   | texto                         |
| `b2`  | 13 Manrope   | texto secundário              |
| `eb`  | 12/700       | sobretítulo em caixa alta     |

- Número que muda (kcal, peso, séries) usa `tabular-nums`.

## Espaço e raios

- Espaço na escala de 4 do Tailwind (4, 8, 12, 16, 20, 24, 32, 48). Margem da tela 20; entre
  blocos 12–16; alvo de toque mínimo 44.
- Raios: `rounded-chip` 10 (chip, ícone), `rounded-field` 14 (campo e botão; `--radius` da web),
  `rounded-card` 20 (card), `rounded-sheet` 28 (folha), `rounded-pill` só em selo e interruptor.

## Movimento

Constantes em `packages/design/src/motion.ts`; web em `globals.css` (`.anim-*`) e no Tailwind
(`duration-fast|base|tab|sheet|data`, `ease-ds`, `ease-spring`); app em `src/theme/motion.ts`
(Reanimated com `ReduceMotion.System`).

| Nome  | Duração      | Onde                                                       |
| ----- | ------------ | ---------------------------------------------------------- |
| fast  | 150 ms       | toque, toggle, chip ativo; pressionar = escala .97         |
| base  | 300 ms       | troca de estado, fade, fundo da folha escurecendo          |
| tab   | 500 ms       | indicador de aba crescendo da esquerda                     |
| sheet | 550 ms       | folha subindo; lista em cascata (70 ms entre itens, 14 px) |
| data  | 1000–1300 ms | anel enchendo com contagem, barras (60 ms entre barras)    |

Curvas: `ease` `cubic-bezier(.2,.8,.2,1)`; `spring` `cubic-bezier(.34,1.56,.64,1)` em check,
medalha e toast. Respiração e pulso só em estado ativo (treino rodando, ranking ao vivo).
**Reduzir movimento** zera duração e atraso de tudo isso (testado no CSS e nos helpers do app).

## Ícones

Os 76 nomes do canvas (`alert` … `x`) mapeiam para o lucide em `packages/design/src/icons.ts`
(teste: cada um existe no `lucide-react` e no `lucide-react-native`). O WhatsApp é desenho
próprio no mesmo traço. Componente `Icon` nas duas pontas (`components/ui/icon.tsx`): traço 1,8,
24 px, cor herdada do texto, `aria-hidden` por padrão; quando o ícone é o único conteúdo de um
botão, o botão leva o nome (`aria-label`). O site usa `astro-icon` com `lucide:<nome>`.

## Componentes

Base (web em `apps/web/src/components/ui`, app em `apps/mobile/src/components/ui`):

- **Botões** 52 px (`size="xl"`), raio 14, pressionar = escala .97: primário, secundário,
  contorno, texto, apagar, adicionar, pequeno (44), mini (34), desativado, "Gerar com IA".
- **Seleção:** `Chip`, `Segmented`, `Switch`, `Checkbox` (mola ao marcar), `Tabs` com indicador.
- **Campos:** `Input` com foco em contorno verde e erro com ícone e texto `danger`;
  `PortionField` ("1½ = 37,5 g"); `Ruler` (peso, altura, porções).
- **Listas:** linha de 60 px; `SwipeRow` revela Editar/Apagar arrastando para a esquerda (some o
  lixo fixo). Sempre há alternativa sem gesto: o botão "Mais ações" (web) e as ações de
  acessibilidade (app).
- **Blocos de dado:** `StatBlock`, `Ring` (+ contagem), `DayStrip`, `Heatmap`.
- **Retorno:** toast que cai do topo (2,5 s sem ação, 5 s com "Desfazer"), `Banner` verde e de
  aviso, estados carregando (shimmer) / vazio / erro, selos (`Badge`, `PlanBadge`).
- **Folha inferior** substitui modal e gaveta: sobe em 550 ms, arrastar fecha, ações no fim; no
  desktop (`md+`) a mesma folha abre como **painel lateral de 480 px**. Confirmação vira folha
  curta com ícone + 1 linha.

Do plano (componentes que várias telas usam): marca da comunidade (`BrandCover`,
`CommunityTabs`), bloco PRO em 9 estados + compacto (estado vindo de `proBlockState` do
api-client), selo de plano, card compartilhável (sem peso, medida ou corpo; ADR 027) e folha
"Compartilhar" com "Aparecer como" (nome de exibição/@), aviso "recebido do seu personal" e o
painel "Gerar com IA" do painel (resultado sempre rascunho).

A galeria fica em `/design-system` na web e em `(app)/design-system` no app, só fora de produção.

## Navegação

A navegação nova segue a [ADR 040](./ADR/040-navegacao-com-aba-hoje-e-botao-da-ia.md) (revisada
em 14/11/2026): cinco abas só de ícone — **Hoje · Nutrição · Treino · Comunidade · Você** — e o
botão redondo da IA (68 px) à direita. O componente visual (`layout/bottom-nav.tsx`, variante
`v2`, e `layout/ai-button.tsx`) já existe; a troca da navegação é da #369. Até lá vale a barra
atual, descrita abaixo.

Fonte única: `packages/api-client/src/navigation.ts` (`PRIMARY_TABS`, `menuSections`,
`activeNavKey`, `ROUTES`/`routeInfo`), com teste. Web e app montam a partir dela.

- **Barra de topo** (`app-top-bar.tsx` no PWA, `layout/top-bar.tsx` no app) em toda tela menos o
  Início: `‹` à esquerda (`aria-label="Voltar para <pai>"`), o título (17 px) e as ações à
  direita. Voltar é hierárquico, pelo mapa `ROUTES`.
- **Barra de baixo** (celular, até a #369): Nutrição, Treino, o "+" Registrar no centro,
  Comunidade e Mais.
- **Barra lateral** (desktop, `md+`): logo, "Registrar", as abas e as seções do menu à vista.

## Folhas (drawers)

Todo formulário curto é folha de baixo (vaul no PWA, gorhom bottom-sheet no nativo).

- No desktop a folha abre à direita, com 480 px (`ui/drawer.tsx`).
- No nativo o sheet não é portal: a folha fica dentro de `<DrawerLayer>`, irmã do `<Screen>`.
- Listas dentro da folha usam `data-vaul-no-drag` (PWA) ou `DrawerScrollView` (nativo).

## Estados

| Estado     | PWA                                        | Nativo                      |
| ---------- | ------------------------------------------ | --------------------------- |
| Carregando | `ui/skeleton.tsx` (shimmer)                | `LoadingState`              |
| Vazio      | `ui/empty-state.tsx` (ícone, título, ação) | `EmptyState`                |
| Erro       | `ui/error-state.tsx` + "Tentar novamente"  | `ErrorState`                |
| Aviso      | `toast` do `sonner` (`ui/toaster.tsx`)     | `useToast` (`ui/toast.tsx`) |

Estado vazio sempre diz o que fazer a seguir ("Toque em + para registrar").

### Desfazer e confirmar

- **Desfazer (5 s, `UNDO_MS`):** água, peso, passos e item de refeição apagam na hora e mostram
  "… apagado · Desfazer" (`packages/api-client/src/undo.ts`).
- **Confirmar:** refeição inteira, plano, sessão de treino, alimento próprio, meta, conta — numa
  folha curta (ícone + 1 linha).

## Acessibilidade

- **Alvos de toque de 44 px**, sem mudar o desenho (`after:` invisível, `.alvo-toque`, `hitSlop`).
- **Foco visível:** `ring-2` no `Button` e regra base de `:focus-visible` em `globals.css`.
- **Rótulos:** todo campo tem rótulo; botão só com ícone tem `aria-label` com o objeto. As abas
  só de ícone têm nome e `aria-current`.
- **Contraste AA nos dois temas** (teste de tokens acima).
- **Gesto nunca é o único caminho:** swipe e arrastar a folha têm alternativa por botão/teclado.
- **Verificação automática:** `e2e/tests/a11y.spec.ts` roda o axe em celular e desktop, nos
  dois temas, e falha em violação `serious`/`critical`.

## Antes e depois (Playwright)

Mudança de UI se fotografa antes e depois ([ADR 029](./ADR/029-playwright-com-logto-real.md)),
nos dois temas (projetos `mobile`/`desktop` e `mobile-light`/`desktop-light`):

```bash
pnpm ui:snap 00-antes-ds       # antes de mexer
pnpm ui:snap 01-design-system  # depois
pnpm ui:compare 00-antes-ds 01-design-system
```
