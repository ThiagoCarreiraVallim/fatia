/**
 * Contrato do chat com IA hospedada — épica #247, com estado no agente (ADR 023).
 *
 * O caminho é `PWA → proxy do Next → NestJS /api/chat → apps/agent`. Cada camada
 * repassa o SSE sem bufferizar; este arquivo é o **único** lugar onde o formato
 * está escrito do lado do cliente.
 *
 * O fio é o vocabulário nativo do LangGraph — `messages`, `updates`,
 * `messages/complete` —, mais os eventos próprios do Fatia (`start`, `catalog`,
 * `usage`, `plan`, `artifact`, `context`, `validation`, `persisted`,
 * `error`, `done`). É o par `{ event, data }` que o
 * `useLangGraphRuntime` do assistant-ui consome direto; por isso `streamChat`
 * **não** traduz nada: só recorta quadros. Ver `apps/agent/.../chat/events.py`.
 *
 * Mora em `@fatia/api-client`, e não no PWA, pelo motivo da #157: quando o tipo
 * do cliente e o que o serviço devolve são declarados em lugares diferentes, a
 * divergência aparece como bug de tela em vez de erro de compilação.
 */

import type { ApiTransport } from './transport';
import { apiFetch, getConfiguredTransport } from './http';

/**
 * Códigos de erro do chat, pelo lugar onde nascem.
 *
 * Os `AI_*` do provedor são os `code` de `apps/agent/.../providers/errors.py`, e
 * os `MCP_*` os de `chat/errors.py`, que o NestJS repassa sem traduzir. Código
 * que não está aqui vira `AI_UNKNOWN_ERROR` — ver `erroDoChat`.
 */
export type ChatErrorCode =
  // Agente → provedor de IA.
  | 'AI_PROVIDER_ERROR'
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_MODEL_NOT_ALLOWED'
  | 'AI_ENDPOINT_NOT_ALLOWED'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_UNREACHABLE'
  | 'AI_PROVIDER_REFUSED'
  | 'AI_RESPONSE_UNPARSEABLE'
  | 'AI_RESPONSE_TRUNCATED'
  // Agente → `/mcp` do NestJS.
  | 'MCP_NOT_CONFIGURED'
  | 'MCP_UNAUTHENTICATED'
  | 'MCP_UNAUTHORIZED'
  | 'MCP_UNREACHABLE'
  | 'MCP_TIMEOUT'
  | 'MCP_REFUSED'
  | 'MCP_RESPONSE_UNPARSEABLE'
  // NestJS.
  | 'AI_QUOTA_EXCEEDED'
  | 'AGENT_STREAM_INTERRUPTED'
  | 'CHAT_INTERNAL_ERROR'
  | 'CHAT_RESUME_MISMATCH'
  | 'CHAT_NOTHING_TO_RESUME'
  // Cliente: falhas de antes de qualquer resposta do servidor.
  | 'AI_NETWORK_ERROR'
  | 'AI_UNAUTHORIZED'
  | 'AI_UNKNOWN_ERROR';

export interface ChatStreamError {
  code: ChatErrorCode;
  /** ISO 8601 — só em `AI_QUOTA_EXCEEDED`, é quando a cota volta. */
  resetsAt?: string;
}

/** Um quadro do SSE, cru: o `data` é o JSON do modo de stream, sem tradução. */
export interface ChatStreamFrame {
  event: string;
  data: unknown;
}

/** Um turno: mensagem nova **ou** a resposta a uma pausa. */
export type ChatTurnRequest = {
  /** Gerado pelo PWA na primeira mensagem. É o endereço da conversa. */
  conversationId: string;
} & (
  | { message: string; resume?: undefined }
  | { message?: undefined; resume: { interruptId: string; value: unknown } }
);

/** Um campo do formulário de `ask_user`. Quem escreve é o modelo — ver `normalizarCampos`. */
export interface ChatAskField {
  name: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'select' | 'boolean';
  required?: boolean;
  options?: string[];
}

