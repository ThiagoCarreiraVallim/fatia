# Pesquisa: fonte de dados de exercícios (Issue #43 — Fase 1)

> **Status:** proposta de decisão. A Fase 2 do #43 está bloqueada até o owner ratificar
> a fonte nos comentários da issue. Este doc pode ser removido após a decisão.
> **Data:** 2026-05-31

## TL;DR (recomendação)

| Necessidade                                                        | Fonte recomendada                          | Licença                         |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------- |
| **Metadados** (músculos, instruções, equipamento, nível, mecânica) | **`yuhonas/free-exercise-db`**             | **Unlicense (domínio público)** |
| **Diagrama muscular**                                              | **SVG própria** (Figma "Fatia – Anatomia") | nossa                           |
| **Vídeo**                                                          | **YouTube curado (PT-BR)**, embed          | embed permitido por ToS         |
| **Erros comuns / coaching**                                        | **Autorado** (assistido por Claude)        | nosso                           |

A fraqueza histórica do `free-exercise-db` — **fotos amadoras** — deixa de importar, porque o
visual virá da **nossa SVG** + **YouTube**, não das imagens dele. Sobra exatamente o que
queremos: metadados estruturados, em **domínio público**, com risco de licença **zero** — ideal
para um projeto OSS que quer ser **Claude Custom Connector**.

## Critérios de avaliação

Clareza de licença · qualidade visual · amplitude (nº de exercícios) · custo · necessidade de
hospedar asset · risco para um conector distribuído.

## Comparação das fontes

### 1. `yuhonas/free-exercise-db` — ✅ ESCOLHIDA (metadados)

- **Licença:** **Unlicense** (domínio público) — código **e** dados. Sem atribuição, sem
  share-alike, sem ToS. Máxima permissividade.
