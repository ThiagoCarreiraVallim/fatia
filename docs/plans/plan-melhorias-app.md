# Plano de Melhorias — Progresso, Nutrição e Treino + Metas Personalizadas

> **Status:** proposta / planejamento. Nada implementado ainda.
> **Princípio guia:** MCP-first (ver `docs/ARCHITECTURE.md` e ADR 006). Toda capacidade
> nova é desenhada como **service compartilhado** + **tool MCP** + **tela PWA** — nessa
> ordem de prioridade. Nenhuma lógica nova vai no controller REST nem na tool: vai no service.

Este documento cobre os 9 pedidos. Cada item tem: **sintoma**, **causa-raiz** (verificada no
código), **proposta**, **camada MCP**, **arquivos afetados**, **esforço** e **riscos**.

Legenda de esforço: 🟢 < 2h · 🟡 2–6h · 🔴 6h+ · ⏱️ estimativa.

---

## Visão geral / ordem de execução sugerida

| # | Tema | Tipo | Esforço | Bloqueia? |
|---|------|------|---------|-----------|
| 8 | Erro 500 ao cancelar treino | Bugfix | 🟡 | Não |
| 7 | Stepper de carga (1 em 1 + editável) | Bugfix/UX | 🟢 | Não |
| 4 | Log manual de refeição não funciona | Bugfix | 🟡 | Não |
| 1 | Gráfico de peso (barras vazias) | Bugfix | 🟢 | Não |
| 3 | Gráficos de força melhor organizados | UX/dados | 🟡 | Não |
| 2 | Tela real de recordes (PRs) | Feature | 🟡 | Depende de #3 (compartilha endpoints) |
| 6 | Criar treino personalizado (fluxo coeso) | UX | 🟡 | Não |
| 5 | Mais cards de treino rápido + imagens + carrossel shadcn | UX | 🟡 | Não |
| 9 | **Metas de nutrição personalizadas (ex: sal)** | Feature grande | 🔴 | Precisa ADR + migration |

