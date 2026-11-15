import type {
  ChatActionPreview,
  ChatConversation,
  ChatConversationState,
  ChatConversationSummary,
  ChatInterruptValue,
  ChatStreamFrame,
} from './chat';
import { nutritionApi, type MealType } from './nutrition';
import { progressApi } from './progress';
import { HOME_TITLE, routeInfo } from './navigation';

/**
 * O menu do botão da IA, "O que vamos registrar?" (ADR 040, prancha
 * `Ia-Drawer`). Web e app montam o mesmo menu, com os mesmos textos e na mesma
 * ordem, a partir daqui: o registro manual primeiro (funciona sem IA, no Free,
 * PRD §3.1), depois as conversas, as sugestões, a foto e o campo para falar com
 * a IA. O botão também mostra o estado da IA (anel e selo), e o cartão
 * "esperando você" aprova uma escrita pausada sem abrir a conversa (ADR 039).
 */

export type AiDrawerManualKey =
  'meal' | 'water' | 'weight' | 'steps' | 'workout' | 'habit' | 'checkin';

export interface AiDrawerManualItem {
  key: AiDrawerManualKey;
  label: string;
  /** Nome do ícone no design system (`@fatia/design`, `ICONS`). */
  icon: 'apple' | 'drop' | 'scale' | 'steps' | 'dumbbell' | 'habit' | 'check';
}

const MANUAL: AiDrawerManualItem[] = [
  { key: 'meal', label: 'Refeição', icon: 'apple' },
  { key: 'water', label: 'Água', icon: 'drop' },
  { key: 'weight', label: 'Peso', icon: 'scale' },
  { key: 'steps', label: 'Passos', icon: 'steps' },
  { key: 'workout', label: 'Treino', icon: 'dumbbell' },
];

const HABITS: AiDrawerManualItem[] = [
  { key: 'habit', label: 'Hábito', icon: 'habit' },
  { key: 'checkin', label: 'Check-in', icon: 'check' },
];

/**
 * Hábito e Check-in só existem com a #390 (etapa 11). Até lá não aparecem, nem
 * desativados: um botão que não faz nada no meio do registro é pior que nenhum.
 */
export const HABITS_IN_AI_DRAWER = false;

export function aiDrawerManualItems(opts: { habits?: boolean } = {}): AiDrawerManualItem[] {
  return (opts.habits ?? HABITS_IN_AI_DRAWER) ? [...MANUAL, ...HABITS] : [...MANUAL];
}

/** O registro manual como o menu mostra hoje. */
export const AI_DRAWER_MANUAL_ITEMS: readonly AiDrawerManualItem[] = aiDrawerManualItems();

/**
 * A refeição que o menu sugere pela hora local. É só o ponto de partida: quem
 * quer outra registra pela Nutrição, tocando no tipo. Madrugada vira lanche —
 * ninguém toma café da manhã às 3h, e jantar às 3h é do dia anterior.
 */
export function mealTypeForTime(now: Date): MealType {
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < 5 * 60) return 'SNACK';
  if (minutes < 10 * 60 + 30) return 'BREAKFAST';
  if (minutes < 15 * 60) return 'LUNCH';
  if (minutes < 18 * 60) return 'SNACK';
  return 'DINNER';
}

/**
 * O treino do menu retoma a sessão aberta em vez de começar outra: a API
 * recusa a segunda sessão aberta (#350), e duas confundiriam o histórico.
 */
export function workoutQuickLabel(hasActiveSession: boolean): string {
  return hasActiveSession ? 'Continuar treino' : 'Começar treino livre';
}

// ---------------------------------------------------------------- IA

/** Sugestões fixas, quando o campo está vazio. Tocar manda a frase para a IA. */
export const AI_DRAWER_SUGGESTIONS: readonly string[] = [
  'Quanto falta de proteína hoje?',
  'Como foi minha semana?',
  'Dor ou cansaço hoje?',
];

/**
 * Frases de registro para completar o que a pessoa começou a digitar (prancha
 * `Al-H6c7`). Lista local e fixa: o servidor não guarda histórico de
 * digitação, e não vai passar a guardar para isto.
 */
const COMPLETIONS: readonly string[] = [
  'Comi arroz, feijão e frango no almoço',
  'Comi um pão com ovo no café',
  'Comi uma fruta de lanche',
  'Bebi 500 ml de água',
  'Bebi um copo de água',
  'Treinei peito e tríceps hoje',
  'Treinei pernas hoje',
  'Troca o exercício que dói o ombro',
  'Pesei 72 kg hoje',
  'Andei 8 mil passos',
  'Quanto falta de proteína hoje?',
  'Quantas calorias comi hoje?',
];

/**
 * Frases para completar: primeiro o `history` (o que a pessoa já registrou,
 * {@link completionHistory}), depois as fixas. Sem repetir, até `max`.
 */
