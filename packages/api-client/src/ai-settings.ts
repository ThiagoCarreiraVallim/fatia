import { ApiError, apiFetch } from './http';
import type { ChatArtifact, ChatErrorCode, ChatMemory } from './chat';
import type { MealItemSource, MealRecognition, RecognizedFoodItem } from './nutrition';

/**
 * Config da IA, memórias, estados e foto do prato (#385, pranchas Al-M24, Al-M9, Al-M11 e
 * Al-M10). Os textos e as contas moram aqui para o PWA e o app dizerem o mesmo.
 */

// ---------------------------------------------------------------- modo por categoria

/** As quatro categorias da ADR 039. Igual ao enum `AiWriteCategory` da API. */
export type AiWriteCategory = 'DAY_LOG' | 'WORKOUT' | 'GOALS' | 'MEMORIES';
/** Perguntar antes, Automático ou Desligado. Sem linha na API é `ASK`. */
export type AiWriteMode = 'ASK' | 'AUTO' | 'OFF';
export type AiWriteModes = Record<AiWriteCategory, AiWriteMode>;

export const AI_WRITE_CATEGORIES: readonly {
  key: AiWriteCategory;
  title: string;
  description: string;
}[] = [
  { key: 'DAY_LOG', title: 'Registros do dia', description: 'Refeições, água, peso e passos' },
  { key: 'WORKOUT', title: 'Treino', description: 'Sessões, exercícios e cargas' },
  { key: 'GOALS', title: 'Metas', description: 'Criar e ajustar metas' },
  { key: 'MEMORIES', title: 'Memórias', description: 'Preferências e rotina' },
];

export const AI_WRITE_MODE_LABELS: Record<AiWriteMode, string> = {
  ASK: 'Perguntar antes',
  AUTO: 'Automático',
  OFF: 'Desligado',
};

const CICLO: Record<AiWriteMode, AiWriteMode> = { ASK: 'AUTO', AUTO: 'OFF', OFF: 'ASK' };

/** O próximo modo no toque do chip. */
export function nextAiWriteMode(mode: AiWriteMode): AiWriteMode {
  return CICLO[mode];
}

/** O que nunca grava sozinho, qualquer que seja o modo (ADR 039). */
export const AI_NEVER_AUTOMATIC = [
  'Apagar qualquer registro',
  'Cobrança e assinatura',
  'Compartilhar com a equipe',
  'Publicar no mural',
] as const;

export const AI_SETTINGS_COPY = {
  title: 'Config da IA',
  modesTitle: 'O que a IA grava sozinha',
  modesNote:
    '“Perguntar antes” mostra um cartão para você confirmar. “Automático” grava e mostra o ' +
    'cartão “Gravado”, com Desfazer. Mais de 5 gravações numa resposta, ou mais de 10 itens de ' +
    'uma vez, sempre voltam a pedir seu OK.',
  offNote: '“Desligado” tira essas ações da conversa: a IA só consulta.',
  neverTitle: 'Nunca é automático',
  neverNote: 'Para essas, a IA sempre pede seu OK.',
  webTitle: 'Busca na web',
  webDescription: 'Para responder com fontes',
  webOn: 'Ligada',
  webOff: 'Desligada',
  webNote:
    'Quando a IA busca, só a pergunta vai a um serviço de busca, sem seu nome nem seus dados.',
  agentTitle: 'Com quem você conversa',
  moreTitle: 'Mais',
  memories: 'O que a IA lembra',
  ownAi: 'Usar sua própria IA (MCP)',
  plan: 'Meu plano',
} as const;

/** `GET /chat/settings`: os quatro modos, a busca na web e o "n de 50" das memórias. */
export interface AiSettings {
  modes: AiWriteModes;
  webSearchEnabled: boolean;
  memories: { count: number; limit: number };
}

export function getAiSettings(): Promise<AiSettings> {
  return apiFetch('/api/chat/settings');
}

export function setAiWriteMode(
  category: AiWriteCategory,
  mode: AiWriteMode,
): Promise<AiWriteModes> {
  return apiFetch('/api/chat/settings/modes', {
    method: 'PATCH',
    body: JSON.stringify({ category, mode }),
  });
}

// ---------------------------------------------------------------- Gravado e Desfazer

/** O id para o Desfazer do "Gravado", ou `null` quando não há o que desfazer. */
export function savedUndoId(artifact: ChatArtifact): string | null {
  if (artifact.kind !== 'saved' || artifact.undoable !== true) return null;
  return artifact.autoWriteId ?? null;
}

/** Desfaz uma gravação automática: só o dono, uma vez, em até 24 h (409 depois). */
export function undoAutoWrite(id: string): Promise<{ undone: true }> {
  return apiFetch(`/api/chat/auto-writes/${encodeURIComponent(id)}/undo`, { method: 'POST' });
}

// ---------------------------------------------------------------- memórias

