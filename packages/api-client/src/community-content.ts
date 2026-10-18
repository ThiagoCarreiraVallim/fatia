import { apiFetch } from './http';
import type { MyGroup } from './community';
import type { MealType } from './nutrition';

/**
 * Planos prontos, dicas e mídia da comunidade (Fase 7a). A equipe publica pelo
 * painel (`contentApi`); o membro vê e adota (`groupContentApi`). Imagens vão
 * direto do aparelho ao bucket por URL assinada (`uploadMedia`).
 */

export type TemplateKind = 'WORKOUT' | 'NUTRITION';
export type PlanLevel = 'beginner' | 'intermediate' | 'advanced';
export type TipCategory = 'WORKOUT' | 'NUTRITION' | 'HABITS' | 'GENERAL';
export type MediaPurpose =
  | 'group_avatar'
  | 'group_content'
  | 'exercise_video'
  | 'exercise_photo'
  | 'agent_avatar'
  | 'post_image';

export interface MediaView {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  /** URL assinada de curta duração; `null` com o armazenamento desligado. */
  url: string | null;
  width: number | null;
  height: number | null;
}

export interface NutritionGoalsInput {
  kcalMin: number;
  kcalMax: number;
  proteinMinG: number;
  proteinMaxG: number;
  carbsMinG: number;
  carbsMaxG: number;
  fatMinG: number;
  fatMaxG: number;
}

export interface SuggestedMealItem {
  foodId: number | null;
  foodName: string;
  grams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  portionLabel: string | null;
  portionQuantity: number | null;
}

export interface SuggestedMeal {
  name: string;
  mealType: MealType | null;
  kcal: number;
  items: SuggestedMealItem[];
}

export interface TemplateExercise {
  name: string;
  muscleGroup: string | null;
  targetSets: number;
  targetReps: string;
}

export interface PlanTemplate {
  id: string;
  kind: TemplateKind;
  title: string;
  description: string | null;
  level: PlanLevel | null;
  cover: MediaView | null;
  authorName: string;
  /** `null` = rascunho, visível só para a equipe. */
  publishedAt: string | null;
  updatedAt: string;
  exercises: TemplateExercise[];
  goals: NutritionGoalsInput | null;
  meals: SuggestedMeal[];
  /** O plano que quem pergunta já adotou deste modelo (treino). */
  adoptedPlanId: string | null;
  /** Só para a equipe. */
  sourcePlanId?: string | null;
  canEdit?: boolean;
}

export interface GroupTip {
  id: string;
  title: string;
  /** Markdown restrito: renderize com `parseMarkdownLite`. */
  body: string;
  category: TipCategory;
  image: MediaView | null;
  pinned: boolean;
  authorName: string;
  publishedAt: string | null;
  updatedAt: string;
  canEdit?: boolean;
}

export interface TemplateMetaInput {
  title?: string;
  description?: string | null;
  level?: PlanLevel | null;
  coverFileId?: string | null;
}

export interface UpdateTemplateInput extends TemplateMetaInput {
  planId?: string;
  goals?: NutritionGoalsInput | null;
  mealTemplateIds?: string[];
}

export interface TipInput {
  title: string;
  body: string;
  category: TipCategory;
  imageFileId?: string | null;
}

export interface AdoptInput {
  applyGoals?: boolean;
  saveMeals?: boolean;
}

export interface AdoptResult {
  kind: TemplateKind;
  planId: string | null;
  goalsApplied: boolean;
  mealsSaved: number;
  mealsAlreadySaved: boolean;
}

const base = '/api/groups';
const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