/** Uma escrita que espera a pessoa aprovar (ADR 022). */
export interface ChatConfirmAction {
  kind: 'confirm';
  toolCallId: string;
  tool: string;
  title: string;
  prompt: string;
  /** Inteiros: é o que a pessoa lê para decidir, e é o que executa se ela aprovar. */
  arguments: Record<string, unknown>;
}

/** Uma pergunta do agente, com o formulário que ela pede. */
export interface ChatQuestionAction {
  kind: 'question';
  toolCallId: string;
  messageId: string;
  prompt: string;
  fields: ChatAskField[];
}

/** O `value` de uma pausa do grafo (`__interrupt__`). */
export interface ChatInterruptValue {
  kind: 'confirm' | 'question' | 'continue';
  prompt: string;
  actions: (ChatConfirmAction | ChatQuestionAction)[];
  /** Só em `continue`: o que já foi feito, para decidir sem adivinhar. */
  summary?: string;
}

/** A resposta a uma pausa, no formato que o `portao` do agente lê. */
export type ChatResumeValue =
  | { approvals: Record<string, boolean>; answers?: Record<string, unknown> }
  | { answers: Record<string, unknown>; approvals?: Record<string, boolean> }
  | boolean
  | string;

/**
 * Falha de configuração da instância. Mesmo texto para os códigos que a
 * produzem: para quem conversa, todos pedem a mesma coisa (nada) e revelariam
 * infraestrutura de graça. Quem opera distingue pelo `code`, no log do agente.
 */
const CONFIGURACAO =
  'O chat com IA não está configurado nesta instância. O resto do Fatia ' +
  'funciona normalmente — nada aqui depende de IA.';

/**
 * O provedor não entregou a resposta. O 429 do provedor (`AI_PROVIDER_REFUSED`)
 * entra aqui e **não** vira cota: quem conversa não estourou limite nenhum.
 */
const PROVEDOR_FALHOU = 'O provedor de IA não atendeu agora. Tente de novo em alguns minutos.';

const DADOS_FORA = 'Não consegui consultar seus dados agora. Tente de novo em instantes.';

const SESSAO = 'Sua sessão expirou. Entre de novo para continuar a conversa.';

/**
 * Texto que o usuário lê, um por código. Tabela e não `switch`:
 * `Record<ChatErrorCode, string>` é o que faz código novo sem cópia virar `tsc`
 * vermelho, e é dela que sai o conjunto aceito no parse.
 */
const TEXTOS: Record<ChatErrorCode, string> = {
  AI_PROVIDER_NOT_CONFIGURED: CONFIGURACAO,
  AI_MODEL_NOT_ALLOWED: CONFIGURACAO,
  AI_ENDPOINT_NOT_ALLOWED: CONFIGURACAO,
  MCP_NOT_CONFIGURED: CONFIGURACAO,
  AI_PROVIDER_ERROR: PROVEDOR_FALHOU,
  AI_PROVIDER_UNREACHABLE: PROVEDOR_FALHOU,
  AI_PROVIDER_REFUSED: PROVEDOR_FALHOU,
  AI_PROVIDER_TIMEOUT: 'O modelo demorou demais para responder. Tente enviar de novo.',
  AI_RESPONSE_UNPARSEABLE:
    'A resposta do modelo veio em um formato que o Fatia não entendeu. Tente enviar de novo.',
  AI_RESPONSE_TRUNCATED:
    'A resposta ficou longa demais e foi cortada. Tente uma pergunta mais específica.',
  MCP_UNREACHABLE: DADOS_FORA,
  MCP_TIMEOUT: DADOS_FORA,
  MCP_REFUSED: DADOS_FORA,
  MCP_RESPONSE_UNPARSEABLE: DADOS_FORA,
  MCP_UNAUTHENTICATED: SESSAO,
  MCP_UNAUTHORIZED: SESSAO,
  AI_UNAUTHORIZED: SESSAO,
  AI_QUOTA_EXCEEDED: 'Você atingiu o limite diário de uso da IA. Ele volta amanhã.',
  AGENT_STREAM_INTERRUPTED: 'A resposta foi interrompida antes de terminar. Tente enviar de novo.',
  AI_NETWORK_ERROR: 'A conexão caiu no meio da resposta. O que já chegou continua acima.',
  CHAT_RESUME_MISMATCH:
    'Esta conversa mudou desde que a pergunta apareceu. Recarregue para ver o que ela espera agora.',
  CHAT_NOTHING_TO_RESUME:
    'Esta conversa não está mais esperando resposta. Recarregue para ver como ela ficou.',
  CHAT_INTERNAL_ERROR: 'O chat falhou por um motivo não identificado. Tente enviar de novo.',
  AI_UNKNOWN_ERROR: 'O chat falhou por um motivo não identificado. Tente enviar de novo.',
};