export type MemoryCategory = 'PREFERENCE' | 'ROUTINE' | 'TRAINING' | 'HABIT';

export const MEMORY_CATEGORY_LABELS: Record<MemoryCategory, string> = {
  PREFERENCE: 'preferência',
  ROUTINE: 'rotina',
  TRAINING: 'treino',
  HABIT: 'hábito',
};

export const MEMORY_LIMIT = 50;

export const MEMORIES_COPY = {
  title: 'O que a IA lembra',
  intro: 'Entra em toda conversa. Peça no chat (“lembra que…”) ou apague aqui.',
  saved: 'Guardadas',
  limitNote: 'Com 50, a IA pede para você apagar uma antes de guardar outra.',
  emptyTitle: 'Nada guardado',
  emptyBody: 'A IA começa do zero em cada conversa.',
  teamNote: 'Só você vê. A equipe da academia não tem acesso.',
  deleteAll: 'Apagar todas',
  deleteAllTitle: 'Apagar todas as memórias?',
  deleteAllBody: 'A IA volta a começar do zero em cada conversa. Isso não tem volta.',
  deleteAllConfirm: 'Apagar todas',
} as const;

function diaCurto(iso: string, timeZone?: string): string {
  const partes = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'short',
    timeZone,
  }).formatToParts(new Date(iso));
  const dia = partes.find((p) => p.type === 'day')?.value ?? '';
  const mes = (partes.find((p) => p.type === 'month')?.value ?? '').replace('.', '');
  return `${dia} ${mes}`;
}

/** "preferência · 12 out" — a linha de baixo de cada memória. */
export function memoryMeta(memory: ChatMemory, timeZone?: string): string {
  const data = diaCurto(memory.createdAt, timeZone);
  return memory.category ? `${MEMORY_CATEGORY_LABELS[memory.category]} · ${data}` : data;
}

export function memoryCountLabel(count: number, limit = MEMORY_LIMIT): string {
  return `${count} de ${limit}`;
}

/** Esquece todas de uma vez (só no app: não existe tool de MCP para isso). */
export function forgetAllChatMemories(): Promise<{ forgotten: number }> {
  return apiFetch('/api/chat/memories', { method: 'DELETE' });
}

// ---------------------------------------------------------------- estados (Al-M11)

export const AI_STATES_COPY = {
  interrupted: 'Resposta interrompida',
  continue: 'Continuar',
  thinking: 'Pensando…',
  background:
    'Pode sair da tela. Enquanto isso o botão da IA no menu gira, e um aviso chega quando ' +
    'estiver pronto.',
  quotaTitle: 'Limite de hoje atingido',
  quotaManual: 'O registro manual segue normal.',
  quotaAction: 'Registrar à mão',
  quotaPlaceholder: 'Volta amanhã',
  downTitle: 'A IA está fora do ar',
  downBody: 'Sua mensagem ficou salva. O resto do app funciona normalmente.',
  downAction: 'Tentar de novo',
  downPlaceholder: 'Indisponível',
} as const;

function diaNoFuso(data: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(data);
}

/** "A IA volta amanhã às 00:00." — `resetsAt` vem de `GET /chat/quota`. */
export function quotaResetLabel(resetsAt: string, timeZone?: string, now = new Date()): string {
  const volta = new Date(resetsAt);
  const hora = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(volta);
  const hoje = diaNoFuso(now, timeZone);
  const amanha = diaNoFuso(new Date(now.getTime() + 86_400_000), timeZone);
  const dia = diaNoFuso(volta, timeZone);
  const quando =
    dia === hoje ? 'hoje' : dia === amanha ? 'amanhã' : `em ${diaCurto(resetsAt, timeZone)}`;
  return `A IA volta ${quando} às ${hora}.`;
}

// ---------------------------------------------------------------- foto do prato

export const MEAL_PHOTO_COPY = {
  framing: 'Enquadre o prato inteiro, de cima',
  goesTo: 'Vai para:',
  firstTitle: 'Antes da primeira foto',
  /** O nome é o do provedor de verdade (o mesmo do aceite do chat, #384). */
  firstBody:
    'A foto vai para o OpenRouter, que reconhece os alimentos e devolve os itens para você ' +
    'revisar. Ele não usa a foto para treinar modelos.',
  keepNote: 'A foto só fica guardada com a refeição se você permitir.',
  dataLink: 'Como tratamos seus dados',
  retake: 'Tirar outra',
  acceptAndUse: 'Concordo e usar foto',
  use: 'Usar foto',
  recognizing: 'Reconhecendo alimentos…',
  found: (n: number) =>
    `Achei ${n} ${n === 1 ? 'item' : 'itens'} no seu prato. Desmarque o que não comeu e ajuste as porções:`,
  portionWarning: 'A porção costuma errar 20–30%. Ajuste antes de gravar.',
  save: (meal: string) => `Gravar no ${meal.toLowerCase()}`,
  keepTitle: 'Guardar as fotos das refeições?',
  keepBody:
    'A foto fica junto da refeição no seu diário. Só a foto que vira refeição é guardada; foto ' +
    'de rótulo ou de pergunta é descartada. Você muda isso em Você.',
  keepYes: 'Guardar',
  keepNo: 'Agora não',
  keptYes: 'Fotos das refeições: guardadas. Muda em Você.',
  keptNo: 'Fotos das refeições: não guardadas. Esta foi descartada.',
  /** Texto de permissão da câmera (Apple 5.1.1): diz o uso de verdade. */
  cameraPermission:
    'O Fatia usa a câmera para fotografar refeições e rótulos. A foto vai para a IA reconhecer ' +
    'os alimentos e só fica guardada se você permitir.',
} as const;

