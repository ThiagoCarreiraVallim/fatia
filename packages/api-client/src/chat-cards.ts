import { apiFetch } from './http';
import { ROUTES } from './navigation';
import type { ChatArtifact, ChatInterruptValue } from './chat';

/**
 * O que a tela do chat precisa para desenhar as ferramentas (#384): o contrato de cartão de
 * cada tool, o botão do "só no app", os agrupamentos, as pílulas de resposta e os aceites.
 * Tudo puro e igual no PWA e no app — a tela só desenha.
 */

// ---------------------------------------------------------------- catálogo

/** O formato do cartão de uma consulta (prancha IA-Cartoes). `report` é a Tabela. */
export type ChatCardFormat =
  | 'metric'
  | 'bars'
  | 'timeline'
  | 'list'
  | 'report'
  | 'range'
  | 'progress'
  | 'comparison'
  | 'scoreboard'
  | 'badges'
  | 'instructions'
  | 'file'
  // O cartão de confirmação de toda escrita confirmável (Gravar / Ajustar).
  | 'confirm';

/** Uma tool como o chat a vê (`GET /api/chat/tool-catalog`). */
export interface ChatToolCatalogEntry {
  title: string;
  /** `read` responde na hora; `confirm` pede o sim; `app_only` a IA nunca faz e leva à tela. */
  kind: 'read' | 'confirm' | 'app_only';
  card?: ChatCardFormat;
  appOnly?: { screen: string; path: string };
}

export type ChatToolCatalog = Record<string, ChatToolCatalogEntry>;

/**
 * As ferramentas que moram no agente, fora do `/mcp` — e por isso fora do catálogo da API —,
 * com o cartão de cada uma. Toda ferramenta tem formato explícito (#384), estas inclusive.
 */
export const AGENT_LOCAL_TOOLS = {
  ask_user: { title: 'Perguntar', card: 'question' },
  web_search: { title: 'Buscar na web', card: 'sources' },
  open_in_app: { title: 'Abrir no app', card: 'app_only' },
} as const;

export function getChatToolCatalog(): Promise<ChatToolCatalog> {
  return apiFetch('/api/chat/tool-catalog');
}

/** O padrão de rota sem os nomes dos parâmetros: `/a/:id` e `/a/:planId` são a mesma tela. */
const formaDaRota = (pattern: string) => pattern.replace(/:[^/]+/g, ':');

/**
 * O link do botão "Abrir …" de uma ação só do app. Cada `:campo` vira o argumento de mesmo
 * nome que a IA mandou. Sem ele, abre a tela-mãe declarada em `ROUTES` — um link com `:id` cru
 * seria uma tela de erro.
 */
export function appOnlyHref(
  entry: ChatToolCatalogEntry | undefined,
  params: Record<string, string>,
): string | null {
  const path = entry?.appOnly?.path;
  if (!path) return null;
  let faltou = false;
  const preenchido = path.replace(/:([^/]+)/g, (_, nome: string) => {
    const valor = params[nome];
    if (!valor) faltou = true;
    return valor ? encodeURIComponent(valor) : '';
  });
  if (!faltou) return preenchido;
  // Sobe pelas mães até uma rota sem parâmetro (a mãe também pode ter `:id`).
  let atual: string = path;
  for (let passos = 0; atual.includes(':') && passos < 5; passos += 1) {
    const rota = ROUTES.find((r) => formaDaRota(r.pattern) === formaDaRota(atual));
    atual = rota?.parent ?? atual.slice(0, atual.indexOf('/:'));
  }
  return atual.includes(':') ? '/' : atual || '/';
}

// ---------------------------------------------------------------- cabeçalho do cartão

/** Número em pt-BR, como o cartão mostra: `8.884`, `70,2`. */
export function formatChatNumber(valor: number, casas = 1): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: casas });
}

const comUnidade = (valor: number, unidade?: string) =>
  `${formatChatNumber(valor)}${unidade ? ` ${unidade}` : ''}`;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const naFaixa = (r: { value: number; min?: number | null; max?: number | null }) =>
  (r.min == null || r.value >= r.min) && (r.max == null || r.value <= r.max);

/**
 * O título do cartão: o resultado, e não o nome da ferramenta, que vai pequeno em cima
 * (prancha IA-Cartoes, "Cabeçalho igual em todos"). É também o que sobra na linha quando o
 * cartão recolhe: "Resumo de hoje · 934 kcal".
 */