/** Todos os códigos conhecidos, na ordem da tabela. */
export const CHAT_ERROR_CODES = Object.keys(TEXTOS) as ChatErrorCode[];

const CODIGOS: ReadonlySet<string> = new Set<string>(CHAT_ERROR_CODES);

/**
 * `resetsAt` na cópia do aluno é data legível, não ISO. Data impossível não pode
 * derrubar o balão de erro — aí a frase cai na versão sem horário.
 */
function quandoVolta(resetsAt: string): string | null {
  const data = new Date(resetsAt);
  if (Number.isNaN(data.getTime())) return null;
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data);
}

export function textoDeErroDoChat(error: ChatStreamError): string {
  if (error.code === 'AI_QUOTA_EXCEEDED' && error.resetsAt) {
    const volta = quandoVolta(error.resetsAt);
    if (volta) return `Você atingiu o limite diário de uso da IA. Ele volta em ${volta}.`;
  }
  return TEXTOS[error.code];
}

function isRecord(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

/**
 * O `data` de um evento `error` (ou o corpo de uma recusa) → erro tipado.
 *
 * A `message` do servidor **fica de fora**: ela é para quem lê o log, e carrega
 * endpoint, `AI_BASE_URL`, modelo e host do subprocessador (#136). Por isso
 * `ChatStreamError` nem tem o campo — mostrar de novo custa `tsc` vermelho.
 */
export function erroDoChat(dados: unknown): ChatStreamError {
  const corpo = isRecord(dados) ? dados : {};
  const bruto = texto(corpo.code);
  const code: ChatErrorCode =
    bruto && CODIGOS.has(bruto) ? (bruto as ChatErrorCode) : 'AI_UNKNOWN_ERROR';
  const error: ChatStreamError = { code };
  const resetsAt = texto(corpo.resetsAt);
  if (resetsAt) error.resetsAt = resetsAt;
  return error;
}

/**
 * Recorta quadros completos de um buffer de SSE. Um chunk da rede não respeita
 * fronteira de quadro: só o que terminou em linha em branco sai daqui.
 */
export function recortarQuadros(buffer: string): { quadros: string[]; resto: string } {
  const normalizado = buffer.replace(/\r\n/g, '\n');
  const partes = normalizado.split('\n\n');
  const resto = partes.pop() ?? '';
  return { quadros: partes.filter((q) => q.trim().length > 0), resto };
}

/**
 * Um quadro cru → `{ event, data }`, ou `null` para comentário e JSON quebrado.
 *
 * 🔴 Quem nomeia o quadro é a linha `event:`, **não** o corpo. Em `messages` o
 * `data` é uma lista de dois elementos, e procurar `type` dentro do JSON
 * descartaria justamente o texto da resposta.
 */
export function parseQuadro(quadro: string): ChatStreamFrame | null {
  let nome = 'message';
  const dados: string[] = [];
  for (const linha of quadro.split('\n')) {
    if (linha.startsWith(':')) continue;
    const sep = linha.indexOf(':');
    const campo = sep === -1 ? linha : linha.slice(0, sep);
    const valor = sep === -1 ? '' : linha.slice(sep + 1).replace(/^ /, '');
    if (campo === 'event') nome = valor;
    else if (campo === 'data') dados.push(valor);
  }
  if (dados.length === 0) return null;
  try {
    return { event: nome, data: JSON.parse(dados.join('\n')) as unknown };
  } catch {
    return null;
  }
}

async function erroDeResposta(res: Response): Promise<ChatStreamError> {
  if (res.status === 401) return { code: 'AI_UNAUTHORIZED' };
  const corpo: unknown = await res.json().catch(() => null);
  const erro = erroDoChat(corpo);
  if (erro.code !== 'AI_UNKNOWN_ERROR') return erro;
  // Sem código nomeado, o status ainda distingue cota (429) de provedor fora.
  if (res.status === 429) return { code: 'AI_QUOTA_EXCEEDED' };
  if (res.status === 503 || res.status === 504) return { code: 'AI_PROVIDER_UNREACHABLE' };
  return erro;
}

/** Erro como quadros: o consumidor tem um caminho só de término, sempre com `done`. */
function* comoQuadros(error: ChatStreamError): Generator<ChatStreamFrame> {
  yield { event: 'error', data: error };
  yield { event: 'done', data: { status: 'error' } };
}

export interface StreamChatInit {
  signal?: AbortSignal;
}

/**
 * Envia um turno e emite os quadros do SSE conforme chegam.
 *
 * **Não usa `apiFetch`** de propósito: aquele caminho lê `res.json()` de uma vez
 * e tem teto de tempo por requisição, e os dois matariam o streaming.
 *
 * **Nunca lança por falha de rede ou status**: emite `error` + `done` e termina.
 * Um chat que estoura exceção deixa a tela travada.
 */
export async function* streamChat(
  body: ChatTurnRequest,
  init: StreamChatInit = {},
): AsyncGenerator<ChatStreamFrame> {
  const transport: ApiTransport = getConfiguredTransport();
  const path = '/api/chat';
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' });
  const extra = await transport.headers?.(path);
  if (extra) new Headers(extra).forEach((valor, chave) => headers.set(chave, valor));

  const doFetch = transport.fetch ?? fetch;
  let res: Response;
  try {
    res = await doFetch(transport.resolveUrl(path), {
      ...transport.requestInit?.(),
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: init.signal,
    });
  } catch {
    if (init.signal?.aborted) return;
    yield* comoQuadros({ code: 'AI_NETWORK_ERROR' });
    return;
  }

  if (!res.ok || !res.body) {
    const error = await erroDeResposta(res);
    if (error.code === 'AI_UNAUTHORIZED') {
      await transport.onUnauthorized?.({ path, body: null });
    }
    yield* comoQuadros(error);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { quadros, resto } = recortarQuadros(buffer);
      buffer = resto;
      for (const quadro of quadros) {
        const evento = parseQuadro(quadro);
        if (evento) yield evento;
      }
    }
  } catch {
    if (init.signal?.aborted) return;
    // Queda no meio do stream: o que já chegou fica na tela, e o erro diz isso.
    yield* comoQuadros({ code: 'AI_NETWORK_ERROR' });
    return;
  }

  const ultimo = parseQuadro(buffer);
  if (ultimo) yield ultimo;
}

