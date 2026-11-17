import { apiFetch } from './http';
import { ROUTES } from './navigation';
import type { ChatArtifact, ChatInterruptValue } from './chat';
import type { ChatThreadMessage, ChatToolPart } from './chat-thread';

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
  if (!isRenderableChatArtifact(a)) return 'Cartão';
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

/**
 * O campo de que o desenho de cada formato depende (o mesmo `CAMPO_OBRIGATORIO` do agente).
 * Lista em vez de `switch` para que um formato novo, vindo de uma API mais nova, caia fora.
 */
const CAMPO_DO_FORMATO: Record<
  ChatArtifact['kind'],
  { campo: string; tipo: 'array' | 'number' | 'string' | 'object' }
> = {
  metric: { campo: 'value', tipo: 'number' },
  bars: { campo: 'bars', tipo: 'array' },
  timeline: { campo: 'events', tipo: 'array' },
  list: { campo: 'items', tipo: 'array' },
  report: { campo: 'rows', tipo: 'array' },
  range: { campo: 'rows', tipo: 'array' },
  progress: { campo: 'items', tipo: 'array' },
  comparison: { campo: 'items', tipo: 'array' },
  scoreboard: { campo: 'entries', tipo: 'array' },
  badges: { campo: 'badges', tipo: 'array' },
  instructions: { campo: 'steps', tipo: 'array' },
  file: { campo: 'url', tipo: 'string' },
  sources: { campo: 'sources', tipo: 'array' },
  app_only: { campo: 'params', tipo: 'object' },
  saved: { campo: 'lines', tipo: 'array' },
};

/**
 * Se o cartão sabe desenhar esta carga. Um formato que este cliente não conhece (app antigo,
 * API nova) ou sem o campo principal vira o aviso neutro em vez de derrubar a conversa.
 */
export function isRenderableChatArtifact(a: unknown): a is ChatArtifact {
  if (!a || typeof a !== 'object') return false;
  const kind = (a as { kind?: unknown }).kind;
  if (typeof kind !== 'string' || !Object.prototype.hasOwnProperty.call(CAMPO_DO_FORMATO, kind))
    return false;
  const { campo, tipo } = CAMPO_DO_FORMATO[kind as ChatArtifact['kind']];
  const valor = (a as Record<string, unknown>)[campo];
  if (tipo === 'array') return Array.isArray(valor);
  if (tipo === 'object') return !!valor && typeof valor === 'object';
  return typeof valor === tipo;
}

/** O aviso no lugar de um cartão que este cliente não sabe desenhar. */
export const UNKNOWN_CHAT_ARTIFACT_TEXT = 'Este cartão precisa de uma versão mais nova do Fatia.';