export function completionsFor(draft: string, max = 3, history: readonly string[] = []): string[] {
  const typed = draft.trim().toLowerCase();
  if (!typed) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const f of [...history, ...COMPLETIONS]) {
    const phrase = f.toLowerCase();
    if (!phrase.startsWith(typed) || phrase === typed || seen.has(phrase)) continue;
    seen.add(phrase);
    out.push(f);
    if (out.length === max) break;
  }
  return out;
}

/**
 * O que a pessoa já registrou, como frase para completar (prancha `Al-H6c7`).
 * A API não guarda o texto que a pessoa mandou fora da conversa, e não vai
 * passar a guardar só para isto: vale o título das conversas recentes (a IA o
 * tira da primeira mensagem) e os alimentos que ela comeu nos últimos 60 dias
 * (`nutritionApi.myFoods`), como "Comi …".
 */
export function completionHistory(
  conversations: readonly ChatConversationSummary[],
  foods: readonly { name: string }[],
): string[] {
  const phrases = [
    ...conversations.map((c) => c.title?.trim() ?? ''),
    ...foods.map((f) => `Comi ${f.name.trim().toLocaleLowerCase('pt-BR')}`),
  ].filter((p) => p && p !== 'Comi ');
  return [...new Set(phrases)];
}

export interface DrawerChipSection {
  title: 'Sugestões' | 'Completar';
  chips: string[];
  /** `send` manda a frase para a IA; `fill` troca o rascunho por ela. */
  onTap: 'send' | 'fill';
}

/**
 * Os chips acima do campo. Texto livre que nenhuma frase completa não mostra
 * nada — antes ficava só o rótulo "Completar", solto, sem chip.
 */
export function drawerChipSection(
  draft: string,
  history: readonly string[] = [],
): DrawerChipSection | null {
  if (!draft.trim()) {
    return { title: 'Sugestões', chips: [...AI_DRAWER_SUGGESTIONS], onTap: 'send' };
  }
  const chips = completionsFor(draft, 3, history);
  return chips.length ? { title: 'Completar', chips, onTap: 'fill' } : null;
}

const SUGGESTION_ICONS: Record<string, 'target' | 'chart' | 'dumbbell'> = {
  'Quanto falta de proteína hoje?': 'target',
  'Como foi minha semana?': 'chart',
  'Dor ou cansaço hoje?': 'dumbbell',
};

/** O ícone da dica (prancha `Al-H6c5`); frase de completar não tem. */
export function suggestionIcon(phrase: string): 'target' | 'chart' | 'dumbbell' | null {
  return SUGGESTION_ICONS[phrase] ?? null;
}

// ---------------------------------------------------------------- o notch

/** A prancha `Al-H6c5` é de 390 px de largura; o resto escala a partir dela. */
const FRAME_WIDTH = 390;
/** Acima disso (coluna do desktop) a altura do notch para de crescer. */
const FRAME_MAX_HEIGHT_WIDTH = 480;

export interface AiMenuFrame {
  /** Distância do notch ao topo, px. */
  top: number;
  /** Margem do notch dos dois lados, px. */
  inset: number;
  height: number;
  radius: number;
  /** A tela, no tamanho real, encolhe para caber entre as margens. */
  scale: number;
  /** Quanto a tela sobe dentro do notch (o topo dela fica escondido), px. */
  lift: number;
  /** Onde começa a linha do voltar, logo abaixo do notch. */
  headerTop: number;
}

/**
 * Onde a tela atual vai parar quando o menu da IA abre: um notch arredondado
 * no topo (prancha `Al-H6c5`; com o teclado, `Al-H6c7`, mais baixo). Web e app
 * animam até estes números.
 */
export function aiMenuFrame(width: number, opts: { keyboard?: boolean } = {}): AiMenuFrame {
  const k = width / FRAME_WIDTH;
  const hk = Math.min(width, FRAME_MAX_HEIGHT_WIDTH) / FRAME_WIDTH;
  const top = 8;
  const height = (opts.keyboard ? 112 : 160) * hk;
  return {
    top,
    inset: 36 * k,
    height,
    radius: 32,
    scale: 0.815,
    lift: 30 * hk,
    headerTop: top + height + 16,
  };
}

/** Arrastar o notch para baixo além disto fecha o menu. */
export const AI_MENU_DRAG_CLOSE_PX = 48;

/** O voltar do menu diz para onde volta: a tela que encolheu no notch. */
export function aiMenuBackLabel(pathname: string): string {
  const { title } = routeInfo(pathname);
  if (!title) return 'Voltar';
  return title === HOME_TITLE ? `Voltar para o ${HOME_TITLE}` : `Voltar para ${title}`;
}

/**
 * O texto do campo. Com conversa em andamento (Al-H6c9), deixa claro que
 * escrever ali abre outra conversa, não responde a que espera.
 */