// ---------------------------------------------------------------- conversas

export interface ChatConversationSummary {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Uma linha de `Message`, como `GET /chat/conversations/:id` devolve. */
export interface ChatHistoryMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Só o nome de cada tool: os argumentos já estão no domínio de destino. */
  tools: { name: string }[] | null;
  metadata: {
    status?: 'completed' | 'interrupted' | 'error' | 'resolved';
    interrupt?: { id: string; value: ChatInterruptValue };
  } | null;
  runId: string | null;
  review: 'like' | 'dislike' | null;
  createdAt: string;
}

export interface ChatConversation extends ChatConversationSummary {
  messages: ChatHistoryMessage[];
}

export type ChatReviewReason =
  'incorrect' | 'incomplete' | 'did_not_follow' | 'wrong_data' | 'slow' | 'other';

export interface ChatFeedback {
  review: 'like' | 'dislike' | null;
  reasons?: ChatReviewReason[];
  note?: string;
}

export function getChatAvailability(): Promise<{ available: boolean }> {
  return apiFetch('/api/chat/availability');
}

export function listConversations(busca?: string): Promise<ChatConversationSummary[]> {
  const termo = busca?.trim();
  return apiFetch(`/api/chat/conversations${termo ? `?q=${encodeURIComponent(termo)}` : ''}`);
}