/** "Nada encontrado": a consulta rodou e voltou sem linha nenhuma (fica neutra, não vermelha). */
export function isEmptyChatArtifact(a: ChatArtifact): boolean {
  if (!isRenderableChatArtifact(a)) return false;
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

export type ToolCallStatus =
  'running' | 'done' | 'empty' | 'error' | 'declined' | 'not_run' | 'pending';

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

/** O desfecho gravado de uma chamada, no estado da linha (o app; o PWA lê do runtime). */
export function toolCallStatusOf(tool: ChatToolPart, artifact?: ChatArtifact): ToolCallStatus {
  switch (tool.status) {
    case 'running':
      return 'running';
    case 'success':
      return artifact && isEmptyChatArtifact(artifact) ? 'empty' : 'done';
    case 'error':
      return 'error';
    case 'refused':
      return 'declined';
    case 'not_run':
      return 'not_run';
  }
}

/**
 * O texto da linha de uma tool (prancha IA-Estados): o desfecho depois de um "·". `write` é a
 * tool que grava (não diz "Consultando"); `cardTitle`, o resultado da consulta recolhida;
 * `savedAt`, a hora da escrita feita.
 */
export function toolLineLabel(
  title: string,
  status: ToolCallStatus,
  opts: { write?: boolean; cardTitle?: string; savedAt?: string } = {},
): string {
  switch (status) {
    case 'running':
      return opts.write ? `${title}…` : `Consultando ${title}…`;
    case 'pending':
      return `${title} · aguardando sua confirmação`;
    case 'empty':
      return `${title} · nada encontrado`;
    case 'error':
      return `${title} · não deu certo`;
    case 'declined':
      return `${title} · você recusou`;
    case 'not_run':
      return `${title} · não chegou a rodar`;
    case 'done':
      if (opts.savedAt) return `${title} · gravado às ${opts.savedAt}`;
      return opts.cardTitle ? `${title} · ${opts.cardTitle}` : title;
  }
}

/**
 * A linha da busca na web fala da busca, não da ferramenta (pranchas IA-Estados e Al-M16):
 * "Pesquisei na web · 3 sites", "nada confiável" quando não achou fonte boa, e "indisponível"
 * quando o serviço falhou — a resposta segue sem a web nos dois casos.
 */
export function webSearchLineLabel(status: ToolCallStatus, sites?: number): string {
  switch (status) {
    case 'running':
      return 'Pesquisando na web…';
    case 'pending':
      return 'Buscar na web · aguardando sua confirmação';
    case 'empty':
      return 'Pesquisei na web · nada confiável';
    case 'error':
      return 'Busca na web indisponível agora';
    case 'declined':
      return 'Busca na web · você recusou';
    case 'not_run':
      return 'Busca na web · não chegou a rodar';
    case 'done':
      return sites === undefined
        ? 'Pesquisei na web'
        : `Pesquisei na web · ${plural(sites, 'site', 'sites')}`;
  }
}

/** O texto pequeno acima do título do cartão: o nome da ferramenta; no só no app, "Só no app". */
export function cardEyebrow(kind: string, toolTitle: string | undefined): string | undefined {
  return kind === 'app_only' ? 'Só no app' : toolTitle;
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-10-06" → "6 out". Lê só a data, sem fuso: o dia é o que a tool gravou. */
function diaCurto(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  return mes && dia ? `${dia} ${MESES[mes - 1]}` : iso;
}

/** O período da variação da linha do tempo: "em 30 dias", do primeiro ao último ponto. */
export function timelinePeriodLabel(events: readonly { date: string }[]): string {
  const dia = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00Z`);
  const primeiro = events[0];
  const ultimo = events.at(-1);
  const dias =
    primeiro && ultimo ? Math.round((dia(ultimo.date) - dia(primeiro.date)) / 86_400_000) : 0;
  if (!Number.isFinite(dias) || dias <= 0) return 'no período';
  return `em ${plural(dias, 'dia', 'dias')}`;
}

/** As datas embaixo da curva da linha do tempo: a primeira, a do meio e a última. */
export function timelineAxisLabels(events: readonly { date: string }[]): string[] {
  if (events.length === 0) return [];
  const indices = [...new Set([0, Math.floor((events.length - 1) / 2), events.length - 1])];
  return indices.map((i) => diaCurto(events[i]!.date));
}

/** A última tool da última resposta, para as respostas rápidas; nada se a pessoa falou por último. */
export function lastToolName(messages: readonly ChatThreadMessage[]): string | null {
  const ultima = messages.at(-1);
  if (ultima?.role !== 'assistant') return null;
  return ultima.tools.at(-1)?.name ?? null;
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

/**
 * As versões dos textos; as mesmas de `AI_CONSENT_VERSIONS` na API. Mudar o texto é mudar a
 * versão aqui e lá — o teste amarra um hash do texto à versão, para não esquecer.
 */
export const AI_CONSENT_VERSIONS = { chat: '2026-11-17', webSearch: '2026-11-17' } as const;

/**
 * Os textos dos aceites. Os nomes (`{provider}`, `{model}`, `{searchEngine}`) não moram aqui:
 * vêm da API (`AiConsentStatus.processor`, das envs `AI_CONSENT_*`) por `aiConsentBody`.
 */
export const AI_CONSENT_TEXTS = {
  chat: {
    title: 'Antes de conversar',
    body:
      'Suas mensagens e os dados que a IA consulta (refeições, treinos, metas) vão para o ' +
      '{provider}, que encaminha ao modelo {model}, para gerar as respostas. O Fatia pede ao ' +
      '{provider} só servidores de retenção zero, que declaram não guardar o que recebem nem ' +
      'treinar modelos com isso.',
    link: 'Como tratamos seus dados',
    accept: 'Concordo',
    decline: 'Agora não',
  },
  webSearch: {
    title: 'Buscar na web?',
    body:
      'Só a pergunta da busca vai para a {searchEngine}, o serviço de busca, pelo {provider}. ' +
      'Ela é escrita a partir da sua última mensagem, sem o seu perfil, as memórias ou o resto ' +
      'da conversa, e sem e-mail, telefone nem documento. A retenção zero das conversas não ' +
      'vale para a busca: a {searchEngine} pode guardar a pergunta. As fontes aparecem num ' +
      'cartão no fim.',
    accept: 'Concordo e buscar',
    decline: 'Responder sem a web',
    footnote: 'Dá para desligar no globo, no topo do chat.',
  },
} as const;

/** Quem recebe: o provedor, o modelo e a busca, como a API os nomeia (`AI_CONSENT_*`). */
export interface AiProcessor {
  provider: string;
  model: string;
  searchEngine: string;
}

/** O texto do aceite com os nomes de verdade, vindos da API. */
export function aiConsentBody(topic: AiConsentTopic, processor: AiProcessor): string {
  const corpo = topic === 'chat' ? AI_CONSENT_TEXTS.chat.body : AI_CONSENT_TEXTS.webSearch.body;
  return corpo
    .replaceAll('{provider}', processor.provider)
    .replaceAll('{model}', processor.model)
    .replaceAll('{searchEngine}', processor.searchEngine);
}

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
  /** Os nomes que o texto do aceite mostra (`aiConsentBody`). */
  processor: AiProcessor;
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

// ---------------------------------------------------------------- lote da pausa

/** Quantas decisões o lote pede: escritas e buscas (as perguntas têm campo, não botão). */
export function pauseDecisionCount(actions: ChatInterruptValue['actions']): number {
  return actions.filter((a) => a.kind === 'confirm' || a.kind === 'web_consent').length;
}

/**
 * No lote, tocar "Concordo e buscar" só escolhe; o aceite da busca é gravado no "Enviar", e só
 * se a escolha final for concordar e ainda não houver aceite. Mudar de ideia não grava nada.
 */
export function webConsentToSaveOnSend(
  actions: ChatInterruptValue['actions'],
  approvals: Record<string, boolean>,
  alreadyAccepted: boolean,
): boolean {
  if (alreadyAccepted) return false;
  return actions.some((a) => a.kind === 'web_consent' && approvals[a.toolCallId] === true);
}
