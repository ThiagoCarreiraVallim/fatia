import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { GetNutritionSummaryTool } from '../../nutrition/mcp/get-nutrition-summary.tool';
import { LogMealTool } from '../../nutrition/mcp/log-meal.tool';
import { SearchFoodTool } from '../../nutrition/mcp/search-food.tool';
import { LogWeightTool } from '../../progress/mcp/log-weight.tool';
import { GetActiveWorkoutSessionTool } from '../../workout/mcp/get-active-workout-session.tool';
import { LogSetTool } from '../../workout/mcp/log-set.tool';
import { SearchExerciseTool } from '../../workout/mcp/search-exercise.tool';
import { carregarTools } from './support/catalogo-servido';

/**
 * O cartão de cada tool mais usada no chat: o resultado desenhado na tela, e não
 * só a linha "Feito". Só o artefato sobrevive a um F5 — argumento e resultado da
 * tool não são gravados (dado de saúde, ver `historico.ts`) —, então o cartão
 * tem de nascer aqui, do `structuredContent`.
 *
 * A lista de formatos é lida do **agente**, do disco: um `kind` que o agente não
 * conhece é trocado por `report` lá, e um sem o campo obrigatório é descartado em
 * silêncio. Copiar a lista para cá deixaria os dois lados verdes e divergentes.
 */
const ARTEFATOS_PY = resolve(__dirname, '../../../../agent/src/fatia_agent/chat/artefatos.py');

function camposDoAgente(): Record<string, string> {
  const fonte = readFileSync(ARTEFATOS_PY, 'utf8');
  const bloco = /CAMPO_OBRIGATORIO = \{([\s\S]*?)\n\}/.exec(fonte)?.[1] ?? '';
  return Object.fromEntries(
    Array.from(bloco.matchAll(/"([a-z]+)":\s*"([a-z]+)"/g), (m) => [m[1], m[2]]),
  );
}

const CAMPOS = camposDoAgente();
const nada = undefined as never;

/** O que o agente faz com a carga: aceita, com o campo que o formato exige. */
function aceitoPeloAgente(carga: Record<string, unknown> | null | undefined) {
  expect(carga).toBeTruthy();
  const kind = String(carga?.kind);
  expect(Object.keys(CAMPOS)).toContain(kind);
  expect(carga).toHaveProperty(CAMPOS[kind]);
}

describe('cartões das tools do chat', () => {
  it('lê a lista de formatos do agente', () => {
    expect(CAMPOS).toMatchObject({ report: 'columns', metric: 'value', comparison: 'items' });
  });

  it('as tools mais usadas têm cartão', () => {
    const comCartao = carregarTools()
      .filter((t) => typeof t.artifact === 'function')
      .map((t) => t.name)
      .sort();
    expect(comCartao).toEqual(
      [
        'explain_form',
        'export_my_data',
        'get_steps_history',
        'get_streak',
        'get_water_history',
        'list_achievements',
        'list_goals',
        'get_active_workout_session',
        'get_nutrition_summary',
        'get_today_summary',
        'get_weight_progress',
        'list_meals',
        'log_meal',
        'log_set',
        'log_weight',
        'search_exercise',
        'search_food',
      ].sort(),
    );
  });

  it('get_nutrition_summary: o total do dia e os três macros', () => {
    const carga = new GetNutritionSummaryTool(nada).artifact({
      date: '2026-11-05',
      totals: { kcal: 1832.6, proteinG: 120.4, carbsG: 180.2, fatG: 60.9 },
      mealsCount: 3,
      meals: [],
    } as never);

    aceitoPeloAgente(carga);
    expect(carga).toMatchObject({ kind: 'metric', value: 1833, unit: 'kcal' });
    expect(carga.breakdown.map((b) => b.value)).toEqual([120, 180, 61]);
  });

  it('log_meal: o que foi gravado, item por item, com o nome da refeição', () => {
    const carga = new LogMealTool(nada).artifact({
      mealType: 'LUNCH',
      items: [
        { foodName: 'Arroz branco', grams: 150, kcal: 192.3, proteinG: 3.8 },
        { foodName: 'Frango grelhado', grams: 120.4, kcal: 197.6, proteinG: 38.2 },
      ],
    } as never);

    aceitoPeloAgente(carga);
    expect(carga.label).toBe('Almoço registrado');
    expect(carga.rows).toEqual([
      ['Arroz branco', 150, 192, 4],
      ['Frango grelhado', 120, 198, 38],
    ]);
  });

  it('search_food: os achados com kcal e proteína por 100 g', () => {
    const carga = new SearchFoodTool(nada).artifact([
      { name: 'Ovo de galinha, cozido', kcalPer100g: 145.7, proteinPer100g: 13.29 },
    ] as never);

    aceitoPeloAgente(carga);
    expect(carga.rows).toEqual([['Ovo de galinha, cozido', 146, 13.3]]);
  });

  it('search_exercise: os achados com o grupo muscular', () => {
    const carga = new SearchExerciseTool(nada).artifact([
      { name: 'Supino reto', muscleGroup: 'peito' },
    ] as never);

    aceitoPeloAgente(carga);
    expect(carga.rows).toEqual([['Supino reto', 'peito']]);
  });

  it('log_set: só os campos que a série tem — força não mostra distância', () => {
    const carga = new LogSetTool(nada).artifact({
      setNumber: 2,
      weightKg: 40,
      reps: 10,
      durationSeconds: null,
      distanceMeters: null,
      exercise: { name: 'Supino reto' },
    } as never);

    aceitoPeloAgente(carga);
    expect(carga.items).toEqual([
      { label: 'Exercício', value: 'Supino reto' },
      { label: 'Série', value: 2 },
      { label: 'Carga', value: 40, unit: 'kg' },
      { label: 'Repetições', value: 10 },
    ]);
  });

  it('log_set: cardio mostra duração e distância, e não carga', () => {
    const carga = new LogSetTool(nada).artifact({
      setNumber: 1,
      weightKg: null,
      reps: null,
      durationSeconds: 1800,
      distanceMeters: 5000,
      exercise: { name: 'Corrida' },
    } as never);

    expect(carga.items.map((i) => i.label)).toEqual(['Exercício', 'Série', 'Duração', 'Distância']);
    expect(carga.items.slice(2)).toEqual([
      { label: 'Duração', value: 30, unit: 'min' },
      { label: 'Distância', value: 5, unit: 'km' },
    ]);
  });

  it('get_active_workout_session: as séries do treino aberto, e nada sem treino', () => {
    const tool = new GetActiveWorkoutSessionTool(nada);
    const carga = tool.artifact({
      sets: [{ setNumber: 1, weightKg: 40, reps: 10, exercise: { name: 'Supino reto' } }],
    } as never);

    aceitoPeloAgente(carga);
    // Lista rica (prancha IA-Ferramentas, "Ver treino em andamento"), como a tool declara.
    expect(carga).toMatchObject({
      kind: 'list',
      items: [{ title: 'Supino reto', detail: 'Série 1 · 40 kg × 10' }],
    });
    expect(tool.artifact(null)).toBeNull();
  });

  it('log_weight: o valor do pedido aprovado, já que o resultado só traz o id', () => {
    const carga = new LogWeightTool(nada).artifact({ weightLogId: 'w1' }, { weightKg: 78.4 });

    aceitoPeloAgente(carga);
    expect(carga).toMatchObject({ kind: 'metric', value: 78.4, unit: 'kg' });
  });
});