export function chatCardTitle(a: ChatArtifact): string {
  switch (a.kind) {
    case 'metric':
      return a.label ?? comUnidade(a.value, a.unit);
    case 'bars':
      return a.average != null
        ? `${comUnidade(a.average, a.unit)} por dia`
        : (a.label ?? 'Por dia');
    case 'timeline': {
      const ultimo = a.events.at(-1);
      return ultimo ? comUnidade(ultimo.value, a.unit) : (a.label ?? 'Sem registros');
    }
    case 'list':
      return a.label ?? plural(a.items.length, 'item', 'itens');
    case 'report':
      return a.label ?? plural(a.rows.length, 'linha', 'linhas');
    case 'range': {
      const fora = a.rows.filter((r) => !naFaixa(r)).length;
      return fora === 0 ? 'Hoje, na faixa' : `${fora} fora da faixa`;
    }
    case 'progress':
      return plural(a.items.length, 'meta', 'metas');
    case 'comparison':
      return a.label ?? 'Comparação';
    case 'scoreboard': {
      const voce = a.entries.find((e) => e.you);
      const posicao = voce
        ? `você em ${voce.position}º`
        : plural(a.entries.length, 'pessoa', 'pessoas');
      return a.label ? `${a.label} · ${posicao}` : posicao;
    }
    case 'badges':
      return `${a.unlocked} de ${a.total} desbloqueadas`;
    case 'instructions':
      return a.label ?? plural(a.steps.length, 'passo', 'passos');
    case 'file':
      return a.label ?? 'Seus dados estão prontos';
    case 'sources':
      return `Fontes · ${plural(a.sources.length, 'site', 'sites')}`;
    case 'app_only':
      return `${a.title ?? 'Isso'} é pelo app`;
    case 'saved':
      return a.label ?? 'Gravado';
  }
}

/** "Nada encontrado": a consulta rodou e voltou sem linha nenhuma (fica neutra, não vermelha). */
export function isEmptyChatArtifact(a: ChatArtifact): boolean {
  switch (a.kind) {
    case 'timeline':
      return a.events.length === 0;
    case 'report':
    case 'range':
      return a.rows.length === 0;
    case 'list':
    case 'progress':
    case 'comparison':
      return a.items.length === 0;
    case 'bars':
      return a.bars.length === 0;
    case 'scoreboard':
      return a.entries.length === 0;
    case 'badges':
      return a.total === 0;
    case 'instructions':
      return a.steps.length === 0;
    case 'sources':
      return a.sources.length === 0;
    default:
      return false;
  }
}

// ---------------------------------------------------------------- linhas das ferramentas

export type ToolCallStatus = 'running' | 'done' | 'empty' | 'error' | 'declined' | 'pending';

export type ToolCallSegment<T> = { type: 'single'; item: T } | { type: 'group'; items: T[] };

/** A partir de quantas consultas seguidas elas fecham numa linha (prancha IA-Estados). */
export const TOOL_GROUP_MIN = 2;

/**
 * Agrupa as consultas seguidas já terminadas em "Consultei N coisas". Nunca agrupa o que roda
 * (a pessoa precisa ver o que está acontecendo) nem um trecho com falha (o erro não pode sumir
 * dentro de uma linha fechada).
 */
export function groupToolCalls<T extends { status: ToolCallStatus }>(
  calls: readonly T[],
  min = TOOL_GROUP_MIN,
): ToolCallSegment<T>[] {
  const algumaFalhou = calls.some((c) => c.status === 'error');
  const segmentos: ToolCallSegment<T>[] = [];
  let corrida: T[] = [];
  const fechar = () => {
    if (corrida.length >= min && !algumaFalhou) segmentos.push({ type: 'group', items: corrida });
    else segmentos.push(...corrida.map((item) => ({ type: 'single' as const, item })));
    corrida = [];
  };
  for (const call of calls) {
    if (call.status === 'done' || call.status === 'empty') corrida.push(call);
    else {
      fechar();
      segmentos.push({ type: 'single', item: call });
    }
  }
  fechar();
  return segmentos;
}

export function collapsedLabel(n: number): string {
  return `Consultei ${n} ${n === 1 ? 'coisa' : 'coisas'}`;
}

// ---------------------------------------------------------------- respostas rápidas

/** O próximo passo natural depois de cada consulta (prancha IA-Conversas). */
const SEGUIMENTOS: Record<string, string[]> = {
  get_week_summary: ['E a alimentação?', 'Ver o dia'],
  get_today_summary: ['E a semana?', 'Quanto falta de proteína?'],
  get_nutrition_summary: ['E a semana?', 'Quanto falta de proteína?'],
  list_meals: ['E de proteína?', 'Compare com ontem'],
  get_last_set_for_exercise: ['Registrar série', 'Como fazer?'],
  get_load_prescription: ['Registrar série', 'Como fazer?'],
  get_weight_progress: ['E os passos?', 'Como estou na meta?'],
  get_steps_history: ['E a água?', 'Como estou na meta?'],
  get_steps_progress: ['E a água?', 'Como estou na meta?'],
  get_water_for_date: ['Me lembra mais tarde'],
  list_goals: ['Criar meta'],
  get_challenge_leaderboard: ['Quais desafios estão abertos?'],
};

