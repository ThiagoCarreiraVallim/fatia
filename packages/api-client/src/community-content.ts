import { apiFetch } from './http';
import type { PlanDocumentInput, PlanDocumentView } from './plan-editor';
import type { NutritionDocument, NutritionDocumentInput } from './nutrition-plan-editor';
import type { GroupRole, MyGroup } from './community';
import type { MealType } from './nutrition';
import type { TemplateReach } from './plan-library';

/**
 * Planos prontos, dicas e mídia da comunidade (Fase 7a). A equipe publica pelo
 * painel (`contentApi`); o membro vê e adota (`groupContentApi`). Imagens vão
 * direto do aparelho ao bucket por URL assinada (`uploadMedia`).
 */

export type TemplateKind = 'WORKOUT' | 'NUTRITION';
export type PlanLevel = 'beginner' | 'intermediate' | 'advanced';
export type TipCategory = 'WORKOUT' | 'NUTRITION' | 'HABITS' | 'RECOVERY' | 'GENERAL';
export type MediaPurpose =
  | 'group_avatar'
  | 'group_content'
  | 'exercise_video'
  | 'exercise_photo'
  | 'agent_avatar'
  | 'post_image'
  /** Logo do parceiro num benefício (#393). */
  | 'benefit_logo'
  /** Foto de perfil (#387): pessoal, sem comunidade. */
  | 'user_avatar'
  /** Foto de prova do check-in de desafio (#395, ADR 044): só a pessoa e a equipe veem. */
  | 'challenge_checkin';

export interface MediaView {
  id: string;
  kind: 'IMAGE' | 'VIDEO';
  /** URL assinada de curta duração; `null` com o armazenamento desligado. */
  url: string | null;
  width: number | null;
  height: number | null;
  /** Só no vídeo (#408): a duração lida do arquivo. */
  durationMs?: number | null;
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
  /** Para o atalho "guia" (#396); `null` no exercício próprio do autor. */
  exerciseId: number | null;
  /** A academia tem guia dela (vídeo, fotos, dica) para este exercício. */
  hasGuide: boolean;
  name: string;
  muscleGroup: string | null;
  targetSets: number;
  targetReps: string;
  /** Sessão do plano (#406): "A · Pernas". Nulo no plano de uma sessão só. */
  session?: string | null;
}

export interface PlanTemplate {
  id: string;
  kind: TemplateKind;
  title: string;
  description: string | null;
  level: PlanLevel | null;
  cover: MediaView | null;
  authorName: string;
  /** O papel de hoje do autor nesta comunidade (#396); `null` se saiu. */
  authorRole: GroupRole | null;
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
  /** Rascunho (#405), só para a equipe: não vai para a comunidade nem é enviado. */
  draft?: boolean;
  /** "Com quem" (#405), só na lista da equipe. */
  withWhom?: TemplateReach;
  // Editor de plano de treino (#406).
  /** Etiquetas da biblioteca ("hipertrofia"), em minúsculas. */
  tags?: string[];
  /** A agenda sugerida para o envio: "Datas" ou "Flexível"; nulo sem sugestão. */
  schedule?: 'CALENDAR' | 'FLEXIBLE' | null;
  /** Período sugerido (YYYY-MM-DD). */
  startDate?: string | null;
  endDate?: string | null;
  sessionCount?: number;
  /** O documento do editor; só na leitura de um modelo pela equipe. */
  document?: PlanDocumentView | null;
  /** O plano alimentar do editor (#407); só na leitura de um modelo pela equipe. */
  nutritionDocument?: NutritionDocument | null;
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
  /** O papel de hoje do autor nesta comunidade (#396); `null` se saiu. */
  authorRole: GroupRole | null;
  publishedAt: string | null;
  updatedAt: string;
  canEdit?: boolean;
}

export interface TemplateMetaInput {
  /** Rascunho (#405): não vai para a comunidade nem é enviado. */
  draft?: boolean;
  title?: string;
  description?: string | null;
  level?: PlanLevel | null;
  coverFileId?: string | null;
}

/** O que o editor de treino (#406) grava no modelo, além do título e do nível. */
export interface WorkoutTemplateFields {
  document?: PlanDocumentInput;
  tags?: string[];
  schedule?: 'CALENDAR' | 'FLEXIBLE' | null;
  startDate?: string | null;
  endDate?: string | null;
}