/** A bancada da equipe: rascunhos, edição e publicação. */
export const contentApi = {
  plans: (groupId: string) => apiFetch<PlanTemplate[]>(`${base}/${groupId}/content/plans`),
  plan: (groupId: string, id: string) =>
    apiFetch<PlanTemplate>(`${base}/${groupId}/content/plans/${id}`),
  createWorkout: (groupId: string, input: TemplateMetaInput & { planId: string }) =>
    apiFetch<PlanTemplate>(`${base}/${groupId}/content/plans/workout`, json('POST', input)),
  createNutrition: (
    groupId: string,
    input: TemplateMetaInput & {
      title: string;
      goals?: NutritionGoalsInput | null;
      mealTemplateIds?: string[];
    },
  ) => apiFetch<PlanTemplate>(`${base}/${groupId}/content/plans/nutrition`, json('POST', input)),
  updatePlan: (groupId: string, id: string, input: UpdateTemplateInput) =>
    apiFetch<PlanTemplate>(`${base}/${groupId}/content/plans/${id}`, json('PATCH', input)),
  publishPlan: (groupId: string, id: string, published: boolean) =>
    apiFetch<PlanTemplate>(
      `${base}/${groupId}/content/plans/${id}/publish`,
      json('POST', { published }),
    ),
  deletePlan: (groupId: string, id: string) =>
    apiFetch<{ id: string }>(`${base}/${groupId}/content/plans/${id}`, json('DELETE')),

  tips: (groupId: string) => apiFetch<GroupTip[]>(`${base}/${groupId}/content/tips`),
  createTip: (groupId: string, input: TipInput) =>
    apiFetch<GroupTip>(`${base}/${groupId}/content/tips`, json('POST', input)),
  updateTip: (groupId: string, id: string, input: Partial<TipInput>) =>
    apiFetch<GroupTip>(`${base}/${groupId}/content/tips/${id}`, json('PATCH', input)),
  setTipState: (groupId: string, id: string, state: { published?: boolean; pinned?: boolean }) =>
    apiFetch<GroupTip>(`${base}/${groupId}/content/tips/${id}/state`, json('POST', state)),
  deleteTip: (groupId: string, id: string) =>
    apiFetch<{ id: string }>(`${base}/${groupId}/content/tips/${id}`, json('DELETE')),

  setAvatar: (groupId: string, fileId: string | null) =>
    apiFetch<MyGroup>(`${base}/${groupId}/avatar`, json('PUT', { fileId })),
};

/** A vitrine do membro: só o que está publicado. */
export const groupContentApi = {
  plans: (groupId: string) => apiFetch<PlanTemplate[]>(`${base}/${groupId}/plans`),
  plan: (groupId: string, id: string) => apiFetch<PlanTemplate>(`${base}/${groupId}/plans/${id}`),
  adopt: (groupId: string, id: string, input: AdoptInput = {}) =>
    apiFetch<AdoptResult>(`${base}/${groupId}/plans/${id}/adopt`, json('POST', input)),
  tips: (groupId: string) => apiFetch<GroupTip[]>(`${base}/${groupId}/tips`),
};

export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

export const mediaApi = {
  requestUpload: (input: { purpose: MediaPurpose; groupId: string; mime: string; bytes: number }) =>
    apiFetch<UploadTicket>('/api/media/uploads', json('POST', input)),
  confirm: (fileId: string) => apiFetch<MediaView>(`/api/media/${fileId}/confirm`, json('POST')),
};

export const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Mensagem para a pessoa antes de pedir a URL, ou `null` se a imagem serve. */
export function imageProblem(file: { type: string; size: number }): string | null {
  if (!(IMAGE_MIMES as readonly string[]).includes(file.type)) {
    return 'Escolha uma imagem JPEG, PNG ou WebP.';
  }
  if (file.size > IMAGE_MAX_BYTES) return 'A imagem passa de 10 MB. Escolha uma menor.';
  if (file.size <= 0) return 'A imagem está vazia.';
  return null;
}

/**
 * Envia um arquivo: pede a URL, manda o corpo direto ao bucket e confirma. O
 * `put` é do app — a web usa `fetch` com o `Blob`, o celular com o arquivo do
 * seletor —, porque o corpo não passa pela API nem pelo transporte autenticado.
 */
export async function uploadMedia(
  input: { purpose: MediaPurpose; groupId: string; mime: string; bytes: number },
  put: (url: string, headers: Record<string, string>) => Promise<{ ok: boolean; status: number }>,
): Promise<MediaView> {
  const ticket = await mediaApi.requestUpload(input);
  const res = await put(ticket.uploadUrl, ticket.headers);
  if (!res.ok) throw new Error(`O envio do arquivo falhou (${res.status}).`);
  return mediaApi.confirm(ticket.fileId);
}