/** Um item da revisão: o que a IA viu, com o peso que a pessoa ajusta e a marca de "comi". */
export interface ReviewItem {
  item: RecognizedFoodItem;
  grams: number;
  checked: boolean;
}

export function reviewItemsFrom(rec: MealRecognition): ReviewItem[] {
  return rec.itens
    .filter((item) => item.grams > 0)
    .map((item) => ({ item, grams: item.grams, checked: true }));
}

const PASSO_G = 10;

/** O −/+ da prancha: 10 g por toque, nunca abaixo de 10 g. */
export function adjustReviewGrams(grams: number, direction: 1 | -1): number {
  return Math.max(PASSO_G, Math.round(grams + direction * PASSO_G));
}

function escala(valor: number | null, r: ReviewItem): number {
  return ((valor ?? 0) * r.grams) / r.item.grams;
}

/** Os kcal do item no peso ajustado (proporcional ao que a IA estimou). */
export function reviewItemKcal(r: ReviewItem): number {
  return Math.round(escala(r.item.kcal, r));
}

export function reviewTotalKcal(items: readonly ReviewItem[]): number {
  return Math.round(items.filter((r) => r.checked).reduce((s, r) => s + escala(r.item.kcal, r), 0));
}

const umaCasa = (n: number) => Math.round(n * 10) / 10;

/**
 * Os itens marcados → `createMeal`. O que casou com a TACO vai por `foodId` e gramas (a API
 * calcula); o resto leva os macros do modelo na escala do peso ajustado. Tudo com o selo IA.
 */
export function reviewMealItems(items: readonly ReviewItem[]): Array<
  | { foodId: number; grams: number; source: MealItemSource }
  | {
      foodName: string;
      grams: number;
      kcal: number;
      proteinG: number;
      carbsG: number;
      fatG: number;
      source: MealItemSource;
    }
> {
  return items
    .filter((r) => r.checked)
    .map((r) =>
      r.item.foodId !== null
        ? { foodId: r.item.foodId, grams: r.grams, source: 'AI' as const }
        : {
            foodName: r.item.nomeReconhecido,
            grams: r.grams,
            kcal: Math.round(escala(r.item.kcal, r)),
            proteinG: umaCasa(escala(r.item.proteinG, r)),
            carbsG: umaCasa(escala(r.item.carbsG, r)),
            fatG: umaCasa(escala(r.item.fatG, r)),
            source: 'AI' as const,
          },
    );
}

/**
 * O 403 do aceite da IA (#384): toda chamada ao provedor, a foto inclusive, exige o aceite da
 * versão atual. A tela mostra o aceite e tenta de novo, em vez de um erro genérico.
 */
export function isAiConsentRequired(err: unknown): boolean {
  if (!(err instanceof ApiError) || err.status !== 403) return false;
  const body = err.body as { code?: unknown } | null | undefined;
  return body?.code === 'AI_CONSENT_REQUIRED';
}

/** Qual estado da Al-M11 um erro de turno vira. `other` fica no cartão de erro de sempre. */
export type AiTurnState = 'quota' | 'down' | 'interrupted' | 'other';

const FORA_DO_AR: ReadonlySet<ChatErrorCode> = new Set<ChatErrorCode>([
  'AI_PROVIDER_ERROR',
  'AI_PROVIDER_NOT_CONFIGURED',
  'AI_PROVIDER_TIMEOUT',
  'AI_PROVIDER_UNREACHABLE',
  'AI_PROVIDER_REFUSED',
  'MCP_NOT_CONFIGURED',
  'MCP_UNREACHABLE',
  'MCP_TIMEOUT',
  'MCP_REFUSED',
  'AI_NETWORK_ERROR',
]);

export function aiTurnState(code: ChatErrorCode): AiTurnState {
  if (code === 'AI_QUOTA_EXCEEDED') return 'quota';
  if (code === 'AGENT_STREAM_INTERRUPTED') return 'interrupted';
  return FORA_DO_AR.has(code) ? 'down' : 'other';
}
