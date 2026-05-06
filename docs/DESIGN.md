# Design — PWA

## Princípios

1. **Mobile-first.** Telas dimensionadas para celular; desktop é bônus.
2. **Dark mode only.** Decisão consciente — menos código, melhor para uso noturno (treino, revisão de comida).
3. **Logging primário via Claude.** O PWA é para visualização e correção — não otimizamos forms para data entry rápido em massa.
4. **Zero estados intermediários complexos.** Se uma feature precisa de wizard de 3 passos, é sinal de que tá fora do escopo.

## Paleta e tokens

Inspirada nos prints fornecidos (BWS):
- Background: `#0a0a0c` (quase preto, levemente azulado)
- Surface: `#16171b`
- Surface elevated: `#1f2025`
- Primary (azul): `#3b82f6`
- Success: `#22c55e`
- Warning: `#f59e0b`
- Danger: `#ef4444`
- Text primary: `#f5f5f5`
- Text secondary: `#9ca3af`
- Border: `#2a2b30`

Macro colors:
- Protein: `#a78bfa` (roxo)
- Carbs: `#22c55e` (verde)
- Fat: `#f59e0b` (amarelo)

## Tipografia

- Font: Inter (já default do Tailwind via `font-sans`)
- Números grandes (calorias, pesos): `font-bold tabular-nums`

## Navegação

Bottom tab bar com 4 abas (não 5 — sem Lessons):

```
┌────────────────────────────────┐
│                                │
│         conteúdo               │
│                                │
├────────────────────────────────┤
│ Nutrição │ Treino │ Progresso │ Perfil │
└────────────────────────────────┘
```

Ícones do `lucide-react`: `Apple`, `Dumbbell`, `TrendingUp`, `User`.

## Telas (por fase)

### Fase 1 — Nutrição

#### `/login`
- Email + senha
- Sem signup público (admin cria contas)
- Erros inline

#### `/` (Hoje / Nutrição)
- Header: data atual com setas anterior/próximo
- Card de resumo:
  - Calorias consumidas / range meta com barra
  - 3 mini-barras: P, C, G com valores atuais e ranges
- Lista de refeições agrupadas por tipo:
  - Café, Almoço, Jantar, Lanches
  - Cada grupo expansível, mostra total kcal e proteína
  - Itens com nome, gramas, kcal, P
  - Swipe-to-delete em cada item
- FAB "+" abre modal de adição manual (busca TACO)

#### `/nutrition/goals`
- Form simples: ranges para kcal, P, C, G
- Botão salvar

### Fase 2 — Treino

#### `/workout`
- Header: "Treino de hoje" ou seletor de plano
- Lista de exercícios do plano
- Cada exercício card com:
  - Nome
  - **Se exercício de força:** tabela `Set | Previous | Kg | Reps | RPE` + inputs por set + botão "Add Set"
  - **Se exercício de cardio:** linha única com inputs `Duração | Distância | FC média | Kcal` + botão "Add Entry" (uma sessão de cardio pode ter múltiplas entradas se quebrou em intervalos)
  - Notes expansível
- Header sticky: "X/Y exercises", botão "Finish"
- Suporte a treino híbrido: força + cardio na mesma sessão

A diferenciação de UI é feita pelo `muscleGroup` do exercício. Componente `<ExerciseCard />` decide qual sub-componente renderizar.

#### `/workout/plans`
- Lista de planos do usuário
- CRUD simples

#### `/workout/history`
- Lista de sessões passadas, agrupadas por semana
- Click → detalhe

### Fase 3 — Progresso e atividade

#### `/progress`
- Tabs: Peso | Força | Cardio | Passos
- Filtros: 14 / 30 / 90 / 180 dias
- **Peso:**
  - Card com peso atual e variação no período
  - Gráfico de linha (Recharts)
  - Tabela de médias semanais
  - Botão "Logar peso"
- **Força:**
  - Seletor de exercício (apenas exercícios não-cardio)
  - Gráfico de carga máxima por sessão
  - Card de PR com data e detalhes
- **Cardio:**
  - Seletor de exercício (apenas cardio)
  - Seletor de métrica: duração / distância / pace / kcal
  - Gráfico de evolução
  - Card de melhor sessão
- **Passos:**
  - Card com passos de hoje + meta + barra de progresso
  - Gráfico de barras dos últimos N dias com linha de meta
  - Métricas: média diária, total no período, dias batendo meta
  - Botão "Logar passos" — modal com input numérico

### Fase 4 — Polimento

#### `/dashboard` (substitui `/`)
- Saudação personalizada
- Checklist do dia: Logar peso, Registrar refeições, Treino concluído, **Passos do dia**
- Card de passos: contagem atual + meta + barra de progresso
- Atalhos para últimas ações

#### `/profile`
- Dados do usuário
- **Tokens MCP:**
  - Lista de tokens com label, criado em, último uso
  - Botão "Criar novo token" → mostra UMA VEZ
  - Botão "Revogar" por token
- Logout

## Componentes-chave

| Componente | Onde |
|---|---|
| `<DateNavigator />` | Header de Nutrição |
| `<MacroBar protein={..} carbs={..} fat={..} goals={..} />` | Resumo nutricional |
| `<MealGroup type="LUNCH" items={..} />` | Lista de refeições |
| `<FoodSearch />` | Modal de adição |
| `<ExerciseCard exercise={..} />` | Tela de treino — decide entre força e cardio internamente |
| `<StrengthSetRow />` | Linha de série de força |
| `<CardioEntryRow />` | Linha de entrada de cardio |
| `<ProgressChart data={..} period={..} />` | Gráficos de peso/força/cardio |
| `<StepsCard steps target />` | Card de passos no dashboard |
| `<StepsChart days={..} target={..} />` | Gráfico de barras de passos |
| `<LogStepsModal />` | Input rápido de passos |

## Fluxos críticos

### Logging via Claude (fluxo primário)
1. Usuário abre Claude no celular
2. Tira foto: "comi isso no almoço"
3. Claude analisa, chama `log_meal` no MCP
4. Confirma valores na conversa
5. PWA reflete imediatamente (próxima visualização)

### Logging manual via PWA (correção)
1. Abre app na aba Nutrição
2. Vê item errado no almoço
3. Tap no item → modal de edição
4. Salva
5. Total atualiza

### Logging de treino via PWA (caso comum)
Diferente de comida, treino tende a ser logado direto no PWA durante a sessão (claude no meio do treino é desconfortável). Por isso a UX da tela de treino é a mais cuidadosa.

1. Abre `/workout`, plano de hoje pré-selecionado
2. Para cada exercício:
   - Olha o "previous"
   - Preenche Kg e Reps do set 1
   - Marca como completo (radio)
   - Repete para outros sets
3. Tap "Finish" → resumo da sessão

## Estados vazios

Sempre informativos, com CTA:

- Sem refeições hoje: "Nenhuma refeição registrada. Use o Claude no celular ou toque + abaixo."
- Sem peso registrado: "Logue seu peso para ver evolução."
- Sem planos de treino: "Crie seu primeiro plano (ex: Push, Pull, Leg)."
- Sem passos hoje: "Nenhum log de passos hoje. Toque pra registrar."
- Sem histórico de cardio: "Faça seu primeiro cardio pra começar a ver progresso."

## Acessibilidade mínima

- Contraste WCAG AA (verificar com plugin)
- Todos os interativos têm label/aria
- Focus ring visível
- Teclado funcional em forms

## Responsividade

- Breakpoint único: `md` (768px) para layout em colunas no desktop
- Abaixo disso: stack vertical, full width, padding lateral 16px