export interface QuickReplyState {
  interrupt?: ChatInterruptValue | null;
  lastTool?: string | null;
  running?: boolean;
}

/** As pílulas acima do campo. Tocar numa manda o texto dela como mensagem (ou resposta). */
export function quickReplies(state: QuickReplyState): string[] {
  if (state.running) return [];
  const pausa = state.interrupt;
  if (pausa?.kind === 'continue') return ['Continuar', 'Parar aqui'];
  if (pausa?.kind === 'question') {
    const [acao] = pausa.actions;
    const campos = acao && acao.kind === 'question' ? acao.fields : [];
    const [campo] = campos;
    if (campos.length === 1 && campo?.type === 'select' && campo.options?.length) {
      return campo.options.slice(0, 4);
    }
    if (campos.length === 1 && campo?.type === 'boolean') return ['Sim', 'Não'];
    return [];
  }
  if (pausa) return [];
  return state.lastTool ? (SEGUIMENTOS[state.lastTool] ?? []) : [];
}

// ---------------------------------------------------------------- lista de conversas

export interface ConversationDayGroup<T> {
  label: 'Hoje' | 'Esta semana' | 'Antes';
  items: T[];
}

const inicioDoDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Hoje, Esta semana (os 6 dias antes de hoje) e Antes, na hora local do aparelho. */
export function groupConversationsByDay<T extends { updatedAt: string }>(
  conversations: readonly T[],
  now: Date = new Date(),
): ConversationDayGroup<T>[] {
  const hoje = inicioDoDia(now);
  const semana = hoje - 6 * 86_400_000;
  const grupos: ConversationDayGroup<T>[] = [
    { label: 'Hoje', items: [] },
    { label: 'Esta semana', items: [] },
    { label: 'Antes', items: [] },
  ];
  for (const c of conversations) {
    const dia = inicioDoDia(new Date(c.updatedAt));
    grupos[dia >= hoje ? 0 : dia >= semana ? 1 : 2]!.items.push(c);
  }
  return grupos.filter((g) => g.items.length > 0);
}

// ---------------------------------------------------------------- aceites

/** As versões dos textos; as mesmas de `AI_CONSENT_VERSIONS` na API. Mudar o texto é mudar aqui. */
export const AI_CONSENT_VERSIONS = { chat: '2026-11-16', webSearch: '2026-11-16' } as const;

export const AI_CONSENT_TEXTS = {
  chat: {
    title: 'Antes de conversar',
    body:
      'Suas mensagens e os dados que a IA consulta (refeições, treinos, metas) vão para o ' +
      'OpenRouter, que encaminha ao modelo GLM 5.3 Flash, da Z.ai, para gerar as respostas. ' +
      'Só usamos servidores que não guardam o que recebem e não treinam modelos com isso.',
    link: 'Como tratamos seus dados',
    accept: 'Concordo',
    decline: 'Agora não',
  },
  webSearch: {
    title: 'Buscar na web?',
    body:
      'Só o texto da pergunta vai para a Exa, o serviço de busca, pelo OpenRouter, sem seu ' +
      'nome nem seus dados. A regra de não guardar o que recebem, das conversas, não vale para ' +
      'a busca: a Exa pode guardar a pergunta. As fontes aparecem num cartão no fim.',
    accept: 'Concordo e buscar',
    decline: 'Responder sem a web',
    footnote: 'Dá para desligar no globo, no topo do chat.',
  },
} as const;

export type AiConsentTopic = 'chat' | 'web_search';

export interface AiConsentState {
  accepted: boolean;
  version: string;
  acceptedAt: string | null;
}

export interface AiConsentStatus {
  chat: AiConsentState;
  webSearch: AiConsentState;
  webSearchEnabled: boolean;
}

export function getAiConsent(): Promise<AiConsentStatus> {
  return apiFetch('/api/chat/consent');
}

export function acceptAiConsent(topic: AiConsentTopic): Promise<AiConsentStatus> {
  const version = topic === 'chat' ? AI_CONSENT_VERSIONS.chat : AI_CONSENT_VERSIONS.webSearch;
  return apiFetch('/api/chat/consent', {
    method: 'POST',
    body: JSON.stringify({ topic, version }),
  });
}

export function setWebSearchEnabled(webSearchEnabled: boolean): Promise<AiConsentStatus> {
  return apiFetch('/api/chat/preferences', {
    method: 'PATCH',
    body: JSON.stringify({ webSearchEnabled }),
  });
}

/** Rótulo do motivo `slow` na prancha IA-Estados. */
export const CHAT_FEEDBACK_REASON_LABELS = {
  wrong_data: 'Usou os dados errados',
  incorrect: 'Informação errada',
  incomplete: 'Incompleta',
  did_not_follow: 'Não fez o que pedi',
  slow: 'Demorou',
  other: 'Outro',
} as const;
