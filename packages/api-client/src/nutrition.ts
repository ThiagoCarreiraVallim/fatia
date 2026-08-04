import { apiFetch } from './http';

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

/**
 * Produto embalado lido por código de barras (#140).
 *
 * Não é um `Food`: nada é persistido na consulta ao Open Food Facts, e o item
 * entra na refeição como item livre com os macros do rótulo. Ver ADR 017.
 */
export type BaseNutricional = '100g' | '100ml';

export interface ScannedProduct {
  barcode: string;
  name: string;
  brand: string | null;
  /** `100ml` para bebida: os macros abaixo são por 100 ml, não por 100 g. */
  basis: BaseNutricional;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  /** Porção do rótulo, na unidade do `basis`. `null` quando não dá para saber. */
  servingSize: number | null;
  servingLabel: string | null;
}

/** Ficha achada, porém sem algum macro. Serve para pré-preencher o cadastro. */
export type PartialScannedProduct = Partial<Omit<ScannedProduct, 'barcode' | 'basis'>> & {
  barcode: string;
  basis: BaseNutricional;
};

/** Crédito exigido pela ODbL. Vem na resposta para a tela não ter como esquecer. */
export interface OffAttribution {
  source: string;
  license: string;
  url: string;
}

export type BarcodeLookup =
  | { status: 'ok'; product: ScannedProduct; attribution: OffAttribution }
  | {
      status: 'incomplete';
      missing: string[];
      partial: PartialScannedProduct;
      attribution: OffAttribution;
    };

/**
 * Um alimento que a IA viu na foto (#139). **Não é um `MealItem`** — nada foi
 * gravado. Vira item de refeição só depois da tela de confirmação.
 */
export interface RecognizedFoodItem {
  /** Nome que o modelo deu. Fica visível para a pessoa poder discordar. */
  nomeReconhecido: string;
  /** `null` quando não houve correspondência na TACO — item livre. */
  foodId: number | null;
  /**
   * Alimento do catálogo que casou. Diferente de `nomeReconhecido` de propósito:
   * "arroz" casa com "Arroz, integral, cozido" ou "Arroz, tipo 1, cozido", e os
   * macros não são os mesmos. A tela mostra qual foi.
   */
  nomeDoCatalogo: string | null;
  grams: number;
  /** Auto-relatada pelo modelo: serve para ordenar e avisar, nunca para decidir. */
  confidence: number;
  /** `true` quando os macros vieram do modelo, não da TACO. */
  estimado: boolean;
  kcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export interface MealRecognition {
  itens: RecognizedFoodItem[];
  observacao: string | null;
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
  /**
   * Consulta um produto embalado pelo código de barras.
   *
   * `404` = o Open Food Facts não conhece o código (cadastro manual);
   * `503` = o OFF não respondeu (também cai no manual, mas vale tentar de novo).
   */
  lookupBarcode: (code: string) =>
    apiFetch<BarcodeLookup>(`/api/nutrition/foods/barcode/${encodeURIComponent(code)}`),

  /**
   * Se a entrada por foto deve aparecer na interface (#139).
   *
   * Sem agente configurado — ou com o agente no ar mas sem modelo de visão — a
   * funcionalidade **some** em vez de aparecer e falhar.
   */
  photoRecognitionStatus: () =>
    apiFetch<{ available: boolean }>('/api/nutrition/photo-recognition'),

  /**
   * Foto de refeição (JPEG em base64) → alimentos candidatos. **Não grava nada.**
   *
   * `text/plain` e não JSON porque o parser de JSON da API é global e tem teto de
   * 100 kB; elevá-lo elevaria para todas as rotas. Base64 e não bytes crus porque
   * é o que a câmera e a galeria do Expo já devolvem, e corpo binário em `fetch`
   * do React Native é caminho frágil.
   */
  recognizeMealPhoto: (jpegBase64: string) =>
    apiFetch<MealRecognition>('/api/nutrition/meals/recognize', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: jpegBase64,
      // Visão em CPU passa de 100 s; o teto padrão de 15 s abortaria toda foto.
      timeoutMs: 190_000,
    }),
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