export function aiMenuPlaceholder(conversations: readonly ChatConversationSummary[]): string {
  return conversations.some((c) => c.state === 'waiting' || c.state === 'thinking')
    ? 'Nova conversa…'
    : 'Comi, treinei… ou pergunte';
}

/** O bloco do Free (prancha `Al-H6c6`): o que a IA Pro faria, e para onde ir. */
export const AI_PRO_TEASER = {
  title: 'Com a IA Pro',
  lead: 'Registre falando ou por foto',
  body: 'A Fatia anota e você só confere',
  items: ['Foto do prato vira registro', 'Quanto falta de proteína?', 'Trocar exercício com dor'],
  /** O chat bloqueado (Al-M1). */
  href: '/plan?recurso=chat',
} as const;

/**
 * O botão do bloco Free. Sem compra no app (iOS, `plan-offer.ts`), a loja
 * proíbe oferecer o PRO: o caminho é o código da comunidade.
 */
export function freeOfferCta(canPurchase: boolean): { label: string; href: string } {
  return canPurchase
    ? { label: 'Ver o PRO', href: '/plan' }
    : { label: 'Código da comunidade', href: '/community' };
}

// ---------------------------------------------------------------- estado do botão

export interface AiFabState {
  /** Alguma conversa com resposta correndo: o anel "trabalhando". */
  thinking: boolean;
  /** Quantas conversas esperam a pessoa (pausa aberta): o selo. */
  waiting: number;
}

export function aiFabState(
  conversations: readonly ChatConversationSummary[] | undefined,
): AiFabState {
  const list = conversations ?? [];
  return {
    thinking: list.some((c) => c.state === 'thinking'),
    waiting: list.filter((c) => c.state === 'waiting').length,
  };
}

/** Nome acessível do botão. O selo e o anel são visuais; quem não vê ouve o estado. */
export function aiFabLabel(state: AiFabState, opts: { locked?: boolean } = {}): string {
  if (opts.locked) return 'Abrir registro (IA no Pro)';
  if (state.waiting > 0) return `IA · ${state.waiting} esperando você`;
  if (state.thinking) return 'IA trabalhando · abrir';
  return 'Abrir a IA';
}

// ---------------------------------------------------------------- conversas

const STATE_ORDER: Record<ChatConversationState, number> = { waiting: 0, thinking: 1, idle: 2 };

/**
 * As conversas da seção "Conversas": em andamento no topo (esperando, depois
 * pensando) e depois as recentes, poucas linhas.
 */