export function getConversation(id: string): Promise<ChatConversation> {
  return apiFetch(`/api/chat/conversations/${encodeURIComponent(id)}`);
}

export function renameConversation(
  id: string,
  title: string,
): Promise<{ id: string; title: string }> {
  return apiFetch(`/api/chat/conversations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

export function deleteConversation(id: string): Promise<void> {
  return apiFetch(`/api/chat/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function sendChatFeedback(
  conversationId: string,
  messageId: string,
  feedback: ChatFeedback,
): Promise<void> {
  return apiFetch(
    `/api/chat/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/feedback`,
    { method: 'PATCH', body: JSON.stringify(feedback) },
  );
}

// ---------------------------------------------------------------- plano e artefatos

/** Um passo do plano que o agente anuncia no evento `plan` — o plano inteiro a cada mudança. */
export interface ChatPlanStep {
  id: string;
  title: string;
  status: 'pending' | 'running' | 'done';
}

type ChatArtifactBase = { toolCallId: string; label?: string };

/**
 * A carga tipada de uma tool (evento `artifact`), pendurada no cartão dela pelo
 * `toolCallId`. Os formatos são a lista fechada de `apps/agent/.../chat/artefatos.py`.
 *
 * Vive só no turno ao vivo: `Message.tools` guarda o nome da tool e nada mais, então
 * depois de recarregar a página o cartão volta sem o artefato.
 */
export type ChatArtifact =
  | (ChatArtifactBase & {
      kind: 'metric';
      value: number;
      unit?: string;
      target?: { min?: number | null; max?: number | null };
      breakdown?: { label: string; value: number; unit?: string }[];
    })
  | (ChatArtifactBase & {
      kind: 'timeline';
      unit?: string;
      delta?: number | null;
      events: { date: string; value: number }[];
    })
  | (ChatArtifactBase & {
      kind: 'report';
      columns: string[];
      rows: (string | number | null)[][];
    })
  | (ChatArtifactBase & {
      kind: 'comparison';
      items: { label: string; value: number | string; unit?: string }[];
    });

// ---------------------------------------------------------------- memória e cota

/** O que o assistente guardou sobre a pessoa, a pedido dela (`save_memory`). */
export interface ChatMemory {
  id: string;
  content: string;
  createdAt: string;
}

/**
 * A cota de IA do dia. `limitMicros: null` quando a instância não tem teto por
 * pessoa — o medidor não aparece. `allowed` é a mesma decisão que barra o envio.
 */
export interface ChatQuota {
  spentMicros: number;
  limitMicros: number | null;
  usedRatio: number | null;
  resetsAt: string;
  allowed: boolean;
}

export function listChatMemories(): Promise<ChatMemory[]> {
  return apiFetch('/api/chat/memories');
}

export function deleteChatMemory(id: string): Promise<void> {
  return apiFetch(`/api/chat/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getChatQuota(): Promise<ChatQuota> {
  return apiFetch('/api/chat/quota');
}