export interface UpdateTemplateInput extends TemplateMetaInput, WorkoutTemplateFields {
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
  /** As metas que valiam antes da troca (#396); ficam também no histórico de metas. */
  previousGoals: NutritionGoalsInput | null;
  /** As metas de antes foram para o histórico (havia metas e alguma mudou). */
  goalsHistoryWritten: boolean;
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
  /** Um plano da conta (`planId`) ou o documento do editor (#406): um dos dois. */
  createWorkout: (
    groupId: string,
    input: TemplateMetaInput &
      WorkoutTemplateFields &
      (
        | { planId: string; document?: undefined }
        | { planId?: undefined; document: PlanDocumentInput }
      ),
  ) => apiFetch<PlanTemplate>(`${base}/${groupId}/content/plans/workout`, json('POST', input)),
  /** O documento do editor (#407), ou metas e refeições salvas (Fase 7): um dos dois. */
  createNutrition: (
    groupId: string,
    input: TemplateMetaInput & {
      title: string;
      document?: NutritionDocumentInput;
      goals?: NutritionGoalsInput | null;
      mealTemplateIds?: string[];
    },
  ) => apiFetch<PlanTemplate>(`${base}/${groupId}/content/plans/nutrition`, json('POST', input)),
  /** Salvar o plano alimentar do editor (#407). */
  updateNutrition: (
    groupId: string,
    id: string,
    input: TemplateMetaInput & { document?: NutritionDocumentInput },
  ) => apiFetch<PlanTemplate>(`${base}/${groupId}/content/plans/${id}`, json('PATCH', input)),
  updatePlan: (groupId: string, id: string, input: UpdateTemplateInput) =>
    apiFetch<PlanTemplate>(`${base}/${groupId}/content/plans/${id}`, json('PATCH', input)),
  /** `announce` (#405): "Anunciar no mural"; sem ele, vale a configuração da comunidade. */
  publishPlan: (groupId: string, id: string, published: boolean, announce?: boolean) =>
    apiFetch<PlanTemplate>(
      `${base}/${groupId}/content/plans/${id}/publish`,
      json('POST', announce === undefined ? { published } : { published, announce }),
    ),
  deletePlan: (groupId: string, id: string) =>
    apiFetch<{ id: string }>(`${base}/${groupId}/content/plans/${id}`, json('DELETE')),

  tips: (groupId: string) => apiFetch<GroupTip[]>(`${base}/${groupId}/content/tips`),
  createTip: (groupId: string, input: TipInput) =>
    apiFetch<GroupTip>(`${base}/${groupId}/content/tips`, json('POST', input)),
  updateTip: (groupId: string, id: string, input: Partial<TipInput>) =>
    apiFetch<GroupTip>(`${base}/${groupId}/content/tips/${id}`, json('PATCH', input)),
  setTipState: (
    groupId: string,
    id: string,
    state: { published?: boolean; pinned?: boolean },
    _opts: { announce?: boolean } = {},
  ) => apiFetch<GroupTip>(`${base}/${groupId}/content/tips/${id}/state`, json('POST', state)),
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
  /** A dica aberta (Cm-15, #396). */
  tip: (groupId: string, id: string) => apiFetch<GroupTip>(`${base}/${groupId}/tips/${id}`),
};

export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  headers: Record<string, string>;
}

export const mediaApi = {
  requestUpload: (input: {
    purpose: MediaPurpose;
    groupId?: string;
    mime: string;
    bytes: number;
  }) => apiFetch<UploadTicket>('/api/media/uploads', json('POST', input)),
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
  input: { purpose: MediaPurpose; groupId?: string; mime: string; bytes: number },
  put: (url: string, headers: Record<string, string>) => Promise<{ ok: boolean; status: number }>,
): Promise<MediaView> {
  const ticket = await mediaApi.requestUpload(input);
  const res = await put(ticket.uploadUrl, ticket.headers);
  if (!res.ok) throw new Error(`O envio do arquivo falhou (${res.status}).`);
  return mediaApi.confirm(ticket.fileId);
}
