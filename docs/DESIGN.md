# Design — PWA e app nativo

O sistema visual e de interação do Fatia, como está no código. O PWA (`apps/web`) e o app
nativo (`apps/mobile`) seguem o mesmo desenho; as diferenças estão em
[`MOBILE_PARITY.md`](./MOBILE_PARITY.md).

## Princípios

1. **Registrar sem IA em até 2 toques.** O plano Free não tem IA no app
   ([ADR 024](./ADR/024-plano-free-e-pago-do-usuario.md)), então o registro manual é o caminho principal, não a
   correção. Todo registro sai do "+" da barra ("Registrar"), de qualquer tela.
2. **Celular primeiro, desktop de verdade.** O desenho nasce em 390 px; no desktop (`md`, 768 px)
   a barra de baixo vira uma barra lateral e o conteúdo fica numa coluna centralizada, em vez do
   celular esticado.
3. **Só tema escuro.** Uma paleta, testada para contraste.
4. **Tudo que o app faz, o MCP faz.** Cada função nova tem tool equivalente
   ([`MCP.md`](./MCP.md)), para quem traz a própria IA.
5. **Desfazer em vez de perguntar, quando refazer é barato.** Registros pequenos apagam na hora e
   oferecem "Desfazer"; o que é caro de refazer pede confirmação.

## Paleta e tokens

Os tokens vivem em `apps/web/src/app/globals.css` e `apps/mobile/global.css`, com os mesmos
valores (HSL sem `hsl()`), e viram classes nos dois `tailwind.config`. Dois testes guardam a
paridade: `apps/mobile/src/theme/__tests__/palette.test.ts` (o mobile não tem token que o PWA
não tenha, e os comuns batem) e `cores.test.ts` (os hex de `src/theme/cores.ts`, usados onde o
React Native não aceita classe, batem com o HSL).

| Token               | Hex                | Uso                                                                 |
| ------------------- | ------------------ | ------------------------------------------------------------------- |
| `background`        | `#131313`          | fundo das telas                                                     |
| `card`              | `#2a2a2a`          | cartões e linhas de lista                                           |
| `muted`             | `#1f1f1f`          | trilhos de barra, chips, campos                                     |
| `foreground`        | `#e5e2e1`          | texto principal; barra de kcal                                      |
| `muted-foreground`  | `#baccaf`          | texto secundário, ícones inativos                                   |
| `primary`           | `#2ce500`          | marca, ação principal, aba ativa, "dentro da meta"                  |
| `destructive`       | `#93000a`          | **só fundo** de botão perigoso                                      |
| `danger`            | `#fb7185`          | texto e ícone de erro, barra "fora da meta"                         |
| `warning`           | `#fbbf24`          | aviso, "perto do limite", favorito                                  |
| `success`           | `#10b981`          | confirmação pontual ("Meta batida", "copiado")                      |
| `protein`           | `#4b8eff`          | proteína em todo gráfico e barra                                    |
| `carbs`             | `#2ce500`          | carboidrato                                                         |
| `fat`               | `#ffb4ab`          | gordura                                                             |
| `water`             | `#60a5fa`          | hidratação                                                          |
| `border` / `subtle` | `#333` / branco 5% | borda de campo / borda de cartão (só no PWA; o nativo usa `border`) |

Regras:

- **Texto de erro é `text-danger`, nunca `text-destructive` nem `text-rose-*`.** O `destructive`
  sobre o fundo escuro fica abaixo de 2:1; o `danger` passa de 5:1 sobre o `card`.
- **Macros têm cor fixa** no produto inteiro: proteína azul, carboidrato verde, gordura salmão.
  As kcal ficam neutras (`foreground`) para não se confundirem com nenhum.
- Cor literal (`#…`, `text-rose-500`, `bg-[#…]`) em componente é defeito: vira token ou sai.
  No nativo, onde a prop pede string, use `cores.<token>` de `src/theme/cores.ts`.

## Tipografia e espaçamento

- **Inter** (`font-sans`) no corpo; **Plus Jakarta Sans** (`font-jakarta`) nos títulos grandes.
- Número que muda (kcal, peso, séries) usa `tabular-nums`, para não pular de largura.
- Escala usada: título de tela `text-3xl font-extrabold`, título de cartão `text-[18px]
font-semibold`, corpo `text-sm`, legenda `text-xs`. Rótulo da barra: 11 px, o mínimo.
- Telas com `px-5`; cartões `rounded-xl p-5`; espaço entre cartões `space-y-5`.

## Navegação

Fonte única: `packages/api-client/src/navigation.ts` (`PRIMARY_TABS`, `menuSections`,
`activeNavKey`), com teste. Web e app montam a partir dela.

```
┌──────────────────────────────────────────┐
│                conteúdo                  │
├──────────────────────────────────────────┤
│ Início · Nutrição · [ + ] · Treino · Mais│
└──────────────────────────────────────────┘
```

