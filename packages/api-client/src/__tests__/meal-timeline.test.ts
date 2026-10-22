import { describe, expect, it } from 'vitest';
import { buildMealTimeline, mealTimelineTitle } from '../meal-timeline';
import type { Meal, MealType } from '../nutrition';

function meal(id: string, mealType: MealType, eatenAt: string): Meal {
  return { id, userId: 'u', mealType, eatenAt, notes: null, items: [] };
}

describe('buildMealTimeline', () => {
  it('keeps the day order with placeholders in their slot, not after the logged meals', () => {
    const entries = buildMealTimeline([meal('j', 'DINNER', '2026-05-19T22:00:00Z')]);

    expect(entries.map((e) => (e.kind === 'meal' ? e.meal.id : e.mealType))).toEqual([
      'BREAKFAST',
      'LUNCH',
      'SNACK',
      'j',
    ]);
  });

  it('lists several meals of one type by time and offers no placeholder for it', () => {
    const entries = buildMealTimeline([
      meal('tarde', 'SNACK', '2026-05-19T19:00:00Z'),
      meal('manha', 'SNACK', '2026-05-19T13:00:00Z'),
    ]);

    expect(entries.map((e) => (e.kind === 'meal' ? e.meal.id : e.mealType))).toEqual([
      'BREAKFAST',
      'LUNCH',
      'manha',
      'tarde',
      'DINNER',
    ]);
  });
});

describe('mealTimelineTitle', () => {
  it('names today and yesterday', () => {
    expect(mealTimelineTitle('2026-05-19', '2026-05-19')).toBe('Refeições de hoje');
    expect(mealTimelineTitle('2026-05-18', '2026-05-19')).toBe('Refeições de ontem');
    expect(mealTimelineTitle('2026-03-01', '2026-03-02')).toBe('Refeições de ontem');
  });

  it('shows the date for any other day', () => {
    expect(mealTimelineTitle('2026-05-12', '2026-05-19')).toBe('Refeições de ter., 12/05');
  });
});