Recomendo agrupar em **3 PRs**:
1. **Bugfixes** (#8, #7, #4, #1) — alto valor, baixo risco, sem schema.
2. **Progresso & Treino UX** (#3, #2, #6, #5) — sem schema, melhora percebida.
3. **Feature nova #9** (metas personalizadas) — schema + ADR + tools MCP. PR isolado.

---

## #8 — Erro "HTTP 500" ao cancelar sessão de treino

**Sintoma:** ao clicar "Sim, cancelar treino" aparece `Erro ao cancelar treino: HTTP 500`;
ao clicar de novo, funciona. Determinístico (toda vez).

**Onde está o código:**
- Web: `apps/web/src/components/workout/cancel-session-modal.tsx` → `workoutApi.deleteSession(id)`.
  O `catch` só engole erros com "not found"; qualquer outro (incluindo 500) é re-lançado e exibido.
- API: `apps/api/src/workout/workout.controller.ts:183` `@Delete('sessions/:id')` → `WorkoutSessionService.delete()`
  (`apps/api/src/workout/workout-session.service.ts:104`): `assertOwner()` (findUnique) e depois
  `prisma.workoutSession.delete()`. `SessionSet` tem `onDelete: Cascade` (schema confirmado), então
  cascata não deveria falhar.

**Causa-raiz (hipóteses, ordem de probabilidade):**
1. **Corrida com mutação de set em voo.** A tela ativa faz `log_set` → abre `RpeModal` que dispara
   `update_set` (RPE) de forma assíncrona, e há um timer de descanso re-renderizando. Se o usuário
   cancela enquanto um insert/update de `SessionSet` está em voo, o `delete` da sessão colide com a
   escrita do filho → erro transitório de constraint/transação. Na segunda tentativa a escrita já
   terminou → sucesso. Isso explica o padrão "1ª falha, 2ª ok".
2. `delete` **não está em transação**: `findUnique` + `delete` são duas queries; sob concorrência,
   a cascata e a escrita concorrente não são isoladas.
3. Resposta `void` do DELETE: o proxy (`apps/web/src/app/api/proxy/[...path]/route.ts`) devolve body
   vazio com `content-type: application/json`. Vale confirmar que o client (`lib/api/workout.ts`)
   não tenta `res.json()` num 200 vazio (isso daria erro de parse no client, **não** 500 — então
   provavelmente não é a causa do "500", mas deve ser endurecido junto).

**Proposta (reproduce-first — usar skill `bugfix`):**
1. **Reproduzir** com a API logando: capturar o stack real do 500 em `nestjs-pino`. Esse é o passo
   decisivo — as hipóteses acima são candidatas, o log confirma.
2. Tornar `delete` **idempotente e transacional** no service:
   ```ts
   async delete(userId: string, id: string): Promise<void> {
     await this.prisma.$transaction(async (tx) => {
       const s = await tx.workoutSession.findUnique({ where: { id }, select: { userId: true } });
       if (!s) return;                       // idempotente: já não existe → no-op
       if (s.userId !== userId) throw new ForbiddenException();
       await tx.sessionSet.deleteMany({ where: { sessionId: id } }); // explícito, não depende só de cascade
       await tx.workoutSession.delete({ where: { id } });
     });
   }
   ```
3. Controller responde **204 No Content** explicitamente (`@HttpCode(204)`).
4. Client `deleteSession`: tratar 204/200-vazio sem `res.json()`.
5. No PWA, **cancelar mutações em voo** antes de deletar:
   `await qc.cancelQueries(...)` e, se houver `logSet`/`update_set` pendentes, aguardar/abortar.

**Arquivos:** `workout-session.service.ts`, `workout.controller.ts`, `lib/api/workout.ts`,
`cancel-session-modal.tsx`. **Teste obrigatório** (CLAUDE.md): unit de `delete` (idempotência +
isolamento por user). **Esforço:** 🟡 ⏱️ 3h.

---

## #7 — Stepper de carga: pular de 1 em 1 e permitir digitar

**Sintoma:** durante o treino, o "+/-" da CARGA pula de 2.5 em 2.5 e o número não é editável.

**Onde está:** `apps/web/src/components/workout/active-exercise-card.tsx` — componente `Stepper`
(linha ~228). A CARGA usa `step={2.5}` (linha 124) e o valor é um `<span>` (linha 257), não um input.

**Proposta:**
1. Trocar `step={2.5}` → `step={1}` na CARGA (REPETIÇÕES já é `step={1}`).
2. Tornar o número **editável**: substituir o `<span>` por um `<input type="number" inputMode="decimal">`
   controlado, que dá `onChange` com parse seguro (cair pra valor anterior se inválido) e `onBlur`
   para normalizar. Manter +/- ao lado.
3. (Opcional, baixo custo) press-and-hold para repetir incremento; manter passo 1 mas permitir
   meio-kg digitando (ex.: `62.5`).
4. Aplicar o mesmo padrão ao `ExerciseDetailCard` e `active-cardio-card.tsx` se usarem o mesmo stepper.

**Arquivos:** `active-exercise-card.tsx` (+ `exercise-detail-card.tsx`, `active-cardio-card.tsx` se aplicável).
**MCP:** nenhuma mudança — `log_set` já aceita `weightKg` arbitrário. **Esforço:** 🟢 ⏱️ 1.5h.

---

## #4 — Log manual de refeição não funciona (melhorar como um todo)

**Sintoma:** no modal "Adicionar item", a busca fica em "Buscando..." e a inserção manual não
conclui.

**Onde está:**
- Web: `apps/web/src/components/nutrition/food-search-drawer.tsx` (`SearchPanel`, `ManualForm`,
  `submitManual`).
- API: `apps/api/src/nutrition/meal.service.ts` → `resolveItems()` (linha 90) e `MealItemService.add`.

**Causas-raiz (verificadas):**
1. **Busca "presa" em Buscando...** `SearchPanel` mostra "Buscando..." enquanto `search.isFetching`.
   Se `searchFoods` falha silenciosamente ou demora (rede/proxy), o usuário não recebe feedback de
   erro claro e o atalho manual fica pouco visível. (No print, a busca por "Arro" não retorna.)
   → Validar endpoint `GET /nutrition/foods?q=` no proxy/token; melhorar estados de erro/empty.
2. **Item livre sem macros vira 0, sem feedback.** `resolveItems` (linha 109-122) já trata item
   livre: `kcal: item.kcal ?? 0`, idem P/C/F — ou seja, **não quebra no banco** (campos viram 0).
   O problema é de **UX/silêncio**: se o `addItem.mutate` falha (ex.: `createMeal` quando `mealId`
   é undefined, payload `items: [payload]` com só `foodName`), o erro aparece só inline e o fluxo
   parece "não funcionar". Confirmar com `bugfix` qual ramo (addItem vs createMeal) está falhando.
3. **Cálculo automático ausente no manual.** Hoje o usuário precisa digitar kcal/macros manualmente.
   Sem isso, item entra com macros 0 e some no resumo — reforçando a sensação de "não funciona".

**Proposta (melhorar a parte toda):**
1. **Reproduzir** os dois caminhos (mealId presente vs novo meal) e corrigir o que 500a/silencia.
2. **Estados claros** no `SearchPanel`: spinner com timeout, erro com retry (já existe parcialmente),
   e tornar "Não achei, inserir manualmente" um botão proeminente que aparece após ~1s sem resultado.
3. **Manual mais rico**: além de "alimento livre", permitir **salvar como custom food** (checkbox
   "Salvar na minha lista") que chama `create_custom_food` e depois usa o `foodId` — assim o item
   passa a ter macros calculados por regra de 3 e reutilizável.
4. **Validação amigável**: exigir pelo menos kcal (ou avisar "item entrará sem calorias").
5. Garantir `invalidateQueries(['nutrition','summary',date])` + fechar drawer no sucesso (já existe).

**MCP (já cobre — confirmar):** `add_meal_item`, `log_meal`, `create_custom_food` já existem e
delegam aos mesmos services. A correção é no service/UX, não nas tools.

**Arquivos:** `food-search-drawer.tsx`, `meal.service.ts`, `meal-item.service.ts`, `lib/api/nutrition.ts`.
**Teste:** unit de `resolveItems` (item livre com/sem macros). **Esforço:** 🟡 ⏱️ 4h.

> **Bônus achado** (separável): a tela `nutrition/goals/page.tsx` e o tipo `UserGoals` em
> `lib/api/nutrition.ts` **não incluem `dailyWaterTargetMl`** (existe no schema, DTO e tool MCP).
> Salvar metas pelo PWA nunca seta esse campo. Fix trivial 🟢 — incluir no form + tipo.

---

## #1 — Gráfico de peso por barras: barras nunca preenchidas

**Sintoma:** na "Visão geral" do Progresso, o mini-gráfico de barras de peso fica sempre vazio.

**Onde está:** `apps/web/src/app/(app)/progress/page.tsx` — componente `WeightBarMini` (linhas 20-52).
É um mini-bar **custom em divs** (não Recharts), com `height: ${h}%` e
`h = Math.max(0.1, (v - min) / range) * 100`.

**Causa-raiz:** com poucos pontos ou variação pequena, `(v - min)/range` fica perto de 0 para quase
todos os pontos (só o máximo chega a 100%), então quase tudo renderiza no `minHeight: 8px` → "vazio".
Além disso o container `h-16` com `items-end` faz barras curtas parecerem inexistentes no tema escuro.
Se há `< 2` pesos, mostra mensagem (ok); o caso ruim é com dados reais pouco variados.

**Proposta:**
1. **Escala com baseline não-zero porém visível:** mapear para um piso maior (ex.: 25%–100%) em vez
   de 0.1%–100%, ou usar `min - padding` como base do domínio (igual o `WeightChart` que usa
   `domain={['dataMin - 1','dataMax + 1']}`). Assim variações pequenas continuam visíveis.
2. **Consistência visual:** padronizar com Recharts `BarChart` (já usado em passos) OU manter o div
   mas com gradiente/altura mínima de ~40%. Preferência: reutilizar Recharts pra coerência.
3. Garantir cor de barra com contraste (usar `bg-primary/60` nas anteriores e `bg-primary` na de hoje).
4. Tratar empate (`range === 0`): todas as barras a 60% + label "estável".

**Arquivos:** `progress/page.tsx` (e possivelmente extrair pra `components/progress/weight-bar-mini.tsx`).
**MCP:** sem mudança — `get_weight_progress` já entrega os pontos. **Esforço:** 🟢 ⏱️ 2h.

---

## #3 — Gráficos de força melhor organizados e com dados funcionais

**Sintoma:** "Evolução de força" e "Evolução de cardio" exigem escolher exercício manualmente e ficam
vazios por padrão ("Escolha um exercício…"); pouca orientação e dados não aparecem de cara.

**Onde está:** `components/progress/strength-chart.tsx`, `cardio-chart.tsx`, `exercise-picker-drawer.tsx`;
API `progress.service.ts` (`strengthProgress`, `cardioProgress`, `volumeProgress`) + tools
`get_strength_progress`, `get_cardio_progress`, `get_volume_progress`.

**Proposta:**
1. **Pré-seleção inteligente:** ao abrir, escolher automaticamente o exercício de força **mais
   treinado recentemente** (mesma agregação que `personal-records.tsx` já faz com `listSessions`).
   Idem cardio. Some o estado vazio na maioria dos casos.
2. **Reorganizar o bloco:** seção "Força" com (a) seletor de exercício no topo, (b) abas
   Carga máx / 1RM est. / Volume, (c) gráfico, (d) destaque numérico (atual, Δ%, melhor marca).
   Volume geral por semana (`get_volume_progress`) como card separado "Volume semanal" (não depende
   de escolher exercício — funciona de cara).
3. **Empty states úteis:** se não há dados pro exercício, sugerir "registre uma série pra começar".
4. **Eixos/escala:** revisar `domain` dos `LineChart` pra não achatar (usar `dataMin`/`dataMax` com
   pequena folga) e formatar datas curtas.
5. Reaproveitar o `ExercisePickerDrawer` com `filter` correto (já existe).

**MCP:** nenhuma tool nova; talvez um helper de service `mostUsedExercise(userId, type)` reutilizável
por PWA e por uma futura tool. **Arquivos:** os 3 componentes + opcional `progress.service.ts`.
**Esforço:** 🟡 ⏱️ 5h.

---

## #2 — Tela real de Recordes (PRs) com lista completa e análises

**Sintoma:** "Recordes Pessoais" hoje é só um card com top 3 (`personal-records.tsx`) e o link
"Ver histórico de treino" vai pra `/workout/history` (sessões, não PRs). Não há tela dedicada de
recordes com lista completa e análise.

**Onde está:** `components/progress/personal-records.tsx`; PR vem de
`SessionSetService.getPersonalRecord()` (`GET /workout/exercises/:id/pr`, tool `get_personal_record`),
um exercício por vez.

**Causa-raiz:** não existe endpoint/tool que liste **todos** os PRs do usuário de uma vez; o card
deriva top-3 no client agregando sessões.

**Proposta:**
1. **Backend (service + tool MCP):** novo método `ProgressService.listPersonalRecords(userId, { type? })`
   que percorre `SessionSet` do usuário e calcula, por exercício: melhor carga, melhor 1RM estimado,
   melhor volume de série, e (cardio) melhor distância/duração/pace — com data de quando bateu.
   Expor como `GET /progress/records` **e** tool MCP `list_personal_records` (MCP-first: desenhada
   junto com a tela).
2. **Tela `/(app)/progress/records/page.tsx`:** lista completa, busca/filtro por grupo muscular,
   ordenação (recente / maior carga / maior evolução), e por item: valor recorde, data, e mini-spark
   da evolução (reusa `get_strength_progress`). Seção "análises": maior evolução do mês, recordes
   batidos nos últimos 30 dias, exercícios estagnados.
3. **Linkar** o card atual → "Ver todos os recordes" para a nova tela.

**Arquivos:** novo `progress/records/page.tsx`, `progress.service.ts`, novo
`progress/mcp/list-personal-records.tool.ts`, `progress.controller.ts`, `lib/api/progress.ts`,
ajustar `personal-records.tsx`. **Teste:** unit do cálculo de PRs (regra obrigatória — agregação).
**Esforço:** 🟡 ⏱️ 6h.

---

## #6 — Fluxo coeso de "criar treino personalizado"

**Sintoma:** usuário diz que "não tem como criar treino personalizado".

**Realidade (verificada):** o fluxo **existe e funciona**: `/workout/plans` tem "Novo plano" →
cria plano só com nome; `/workout/plans/[id]` permite editar nome, **adicionar exercícios**
(`AddExerciseDrawer`), ajustar séries/reps/ordem e **iniciar treino** a partir do plano. O problema
é de **UX/descoberta**: criar um plano vazio (só nome) na tela de lista **não navega** pra dentro
dele, então parece que "não criou nada". A ação não se parece com "montar um treino".

**Proposta (transformar em fluxo guiado):**
1. Ao salvar "Novo plano", **navegar direto** para `/workout/plans/[id]` (estado de edição) em vez
   de voltar pra lista. (1 linha: `router.push` no `onSuccess` do `create`.)
2. **Estado vazio acionável** no detalhe: "Adicione seu primeiro exercício" com botão grande
   (`AddExerciseDrawer` já existe).
3. **Renomear/repositionar a entrada:** o card "Criar um treino personalizado" do `/workout` leva a
   um **wizard** curto (nome → adicionar exercícios → pronto) em vez da lista crua.
4. Permitir **criar plano a partir de um treino rápido** (pré-popular exercícios do template) — liga
   com #5.
5. (Opcional MCP) já existe `create_workout_plan` + `add_exercise_to_plan`; nenhuma tool nova
   necessária, mas vale uma tool de conveniência `create_workout_plan_with_exercises` (atalho) —
   avaliar YAGNI.

**Arquivos:** `workout/plans/page.tsx`, `workout/plans/[id]/page.tsx`, `workout/page.tsx`,
`add-exercise-drawer.tsx`. **Esforço:** 🟡 ⏱️ 4h.

---

## #5 — Mais cards de treino rápido + imagens + carrossel shadcn

**Sintoma:** poucos cards de treino rápido (4), sem imagens (só gradientes), e o "carrossel" é um
`overflow-x-auto` simples — não é o carrossel do shadcn.

**Onde está:** templates em `apps/web/src/lib/workout/quick-templates.ts` (4 itens); render em
`apps/web/src/app/(app)/workout/page.tsx` (`NoSession`, seção "TREINOS RÁPIDOS"). **Não há**
`embla-carousel` instalado nem `components/ui/carousel.tsx`.

**Proposta:**
1. **Instalar carrossel shadcn:** `embla-carousel-react` + adicionar `components/ui/carousel.tsx`
   (componente oficial shadcn). Trocar a `div` scrollável pelo `<Carousel>` com snap, setas e dots.
2. **Mais templates:** ampliar `QUICK_TEMPLATES` (ex.: Full Body, Push, Pull, Legs, Upper/Lower,
   Core/Abdômen, HIIT/Cardio, Glúteos, Peito&Tríceps, Costas&Bíceps, Ombro, Mobilidade) — 8–12 itens.
3. **Imagens:** adicionar campo `image` ao `QuickTemplate` e usar `next/image`. Como o ADR 004 evita
   storage de fotos de usuário, usar **assets estáticos** em `apps/web/public/quick/` (ou Unsplash
   fixo). Manter o gradiente como overlay para legibilidade do texto.
4. **Reutilizar** o card como componente `QuickTemplateCard`.
5. Ligar com #6: botão "Salvar como plano" em cima de um template.

**MCP:** templates rápidos são presets de UI (client-side); ao iniciar, já usam
`start_workout_session` + `search_exercise`/`log_set`. Sem tool nova.
**Arquivos:** `quick-templates.ts`, `workout/page.tsx`, novo `components/ui/carousel.tsx`,
novo `components/workout/quick-template-card.tsx`, `apps/web/package.json` (embla), `public/quick/*`.
**Esforço:** 🟡 ⏱️ 5h.

---

## #9 — Metas de nutrição personalizadas (ex.: controlar consumo de sal) — **MCP-first**

> Feature nova e maior. Exige **ADR** (mexe em schema, decisão de produto) + **migration**.
> Desenhada MCP-first: a forma primária de configurar e consultar é via tool MCP; o PWA reflete.

### Problema
Hoje a nutrição só rastreia **kcal, proteína, carbo, gordura** (`Food`, `MealItem`, `UserGoals`).
Não há como o usuário dizer "quero controlar meu **sódio/sal** (ou açúcar, fibra, sódio, água,
cafeína…)" e ver progresso contra uma meta. `UserGoals` é fixo (macros). O model dinâmico `Goal`
(kinds: weight/body_fat/workout_frequency/step_count/custom) não deriva de refeições.

### Decisão de design (proposta para ADR 009)
Adotar um modelo **genérico de nutrientes** em vez de colunas fixas por nutriente:

1. **Snapshot de nutrientes no item** — adicionar `nutrients Json?` em `MealItem` (e opcionalmente em
   `Food` para catálogo). Mapa flexível `{ "sodium_mg": 412, "sugar_g": 9, "fiber_g": 3, ... }`.
   - Por quê Json e não colunas: nutrientes são open-ended; TACO não tem todos; YAGNI > esquema rígido.
   - `MealItem.foodName` já é snapshot histórico (D5); `nutrients` segue a mesma filosofia.
2. **Novo model `NutrientTarget`** — metas por nutriente, em range (coerente com D6 "goals em range"):
   ```prisma
   model NutrientTarget {
     id          String   @id @default(uuid())
     userId      String
     nutrientKey String   // "sodium_mg", "sugar_g", "fiber_g", "caffeine_mg", ...
     label       String   // "Sódio", "Açúcar"
     unit        String   // "mg", "g"
     min         Float?   // opcional
     max         Float?   // ex.: limite de sal
     period      String   @default("daily") // daily | weekly (v1: daily)
     createdAt   DateTime @default(now())
     user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
     @@unique([userId, nutrientKey])
     @@index([userId])
   }
   ```
3. **Agregação:** `NutritionSummaryService` passa a somar `nutrients` dos itens do dia e comparar com
   os `NutrientTarget` ativos, devolvendo `{ nutrientKey, label, unit, total, min, max, status }`.
4. **Catálogo TACO:** seed pode preencher `sodium_mg` etc. quando disponível; quando não, o valor é
   estimado pelo Claude no log (coerente com o papel do MCP). Item sem o nutriente conta 0.

### Camada MCP (desenhada junto — prioridade)
Novas tools (delegam a um `NutrientTargetService` + extensões do `NutritionSummaryService`):
- `set_nutrient_target` — `{ nutrientKey, label, unit, min?, max?, period? }` (upsert por chave).
- `list_nutrient_targets` — lista metas do usuário com progresso do dia.
- `delete_nutrient_target` — `{ nutrientKey }`.
- `get_nutrient_summary` — `{ date }` → totais por nutriente + comparação com metas.
- **Estender** `add_meal_item` / `log_meal`: aceitar `nutrients?: Record<string, number>` por item.
- **Estender** `get_nutrition_summary`: incluir bloco `nutrients` (totais do dia).

Fluxo MCP exemplo (o que o usuário pediu): *"Quero controlar meu consumo de sal, máx 5g/dia"* →
Claude chama `set_nutrient_target({ nutrientKey:"sodium_mg", label:"Sódio", unit:"mg", max:2000 })`;
ao logar refeições, informa `nutrients:{ sodium_mg: ... }`; consulta com `get_nutrient_summary`.

### Camada PWA
1. Em `nutrition/goals` (ou nova aba "Metas personalizadas"): CRUD de `NutrientTarget` (adicionar
   nutriente de uma lista comum — sódio, açúcar, fibra, sódio, cafeína, água — ou custom; definir
   min/max/unidade).
2. Na tela de nutrição do dia: cards/rings extras para cada nutriente rastreado (ex.: barra de sódio
   verde/amarela/vermelha vs. limite), abaixo dos macros.
3. No `FoodSearchDrawer` (manual e custom food): campos opcionais para os nutrientes que o usuário
   rastreia (mostrar só os ativos, pra não poluir).

### Backend
- `packages/db/prisma/schema.prisma`: `MealItem.nutrients Json?`, model `NutrientTarget`, relação em `User`.
- Migration **append-only** (D9): adicionar coluna nullable + tabela nova (sem destrutivo).
- Services: `NutrientTargetService` (CRUD + progresso), extensões em `NutritionSummaryService`,
  `MealService.resolveItems` (persistir `nutrients`), `MealItemService`.
- Controller REST: `/nutrition/nutrient-targets` (GET/PUT/DELETE) + summary estendido.
- ADR `docs/ADR/009-metas-nutricionais-personalizadas.md`.
- **Testes obrigatórios:** agregação de nutrientes e cálculo de status vs. meta (regra de cálculo).

**Esforço:** 🔴 ⏱️ 14–20h (schema + service + 6 tools + telas + ADR + testes). PR isolado.

**Riscos/decisões em aberto (pra confirmar antes de codar):**
- (a) `nutrients` como Json vs. colunas fixas (proposta: Json). 
- (b) Lista inicial de nutrientes "comuns" oferecidos na UI.
- (c) Período só diário na v1 (semanal depois).
- (d) Como popular sódio do TACO (seed parcial vs. 100% estimado pelo Claude).

---

## Resumo de impacto por camada

| Camada | Itens que tocam |
|--------|-----------------|
| **Bugfix puro (sem schema)** | #1, #4 (parcial), #7, #8 |
| **UX/PWA (sem schema)** | #3, #5, #6 |
| **Service + tool MCP novos (sem schema)** | #2 |
| **Schema + migration + ADR + tools** | #9 |

## Próximos passos
1. Validar as 4 decisões em aberto de #9 (Json vs colunas, lista de nutrientes, período, seed TACO).
2. Abrir PR 1 (bugfixes) usando a skill `bugfix` para #8 e #4 (reproduce-first + log da API).
3. PR 2 (UX progresso/treino).
4. PR 3 (#9) após ADR 009 aprovado.
</content>
</invoke>
