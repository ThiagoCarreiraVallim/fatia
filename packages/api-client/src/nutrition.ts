import { apiFetch } from './http';

export type MealType = 'BREAKFAST' | 'LUNCH' | 'DINNER' | 'SNACK';
export type FoodSource = 'TACO' | 'USDA' | 'CUSTOM';

/** Medida caseira: "colher de sopa" = 25 g. `mine` = criada pela própria pessoa. */
export interface FoodPortion {
  id: string;
  label: string;
  grams: number;
  mine: boolean;
}

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
  /** Catálogo + as da pessoa. A API sempre manda; opcional para alimento montado à mão. */
  portions?: FoodPortion[];
}

/** O que cria um alimento próprio: valores sempre por 100 g. */
export interface CustomFoodInput {
  name: string;
  kcalPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  /** A porção do rótulo, só na criação: no PATCH as medidas têm rota própria. */
  portions?: Array<{ label: string; grams: number }>;
}

/** Alimento da busca com o histórico da pessoa: o atalho que poupa digitar. */
export interface FoodShortcut extends Food {
  /** Gramagem da última vez, para já vir preenchida. */
  lastGrams: number | null;
  /** Como foi da última vez ("colher de sopa" × 2); nulos quando foi em gramas. */
  lastPortionLabel?: string | null;
  lastPortionQuantity?: number | null;
  timesEaten: number;
  favorite: boolean;
}

export interface FoodShortcuts {
  favorites: FoodShortcut[];
  /** Comidos nos últimos 60 dias, sem repetir os favoritos. */
  recent: FoodShortcut[];
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
  /** Retrato de como foi digitado ("colher de sopa" × 2); a conta usa `grams`. */
  portionLabel?: string | null;
  portionQuantity?: number | null;
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

export interface MealTemplateItem {
  id: string;
  position: number;
  foodId: number | null;
  foodName: string;
  grams: number;
  portionLabel?: string | null;
  portionQuantity?: number | null;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

/** Refeição salva ("Café de sempre"): o retrato dos itens, registrado de novo em um toque. */
export interface MealTemplate {
  id: string;
  name: string;
  mealType: MealType | null;
  items: MealTemplateItem[];
}

export interface CopyDayResult {
  created: Meal[];
  /** Refeições que já estavam no destino e ficaram de fora. */
  skipped: number;
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

/** Resposta de `POST /nutrition/goals/suggestion` (e de `suggest_nutrition_goals`). */
export interface GoalSuggestion {
  age: number;
  /** Metabolismo basal, kcal/dia. */
  bmr: number;
  /** Gasto total estimado, kcal/dia. */
  tdee: number;
  /** Centro da faixa de kcal, já ajustado ao objetivo. */
  targetKcal: number;
  goals: Omit<UserGoals, 'userId'>;
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
  /** Favoritos e recentes; com `mealType`, o que costuma ir naquela refeição vem primeiro. */
  myFoods: (mealType?: MealType) =>
    apiFetch<FoodShortcuts>(`/api/nutrition/foods/mine${mealType ? `?mealType=${mealType}` : ''}`),
  setFavorite: (foodId: number, favorite: boolean) =>
    apiFetch<void>(`/api/nutrition/foods/${foodId}/favorite`, {
      method: favorite ? 'PUT' : 'DELETE',
    }),
  /** Os alimentos que a pessoa cadastrou, por nome. */
  customFoods: () => apiFetch<Food[]>('/api/nutrition/foods/custom'),
  /** Nome repetido responde 409; valores fora do possível em 100 g, 400. */
  createCustomFood: (body: CustomFoodInput) =>
    apiFetch<Food>('/api/nutrition/foods', { method: 'POST', body: JSON.stringify(body) }),
  updateCustomFood: (id: number, body: Partial<Omit<CustomFoodInput, 'portions'>>) =>
    apiFetch<Food>(`/api/nutrition/foods/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  /** As refeições já registradas guardam nome e valores; só o alimento some. */
  deleteCustomFood: (id: number) =>
    apiFetch<void>(`/api/nutrition/foods/${id}`, { method: 'DELETE' }),
  portions: (foodId: number) => apiFetch<FoodPortion[]>(`/api/nutrition/foods/${foodId}/portions`),
  createPortion: (foodId: number, body: { label: string; grams: number }) =>
    apiFetch<FoodPortion>(`/api/nutrition/foods/${foodId}/portions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deletePortion: (id: string) =>
    apiFetch<void>(`/api/nutrition/portions/${id}`, { method: 'DELETE' }),
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
      /** Ou gramas, ou `portionId` + `quantity` (só com `foodId`). */
      grams?: number;
      portionId?: string;
      quantity?: number;
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
  /** Copia para `toDate`, no mesmo horário local. Repetir responde 409. */
  copyMeal: (id: string, body: { toDate: string; mealType?: MealType }) =>
    apiFetch<Meal>(`/api/nutrition/meals/${id}/copy`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  copyDay: (body: { fromDate: string; toDate: string }) =>
    apiFetch<CopyDayResult>('/api/nutrition/days/copy', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  mealTemplates: () => apiFetch<MealTemplate[]>('/api/nutrition/meal-templates'),
  createMealTemplate: (body: { name: string; mealId: string; mealType?: MealType }) =>
    apiFetch<MealTemplate>('/api/nutrition/meal-templates', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  deleteMealTemplate: (id: string) =>
    apiFetch<void>(`/api/nutrition/meal-templates/${id}`, { method: 'DELETE' }),
  logMealTemplate: (id: string, body: { eatenAt: string; mealType?: MealType }) =>
    apiFetch<Meal>(`/api/nutrition/meal-templates/${id}/log`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  addItem: (
    mealId: string,
    item: {
      foodId?: number;
      foodName?: string;
      grams?: number;
      portionId?: string;
      quantity?: number;
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
  updateItem: (id: string, patch: { grams?: number; portionId?: string; quantity?: number }) =>
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
  /** Só calcula. O que faltar vem do perfil salvo e da última pesagem. */
  suggestGoals: (
    input: Partial<{
      sex: 'FEMALE' | 'MALE';
      birthDate: string;
      heightCm: number;
      weightKg: number;
      activityLevel: 'SEDENTARY' | 'LIGHT' | 'MODERATE' | 'ACTIVE' | 'VERY_ACTIVE';
      objective: 'LOSE' | 'MAINTAIN' | 'GAIN';
    }> = {},
  ) =>
    apiFetch<GoalSuggestion>('/api/nutrition/goals/suggestion', {
      method: 'POST',
      body: JSON.stringify(input),
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
