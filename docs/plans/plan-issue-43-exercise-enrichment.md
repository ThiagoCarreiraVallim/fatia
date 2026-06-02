# Plano — Issue #43: Enriquecimento de Exercícios com Diagrama Visual + Coaching

> **Branch:** `claude/muscle-anatomy-svg-wgm4v`
> **Status:** Em implementação
> **Decisão (Phase 1 research):** Usar `yuhonas/free-exercise-db` (Unlicense / domínio público) como fonte de metadados (primaryMuscles, instructions, equipment, level, mechanic). Diagrama SVG próprio em vez de `react-body-highlighter` — asset que controlamos, sem dependência externa.

---

## Decisão de fonte de dados

| Opção | Licença | Qualidade visual | Instruções | Custo | Decisão |
|-------|---------|-----------------|-----------|-------|---------|
| `yuhonas/free-exercise-db` | **Unlicense (PD)** | Sem fotos | ✅ 800+ exercícios | Grátis | ✅ **Escolhido para metadados** |
| `bootstrapping-lab/exercisedb-api` | AGPL + data unclear | GIFs | ✅ 5 000+ | Grátis | ❌ Licença de dados ambígua |
| `wger` | AGPL | Fotos variadas | ✅ | Grátis | ❌ Prioridade menor |
| GymVisual / comercial | Limpa | Profissional | ❌ | R$1k–3k | ❌ Custo alto para v1 |
| SVG próprio (este PR) | Próprio | ✅ Vetorial | — | Grátis | ✅ **Diagrama visual** |

**Por que `free-exercise-db`:** domínio público, campos já no formato que precisamos, `primaryMuscles` bate 1:1 com os `data-muscle` do nosso SVG.

---

## Entregáveis

### E1 — Banco de dados (schema + seed)
**Arquivos:** `packages/db/prisma/schema.prisma`, `migrations/`, `seed-exercises.ts`, `data/exercises-en.json`

Novos campos no model `Exercise`:
```
primaryMuscles    String[]   // casa com data-muscle do SVG
secondaryMuscles  String[]
equipment         String?    // "barbell", "dumbbell", "machine", "body only"
level             String?    // "beginner" | "intermediate" | "advanced"
mechanic          String?    // "compound" | "isolation"
instructions      String[]   // passos numerados
youtubeVideoId    String?    // EN
youtubeVideoIdPt  String?    // PT-BR (preencher manualmente nos top 50)
```

Seed importa `exercises-en.json`, aplica mapa de nomes PT-BR nos exercícios já existentes e insere novos do catálogo open-source. `muscleGroup` (campo legado PT) é derivado de `primaryMuscles[0]`.

---

### E2 — SVG Muscle Diagram
**Arquivos:** `apps/web/public/muscle-front.svg`, `apps/web/public/muscle-back.svg`, `apps/web/src/components/workout/muscle-diagram.tsx`

Componente React que:
- Renderiza os dois SVGs via `<object>` (evita parsing inline de 130KB)
- Ao carregar, aplica via DOM: vermelho nos `primaryMuscles`, laranja nos `secondaryMuscles`
- Props: `primaryMuscles: string[]`, `secondaryMuscles?: string[]`, `view?: 'front' | 'back' | 'both'`

```
Músculos aceitos (batem com data-muscle do SVG):
chest · shoulders · traps · lats · middle back · lower back
abductors · glutes · hamstrings · calves · quadriceps
adductors · abdominals · biceps · triceps · forearms · neck
```

---

### E3 — Exercise Detail Drawer
**Arquivo:** `apps/web/src/components/workout/exercise-detail-drawer.tsx`

Sheet (shadcn) que abre ao tocar em um exercício, mostrando:
- Nome + badges (equipment, level, mechanic)
- `<MuscleDiagram>` com primary + secondary
- Lista numerada de instruções
- Embed YouTube opcional (prioriza PT-BR)

---

### E4 — MCP tools
**Arquivos:** `apps/api/src/workout/mcp/`

| Tool | Input | O que retorna |
|------|-------|---------------|
| `get_exercise_details` | `exerciseId` | Nome, músculos, equipment, level, instructions, youtubeVideoId |
| `explain_form` | `exerciseName` | Instructions + técnica resumida gerada pelo Claude |

---

### E5 — REST endpoint (PWA)
**Arquivo:** `apps/api/src/workout/workout.controller.ts`

`GET /exercises/:id` → retorna exercício enriquecido completo (já existia parcialmente).

---

## Mapa de músculos: `primaryMuscles` → `muscleGroup` (legado PT)

| primaryMuscles[0] | muscleGroup |
|-------------------|------------|
| chest | peito |
| lats, middle back, lower back, traps | costas |
| shoulders | ombro |
| biceps, triceps, forearms | braço |
| quadriceps, hamstrings, glutes, adductors, abductors, calves | pernas |
| abdominals | core |
| (outros) | cardio |

---

## Ordem de execução

```
[x] SVG com data-muscle (feito)
[ ] E1 — Schema migration + seed com exercises-en.json
[ ] E2 — MuscleDiagram component + SVGs em /public
[ ] E3 — ExerciseDetailDrawer
[ ] E4 — MCP tools get_exercise_details + explain_form
[ ] E5 — GET /exercises/:id enriquecido no REST
[ ] Top 50 youtubeVideoIdPt preenchidos manualmente (pode ser issue separada)
```

---

## Critérios de aceite (da issue)

- [x] SVG de diagrama muscular próprio
- [ ] Schema migrado e seed rodando
- [ ] UI de detalhe mostra diagrama + instruções + equipment
- [ ] ≥ 50 exercícios com YouTube PT-BR (pode ser issue de follow-up)
- [ ] `get_exercise_details` e `explain_form` funcionando no Claude