export function drawerConversations(
  conversations: readonly ChatConversationSummary[],
  limit = 4,
): ChatConversationSummary[] {
  return [...conversations]
    .sort(
      (a, b) =>
        STATE_ORDER[a.state ?? 'idle'] - STATE_ORDER[b.state ?? 'idle'] ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, limit);
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** O que vai à direita da conversa: o estado, ou quando foi ("hoje, 12:41", "ontem"). */
export function conversationTimeLabel(c: ChatConversationSummary, now: Date = new Date()): string {
  if (c.state === 'waiting') return 'esperando você';
  if (c.state === 'thinking') return 'pensando…';
  const at = new Date(c.updatedAt);
  if (sameDay(at, now)) {
    const hh = String(at.getHours()).padStart(2, '0');
    const mm = String(at.getMinutes()).padStart(2, '0');
    return `hoje, ${hh}:${mm}`;
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) return 'ontem';
  return at.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

// ---------------------------------------------------------------- cartão "esperando você"

/**
 * Até quantas linhas de prévia o cartão fora da conversa mostra. Acima disso a
 * prévia não cabe inteira, e aprovar sem ver tudo não vale (ADR 039 §6).
 */
export const PENDING_CARD_MAX_LINES = 6;

/**
 * O que o cartão "Fatia · esperando você" oferece: `approve` ("Gravar assim")
 * só com **uma** escrita a confirmar e a prévia válida e inteira no cartão;
 * qualquer outra coisa (pergunta, várias escritas, prévia grande, inválida ou
 * ainda carregando) vira `open` ("Abrir conversa").
 */
export function pendingCardMode(
  value: ChatInterruptValue,
  preview: ChatActionPreview | null | undefined,
): 'approve' | 'open' {
  if (value.kind !== 'confirm') return 'open';
  if (value.actions.length !== 1 || value.actions[0]!.kind !== 'confirm') return 'open';
  if (!preview || !preview.valida) return 'open';
  return preview.linhas.length <= PENDING_CARD_MAX_LINES ? 'approve' : 'open';
}

export interface OpenInterrupt {
  id: string;
  value: ChatInterruptValue;
}

/**
 * A pausa que espera a pessoa nesta conversa: a da **última** resposta do
 * assistente, se ela ainda está `interrupted`. Uma resposta depois dela (a
 * pessoa escreveu outra coisa) já encerrou a pausa.
 */
export function openInterrupt(
  conversation: Pick<ChatConversation, 'messages'>,
): OpenInterrupt | null {
  const last = [...conversation.messages].reverse().find((m) => m.role === 'assistant');
  const meta = last?.metadata;
  if (!meta || meta.status !== 'interrupted' || !meta.interrupt) return null;
  return meta.interrupt;
}

/**
 * O `resume` do "Gravar assim": responde **a esta** pausa (o agente confere o
 * `interruptId` e devolve 409 se a conversa andou) e aprova só a escrita que o
 * cartão mostrou. Os argumentos não vão junto: o agente executa os que estão
 * no checkpoint, literais (ADR 039 §6).
 */
export function approvalResume(interrupt: OpenInterrupt): {
  interruptId: string;
  value: { approvals: Record<string, boolean> };
} {
  const approvals: Record<string, boolean> = {};
  for (const action of interrupt.value.actions) {
    if (action.kind === 'confirm') approvals[action.toolCallId] = true;
  }
  return { interruptId: interrupt.id, value: { approvals } };
}

// ---------------------------------------------------------------- desfazer

/** Escritas que o "Gravar assim" sabe desfazer: as do registro rápido. */
export type UndoableTool = 'log_meal' | 'log_water' | 'log_weight' | 'log_steps';

export interface UndoableWrite {
  tool: UndoableTool;
  /** Id do registro criado, como a API o devolveu no resultado da tool. */
  id: string;
  /** "Almoço gravado", o texto do aviso com "Desfazer". */
  message: string;
}

const MEAL_SAVED: Record<MealType, string> = {
  BREAKFAST: 'Café da manhã gravado',
  LUNCH: 'Almoço gravado',
  SNACK: 'Lanche gravado',
  DINNER: 'Jantar gravado',
};

const SAVED: Record<Exclude<UndoableTool, 'log_meal'>, string> = {
  log_water: 'Água gravada',
  log_weight: 'Peso gravado',
  log_steps: 'Passos gravados',
};

/**
 * Onde está o id no resultado de cada tool: a refeição volta inteira; água,
 * peso e passos voltam com o total do dia e o id do registro
 * (`apps/api/src/progress/*-log.service.ts`).
 */
const ID_FIELD: Record<UndoableTool, string> = {
  log_meal: 'id',
  log_water: 'waterLogId',
  log_weight: 'weightLogId',
  log_steps: 'stepLogId',
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

function parseJson(text: unknown): unknown {
  if (typeof text !== 'string') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/**
 * O que desfazer depois de aprovar pelo cartão (prancha `Al-H6c8`: "Almoço
 * gravado · Desfazer"). O registro criado chega no resultado da tool aprovada
 * (`toolCallId`), dentro do quadro `updates` do próprio turno: o texto é o
 * JSON que a API devolveu, com o id do registro. Fora das escritas conhecidas, com erro
 * ou sem id, não há "Desfazer" (o aviso fica só "Gravado").
 */
export function undoableWrite(
  frames: readonly ChatStreamFrame[],
  toolCallId: string,
): UndoableWrite | null {
  for (const frame of frames) {
    if (frame.event !== 'updates' || !isObject(frame.data)) continue;
    for (const node of Object.values(frame.data)) {
      const messages = isObject(node) && Array.isArray(node.messages) ? node.messages : [];
      for (const m of messages as unknown[]) {
        if (!isObject(m) || m.type !== 'tool' || m.tool_call_id !== toolCallId) continue;
        if (m.status === 'error') return null;
        const out = parseJson(m.content);
        const tool = m.name;
        if (!isObject(out) || typeof tool !== 'string' || !(tool in ID_FIELD)) return null;
        const id = out[ID_FIELD[tool as UndoableTool]];
        if (typeof id !== 'string') return null;
        if (tool === 'log_meal') {
          const type = out.mealType as MealType;
          return { tool, id, message: MEAL_SAVED[type] ?? 'Refeição gravada' };
        }
        const t = tool as Exclude<UndoableTool, 'log_meal'>;
        return { tool: t, id, message: SAVED[t] };
      }
    }
  }
  return null;
}

/**
 * Apaga o registro que o "Gravar assim" criou. Cada endpoint confere o dono
 * pelo token (ADR 010): um id de outra pessoa dá 404, nunca apaga.
 */
export function undoWrite(write: UndoableWrite): Promise<void> {
  switch (write.tool) {
    case 'log_meal':
      return nutritionApi.deleteMeal(write.id);
    case 'log_water':
      return progressApi.deleteWater(write.id);
    case 'log_weight':
      return progressApi.deleteWeight(write.id);
    case 'log_steps':
      return progressApi.deleteStep(write.id);
  }
}