- **Amplitude:** ~800 exercícios.
- **Campos** (batem quase 1:1 com o schema do #43): `id, name, force, level, mechanic,
equipment, primaryMuscles, secondaryMuscles, instructions, category, images`.
- **Qualidade visual:** fotos amadoras (ponto fraco) — **irrelevante** no nosso caso (SVG própria + YouTube).
- **Hosting:** nenhum (JSON estático; podemos versionar/seed).
- **Risco:** mínimo. Domínio público elimina o problema de redistribuição via conector.

### 1b. Tradução PT-BR já existe — `joao-gugel/exercicios-bd-ptbr`

Fork do free-exercise-db já traduzido, em **3 versões**:

- `exercises-ptbr-minimal.json` — só `id`, `name`, `instructions`.
- **`exercises-ptbr-partial-translation.json` — ✅ a que queremos:** `name` + `instructions` em
  PT, mas **enums técnicos em inglês** (`primaryMuscles`, `secondaryMuscles`, `equipment`,
  `level`, `mechanic`, `force`, `category`). Mantém o alinhamento com a SVG e a taxonomia, e já
  resolve a tradução das instruções.
- `exercises-ptbr-full-translation.json` — traduz **até os enums** (`primaryMuscles: ["abdominais"]`,
  `equipment: "peso-do-corpo"`). **Não usar** — quebraria o casamento com os `<g>` e com qualquer
  outro dataset.

**Ressalva de licença:** o fork **não tem arquivo LICENSE**. A base upstream é Unlicense (domínio
público), então o **dado de exercício em si não tem copyright**; mas a tradução, como obra
derivada, não vem com concessão explícita. **Mitigação (risco zero):** nosso seed tem só ~60
exercícios (não 800) — usamos a Versão 2 como _referência_ e fazemos/validamos a tradução desses
~60 a partir da base inglesa (domínio público) nós mesmos (assistido por Claude), passando a
**possuir** essas traduções. Alternativa: pedir ao autor para adicionar uma licença (ex.: Unlicense)
e aí consumir direto.

### 2. `bootstrapping-lab/exercisedb-api` — ❌ rejeitada (licença dos dados/assets indefinida)

- **Licença:** código **AGPL-3.0**; **dados/GIFs sem licença explícita** no README (só um badge
  "Terms of use" + e-mail de suporte). Os GIFs descendem do antigo ExerciseDB (RapidAPI), de
  proveniência/comercialização nebulosa.
- **Amplitude/visual:** 1500+ exercícios com GIFs (visual bom).
- **Risco:** **alto** para um conector que **redistribui** dados — sem licença clara de
  asset/dado, não dá para assumir uso livre. AGPL no código ainda contamina se acoplarmos.
- **Veredito:** atraente no visual, **inviável** pela indefinição de licença dos dados. Rejeitada.

### 3. `wger` — 🟡 fallback opcional (com atribuição)

- **Licença:** código AGPL-3+; **dados de exercício CC-BY-SA 4.0**. Uso comercial OK **com
  atribuição** e **share-alike** em datasets derivados.
- **Amplitude/visual:** razoável; qualidade mista.
- **Risco:** o **share-alike** "contamina" o dataset derivado (teríamos de liberar nossas
  curadorias sob CC-BY-SA) e exige atribuição por exercício. Fricção desnecessária quando o
  free-exercise-db (domínio público) já cobre o essencial.
- **Veredito:** manter como **fonte suplementar** só se faltar algum exercício, com atribuição.

### 4. `free-exercise-db` (as imagens dele) — ❌ rejeitada (qualidade) — registrado p/ não revisitar

- Fotos amadoras (porões, iluminação ruim). Já avaliado e rejeitado por qualidade. **Importante:**
  rejeitamos só as **imagens** — os **metadados** dele são a base escolhida.

### 5. Bibliotecas comerciais (GymVisual, Muscle & Motion, …) — ⏸️ adiado

- **Licença:** limpa. **Qualidade:** profissional. **Custo:** ~R$1k–3k one-time.
- **Veredito:** não justificável agora — a combinação SVG + YouTube cobre o visual a custo zero.
  Reavaliar se quisermos GIFs profissionais no futuro.

### 6. GIFs por IA (Veo/Sora/Kling/Runway) — ⏸️ adiado

- Donos do asset; ~R$1.5k–3k para 500 exercícios; qualidade variável e QA trabalhoso. Fora de
  escopo agora.

### 7. Gravação própria — ⏸️ adiado (issue separada)

- Melhor fit de marca; R$2k–4k, ~80–150 exercícios; logística alta. Já marcado como **out of
  scope** no #43 (depende de stack de assets estáticos).

## Decisão proposta

1. **Metadados:** importar do **`free-exercise-db`** (domínio público) para popular os campos
   novos de `Exercise`.
2. **Visual:** **SVG própria** com destaque de `primaryMuscles` (forte) e `secondaryMuscles`
   (suave). Substitui o `react-body-highlighter` cogitado na issue.
3. **Vídeo:** **YouTube curado** (PT-BR preferencial), embed; top ~50 primeiro; resto degrada.
4. **Erros comuns:** **autorados** (assistidos por Claude) — nenhuma fonte permissiva traz isso
   limpo; expostos via `explain_form`.

Isso resolve o item "decisão de fonte" e **elimina o risco de licença** do conector.

## Esquema resultante (mapa free-exercise-db → `Exercise` do #43)

| Campo #43            | Origem free-exercise-db | Observação                   |
| -------------------- | ----------------------- | ---------------------------- |
| `primaryMuscles[]`   | `primaryMuscles`        | direto                       |
| `secondaryMuscles[]` | `secondaryMuscles`      | direto                       |
| `equipment`          | `equipment`             | normalizar p/ PT na UI       |
| `level`              | `level`                 | beginner/intermediate/expert |
| `mechanic`           | `mechanic`              | compound/isolation           |
| `instructions[]`     | `instructions`          | **já em PT** (fork V2)       |
| `commonMistakes[]`   | — (autorar)             | Claude/manual                |
| `youtubeVideoId(Pt)` | — (curar)               | manual, top exercícios       |

Bônus disponíveis no dataset: `force` (pull/push/static) e `category` (strength/cardio/…), úteis
para o coach e filtros.

## Taxonomia de músculos (alinhar a SVG a isto)

Valores oficiais de `primaryMuscles`/`secondaryMuscles`:

```
abdominals, abductors, adductors, biceps, calves, chest, forearms, glutes,
hamstrings, lats, lower back, middle back, neck, quadriceps, shoulders, traps, triceps
```

**Para os `<g id>` da SVG**, use a mesma chave em kebab-case (sem espaço):
`lower-back`, `middle-back` (os demais já são uma palavra). **Não** criar `obliques` separado —
o dataset dobra oblíquos em `abdominals`. `abductors` (glúteo médio/quadril) é difícil de
representar na ilustração; opcional.

### Mapa músculo → `muscleGroup` do app (para o seed)

`Exercise.muscleGroup` (peito/costas/pernas/ombro/braço/core) continua sendo o bucket único;
`primaryMuscles` é o detalhamento. Sugestão de mapa:

| `muscleGroup` (app) | músculos finos                                               |
| ------------------- | ------------------------------------------------------------ |
| peito               | chest                                                        |
| costas              | lats, traps, middle back, lower back                         |
| ombro               | shoulders                                                    |
| braço               | biceps, triceps, forearms                                    |
| pernas              | quadriceps, hamstrings, glutes, calves, adductors, abductors |
| core                | abdominals                                                   |

## Lacunas e como cobrir

- **PT-BR:** ~~traduzir~~ **já resolvido** — partir da Versão 2 (`partial-translation`) do fork
  PT, que traz `name` + `instructions` em PT e mantém os enums em inglês. Para o seed (~60
  exercícios) validamos/regeramos as traduções a partir da base em domínio público (ver 1b),
  ficando donos delas.
- **`commonMistakes` e vídeos:** não vêm prontos → autorar/curar incrementalmente (top exercícios
  primeiro), deixando nulos degradarem na UI.
- **Cobertura:** ~800 exercícios cobrem com folga os ~60 do nosso seed; casar por nome/aliases.

## Riscos

- Tradução manual das instruções tem custo de curadoria → começar pelos mais usados.
- Casar nomes do free-exercise-db com nosso seed exige aliases (ex.: "agachamento" ↔ "Barbell Squat").
- Se quisermos GIFs profissionais depois, reabrir a opção comercial — mas sem bloquear esta fase.

## Fontes

- [yuhonas/free-exercise-db (GitHub)](https://github.com/yuhonas/free-exercise-db) — Unlicense; `schema.json` enums.
- [joao-gugel/exercicios-bd-ptbr (GitHub)](https://github.com/joao-gugel/exercicios-bd-ptbr) — fork PT-BR (3 versões); sem LICENSE explícito.
- [bootstrapping-lab/exercisedb-api (GitHub)](https://github.com/bootstrapping-lab/exercisedb-api) — AGPL-3.0 código; licença de dados/assets indefinida.
- [wger-project/wger (GitHub)](https://github.com/wger-project/wger) — código AGPL-3+; dados CC-BY-SA 4.0.
  </content>
