import { apiFetch } from '../api';

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type FoodSource = 'TACO' | 'USDA' | 'CUSTOM';

export interface Food {
  id: number;
  name: string;
  source: FoodSource;
  groupId: number | null;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  createdByUserId: string | null;
}

export interface MealItem {
  id: string;
  mealId: string;
  foodId: number | null;
  foodName: string;
  groupId: number | null;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface Meal {
  id: string;
  userId: string;
  mealType: MealType;
  eatenAt: string;
  notes: string | null;
  items: MealItem[];
}

export interface DayTotals {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DaySummary {
  date: string;
  totals: DayTotals;
  mealsCount: number;
  meals: Meal[];
}

export interface UserGoals {
  userId: string;
  kcalMin: number;
  kcalMax: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsMinG: number;
  carbsMaxG: number;
  fatMinG: number;
  fatMaxG: number;
  weeklyWorkouts: number;
  dailyStepsTarget: number;
  dailyWaterTargetMl: number;
}

export interface FoodGroup {
  id: number;
  name: string;
}

export interface NutrientTarget {
  id: string;
  userId: string;
  nutrientKey: string;
  label: string;
  unit: string;
  min: number | null;
  max: number | null;
  period: string;
}

export type NutrientStatus = 'under' | 'ok' | 'over' | 'none';

export interface NutrientProgress {
  nutrientKey: string;
  label: string;
  unit: string;
  min: number | null;
  max: number | null;
  total: number;
  status: NutrientStatus;
}

export const nutritionApi = {
  summary: (date: string) => apiFetch<DaySummary>(`/api/nutrition/summary?date=${date}`),
  meals: (date?: string) => apiFetch<Meal[]>(`/api/nutrition/meals${date ? `?date=${date}` : ''}`),
  searchFoods: (q: string, limit = 20) =>
    apiFetch<Food[]>(`/api/nutrition/foods?q=${encodeURIComponent(q)}&limit=${limit}`),
  groups: () => apiFetch<FoodGroup[]>('/api/nutrition/foods/groups'),
  createMeal: (body: {
    mealType: MealType;
    eatenAt: string;
    notes?: string;
    items: Array<{
      foodId?: number;
      foodName?: string;
      grams: number;
      kcal?: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      nutrients?: Record<string, number>;
    }>;
  }) =>
    apiFetch<Meal>('/api/nutrition/meals', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  addItem: (
    mealId: string,
    item: {
      foodId?: number;
      foodName?: string;
      grams: number;
      kcal?: number;
      proteinG?: number;
      carbsG?: number;
      fatG?: number;
      nutrients?: Record<string, number>;
    },
  ) =>
    apiFetch<MealItem>(`/api/nutrition/meals/${mealId}/items`, {
      method: 'POST',
      body: JSON.stringify(item),
    }),
  updateItem: (id: string, patch: { grams?: number }) =>
    apiFetch<MealItem>(`/api/nutrition/meal-items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteItem: (id: string) =>
    apiFetch<void>(`/api/nutrition/meal-items/${id}`, { method: 'DELETE' }),
  deleteMeal: (id: string) => apiFetch<void>(`/api/nutrition/meals/${id}`, { method: 'DELETE' }),
  goals: () => apiFetch<UserGoals | null>('/api/nutrition/goals'),
  putGoals: (body: Omit<UserGoals, 'userId'>) =>
    apiFetch<UserGoals>('/api/nutrition/goals', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  history: (days: number) =>
    apiFetch<{
      days: number;
      series: Array<{
        date: string;
        meals: number;
        kcal: number;
        proteinG: number;
        carbsG: number;
        fatG: number;
      }>;
      averages: { kcal: number; proteinG: number; carbsG: number; fatG: number };
    }>(`/api/nutrition/history?days=${days}`),

  // Metas de nutrientes personalizadas (ADR 009)
  nutrientTargets: () => apiFetch<NutrientTarget[]>('/api/nutrition/nutrient-targets'),
  upsertNutrientTarget: (body: {
    nutrientKey: string;
    label: string;
    unit: string;
    min?: number;
    max?: number;
  }) =>
    apiFetch<NutrientTarget>('/api/nutrition/nutrient-targets', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteNutrientTarget: (key: string) =>
    apiFetch<{ deleted: true }>(`/api/nutrition/nutrient-targets/${encodeURIComponent(key)}`, {
      method: 'DELETE',
    }),
  nutrientSummary: (date: string) =>
    apiFetch<{ date: string; nutrients: NutrientProgress[] }>(
      `/api/nutrition/nutrient-summary?date=${date}`,
    ),
};