- **Barra de baixo** (celular): três abas, o **"+" Registrar** no centro e **Mais**.
  - O "+" abre o menu Registrar: refeição (tipo pela hora), água, peso, passos e treino (retoma
    a sessão aberta). Ver `quick-add.ts` do api-client.
  - "Mais" fica ativo em qualquer tela fora das três abas e abre o drawer **Menu**: o cartão do
    perfil e as seções **Você** (Progresso, Metas do dia, Metas pessoais, Recordes, Perfil),
    **Registros** (Meus alimentos, Nutrientes, Planos, Histórico) e **IA** ("Chat com a IA", só
    no PWA e só quando `/chat/availability` diz que há IA; "Conectar sua IA", sempre).
- **Barra lateral** (desktop, `md+`): logo, botão "Registrar", as três abas e as seções do menu
  à vista. A barra de baixo some; o conteúdo ganha `md:pl-64` e fica em `max-w-3xl`.
- **Metas a um toque:** o pill "Metas" no Início e "Metas do dia" no primeiro nível do menu.
- **Primeira vez:** quem ainda não tem `onboardedAt` vai para `/onboarding` (objetivo, dados,
  atividade, metas sugeridas por Mifflin-St Jeor). "Recalcular com meus dados" em Metas do dia
  refaz o assistente.

## Drawers

Todo formulário curto é drawer de baixo (vaul no PWA, gorhom bottom-sheet no nativo).

- No desktop o drawer fica centralizado com `md:max-w-lg`, em vez de ocupar a largura toda.
- No nativo o sheet não é portal: drawer fica dentro de `<DrawerLayer>`, irmão do `<Screen>`
  (ver o cabeçalho de `apps/mobile/src/components/ui/drawer.tsx`).
- Listas dentro de drawer usam `data-vaul-no-drag` (PWA) ou `DrawerScrollView` (nativo), para a
  rolagem não fechar o sheet.

## Estados

| Estado     | PWA                                               | Nativo                      |
| ---------- | ------------------------------------------------- | --------------------------- |
| Carregando | `ui/skeleton.tsx` no formato do conteúdo          | `LoadingState`              |
| Vazio      | `ui/empty-state.tsx` (ícone, título, texto, ação) | `EmptyState`                |
| Erro       | mensagem em `text-danger` + "Tentar novamente"    | `ErrorState`                |
| Aviso      | `toast` do `sonner` (`ui/toaster.tsx`)            | `useToast` (`ui/toast.tsx`) |

Estado vazio sempre diz o que fazer a seguir ("Toque em + para registrar a primeira refeição").

### Desfazer e confirmar

- **Desfazer (5 s, `UNDO_MS`):** água, peso, passos e item de refeição apagam na hora e mostram
  "… apagado · Desfazer". Desfazer recria o registro a partir do retrato tirado antes de apagar
  (`packages/api-client/src/undo.ts`): mesmo dia ou instante, mesmos valores, o item na mesma
  refeição. A medida caseira do item não volta (as gramas sim).
  - No PWA, dentro de drawer o "Desfazer" fica na própria lista (`LogHistory`, `useUndoSlot`):
    o drawer é modal e deixa a página inerte, então um `toast` fora dele não recebe toque. Fora
    de drawer (item da refeição) é o `toast` do `sonner`.
  - No app nativo é sempre o `useToast`, que fica acima dos sheets.
- **Confirmar:** refeição inteira, plano, sessão de treino, alimento próprio, meta, conta.

## Acessibilidade

- **Alvos de toque de 44 px.** `Button` `default`/`icon` têm 40 px visíveis e os tamanhos `sm`
  e `icon-sm` ganham área invisível até 44 px (`after:-inset-*`), sem mudar o visual. Botões
  crus pequenos usam a utilidade `.alvo-toque`. No nativo, `min-h-11` ou `hitSlop`.
- **Foco visível:** `ring-2` com `ring-offset` no `Button`, e regra base de `:focus-visible`
  para `a`, `button` e `[role=button]` em `globals.css`.
- **Rótulos:** todo campo tem `<label>` ou `aria-label`; botão só com ícone tem `aria-label`
  com o objeto ("Apagar registro de 500 mL, 13 out").
- **Contraste:** AA. É o motivo do `danger` e de nenhum texto abaixo de 11 px.
- **Verificação automática:** `e2e/tests/a11y.spec.ts` roda o axe nas telas, no menu e no
  Registrar, em celular e desktop, e falha em violação `serious`/`critical`.

## Antes e depois (Playwright)

Mudança de UI se fotografa antes e depois ([ADR 029](./ADR/029-playwright-com-logto-real.md)):

```bash
pnpm ui:snap 22-antes-nav      # antes de mexer
pnpm ui:snap 23-nav            # depois
pnpm ui:compare 22-antes-nav 23-nav   # HTML lado a lado em e2e/screenshots/
```

O `ui:snap` roda todos os specs (telas, fluxos e axe) com o usuário demo; os fluxos desfazem o
que criam.
