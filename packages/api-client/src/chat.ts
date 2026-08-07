/**
 * Contrato do chat com IA hospedada — épica #247.
 *
 * O caminho é `PWA → proxy do Next → NestJS /api/chat → apps/agent`. Cada camada
 * repassa o SSE sem bufferizar; este arquivo é o **único** lugar onde o formato
 * dos eventos está escrito do lado do cliente.
 *
 * Mora em `@fatia/api-client`, e não no PWA, pelo motivo da #157: quando o tipo
 * do cliente e o que o serviço devolve são declarados em lugares diferentes, a
 * divergência aparece como bug de tela (bloco vazio, `undefined`, página caindo)
 * em vez de erro de compilação. As fixtures de teste são anotadas com os tipos
 * daqui exatamente para que divergir custe um `tsc` vermelho.
 */

import type { ApiTransport } from './transport';
import { getConfiguredTransport } from './http';

/** Estados de uma chamada de tool, no vocabulário dos elementos de IA do shadcn. */
export type ChatToolState = 'input-available' | 'output-available' | 'output-error';

/**
 * Uma tool que o agente chamou durante a resposta.
 *
 * É o que torna a ação auditável em vez de mágica: quem conversa vê que "registrar
 * refeição" rodou, com que argumento e com que resultado.
 */
export interface ChatToolCall {
  /** Estável ao longo da conversa: o mesmo `id` chega de novo com o resultado. */
  id: string;
  /** Nome da tool no catálogo MCP, ex.: `registrar_refeicao`. */
  name: string;
  state: ChatToolState;
  input?: unknown;
  output?: unknown;
  errorText?: string;
}

/**
 * Códigos de erro do chat.
 *
 * Os quatro primeiros já são vocabulário da casa — `apps/agent` emite
 * `AI_PROVIDER_*` e `apps/api/src/ai/ai-quota.ts` emite `AI_QUOTA_EXCEEDED`. Os
 * dois últimos nascem no cliente, porque descrevem falhas que acontecem **antes**
 * de qualquer resposta do servidor.
 */
export type ChatErrorCode =
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_PROVIDER_UNAVAILABLE'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_QUOTA_EXCEEDED'
  | 'AI_NETWORK_ERROR'
  | 'AI_UNAUTHORIZED'
  | 'AI_UNKNOWN_ERROR';

const CODIGOS: ReadonlySet<string> = new Set<ChatErrorCode>([
  'AI_PROVIDER_NOT_CONFIGURED',
  'AI_PROVIDER_UNAVAILABLE',
  'AI_PROVIDER_TIMEOUT',
  'AI_QUOTA_EXCEEDED',
  'AI_NETWORK_ERROR',
  'AI_UNAUTHORIZED',
  'AI_UNKNOWN_ERROR',
]);

export interface ChatStreamError {
  code: ChatErrorCode;
  /** Prosa vinda do servidor, quando houver. A tela prefere a cópia local. */
  message?: string;
  /** ISO 8601 — só em `AI_QUOTA_EXCEEDED`, é quando a cota volta. */
  resetsAt?: string;
}

/**
 * Um quadro do SSE.
 *
 * `conversation` chega primeiro: sem ele, uma conversa interrompida no meio não
 * teria como ser continuada, porque o id é gerado no NestJS.
 */
export type ChatStreamEvent =
  | { type: 'conversation'; conversationId: string }
  | { type: 'token'; text: string }
  | { type: 'tool'; tool: ChatToolCall }
  | { type: 'error'; error: ChatStreamError }
  | { type: 'done' };

export interface ChatRequest {
  message: string;
  /** Ausente inicia conversa nova. O NestJS amarra o id ao usuário do token. */
  conversationId?: string;
}

/**
 * Texto que o usuário lê, um por código.
 *
 * Um erro genérico ("algo deu errado") faz a pessoa procurar o problema no lugar
 * errado — cota estourada some sozinha amanhã, provedor fora não. Compartilhado
 * entre PWA e nativo pelo mesmo motivo de `streak-copy.ts`: os dois têm de dizer
 * igual.
 */
export function textoDeErroDoChat(error: ChatStreamError): string {
  switch (error.code) {
    case 'AI_PROVIDER_NOT_CONFIGURED':
      return (
        'O chat com IA não está configurado nesta instância. O resto do Fatia ' +
        'funciona normalmente — nada aqui depende de IA.'
      );
    case 'AI_PROVIDER_UNAVAILABLE':
      return 'O provedor de IA está fora do ar. Tente de novo em alguns minutos.';
    case 'AI_PROVIDER_TIMEOUT':
      return 'O modelo demorou demais para responder. Tente enviar de novo.';
    case 'AI_QUOTA_EXCEEDED':
      return error.resetsAt
        ? `Você atingiu o limite diário de uso da IA. Ele volta em ${error.resetsAt} (UTC).`
        : 'Você atingiu o limite diário de uso da IA. Ele volta amanhã.';
    case 'AI_NETWORK_ERROR':
      return 'A conexão caiu no meio da resposta. O que já chegou continua acima.';
    case 'AI_UNAUTHORIZED':
      return 'Sua sessão expirou. Entre de novo para continuar a conversa.';
    case 'AI_UNKNOWN_ERROR':
      return error.message ?? 'O chat falhou por um motivo não identificado.';
  }
}

function isRecord(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === 'object' && valor !== null;
}

function texto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.length > 0 ? valor : undefined;
}

/**
 * `data:` de um quadro → evento tipado, ou `null` quando o quadro não serve.
 *
 * Descartar em silêncio é deliberado: um quadro malformado no meio do stream não
 * pode derrubar a conversa inteira. O que **não** é aceitável é aceitar a forma
 * errada calada — daí cada campo obrigatório ser conferido aqui, e não assumido.
 */
export function parseChatEvent(nome: string, data: string): ChatStreamEvent | null {
  let corpo: unknown;
  try {
    corpo = JSON.parse(data);
  } catch {
    return null;
  }
  if (!isRecord(corpo)) return null;

  switch (nome) {
    case 'conversation': {
      const conversationId = texto(corpo.conversationId);
      return conversationId ? { type: 'conversation', conversationId } : null;
    }
    case 'token': {
      // String vazia é quadro legítimo do provedor e não tem o que renderizar;
      // `typeof` (e não `texto`) porque aqui o vazio é válido, só é inútil.
      if (typeof corpo.text !== 'string') return null;
      return corpo.text ? { type: 'token', text: corpo.text } : null;
    }
    case 'tool': {
      const id = texto(corpo.id);
      const name = texto(corpo.name);
      const state = corpo.state;
      if (!id || !name) return null;
      if (state !== 'input-available' && state !== 'output-available' && state !== 'output-error') {
        return null;
      }
      const tool: ChatToolCall = { id, name, state };
      if ('input' in corpo) tool.input = corpo.input;
      if ('output' in corpo) tool.output = corpo.output;
      const errorText = texto(corpo.errorText);
      if (errorText) tool.errorText = errorText;
      return { type: 'tool', tool };
    }
    case 'error': {
      const bruto = texto(corpo.code);
      // Código desconhecido vira `AI_UNKNOWN_ERROR` **preservando a mensagem**:
      // um código novo do servidor não pode virar tela muda.
      const code: ChatErrorCode =
        bruto && CODIGOS.has(bruto) ? (bruto as ChatErrorCode) : 'AI_UNKNOWN_ERROR';
      const error: ChatStreamError = { code };
      const message = texto(corpo.message);
      if (message) error.message = message;
      const resetsAt = texto(corpo.resetsAt);
      if (resetsAt) error.resetsAt = resetsAt;
      return { type: 'error', error };
    }
    case 'done':
      return { type: 'done' };
    default:
      return null;
  }
}

/**
 * Recorta quadros completos de um buffer de SSE.
 *
 * Existe separado do `fetch` porque é aqui que mora o erro clássico do streaming:
 * um chunk da rede não respeita fronteira de quadro. Devolver o resto e só emitir
 * o que terminou em linha em branco é o que faz o token não ser cortado ao meio.
 */
export function recortarQuadros(buffer: string): { quadros: string[]; resto: string } {
  const normalizado = buffer.replace(/\r\n/g, '\n');
  const partes = normalizado.split('\n\n');
  const resto = partes.pop() ?? '';
  return { quadros: partes.filter((q) => q.trim().length > 0), resto };
}

/** Um quadro cru (`event: token\ndata: {...}`) → evento tipado. */
export function parseQuadro(quadro: string): ChatStreamEvent | null {
  let nome = 'message';
  const dados: string[] = [];
  for (const linha of quadro.split('\n')) {
    if (linha.startsWith(':')) continue; // comentário/keep-alive
    const sep = linha.indexOf(':');
    const campo = sep === -1 ? linha : linha.slice(0, sep);
    const valor = sep === -1 ? '' : linha.slice(sep + 1).replace(/^ /, '');
    if (campo === 'event') nome = valor;
    else if (campo === 'data') dados.push(valor);
  }
  if (dados.length === 0) return null;
  return parseChatEvent(nome, dados.join('\n'));
}

async function erroDeResposta(res: Response): Promise<ChatStreamError> {
  if (res.status === 401) return { code: 'AI_UNAUTHORIZED' };
  const corpo: unknown = await res.json().catch(() => null);
  const dentro = isRecord(corpo) ? corpo : {};
  const bruto = texto(dentro.code);
  if (bruto && CODIGOS.has(bruto)) {
    const error: ChatStreamError = { code: bruto as ChatErrorCode };
    const message = texto(dentro.message);
    if (message) error.message = message;
    const resetsAt = texto(dentro.resetsAt);
    if (resetsAt) error.resetsAt = resetsAt;
    return error;
  }
  // Sem código nomeado, o status ainda distingue os casos que a #250 exige
  // separar: cota (429) não é provedor fora (5xx).
  if (res.status === 429) return { code: 'AI_QUOTA_EXCEEDED' };
  if (res.status === 503 || res.status === 504) return { code: 'AI_PROVIDER_UNAVAILABLE' };
  return { code: 'AI_UNKNOWN_ERROR', message: texto(dentro.message) };
}

export interface StreamChatInit {
  signal?: AbortSignal;
}

/**
 * Envia uma mensagem e emite os eventos do SSE conforme chegam.
 *
 * **Não usa `apiFetch`** de propósito: aquele caminho lê `res.json()` de uma vez
 * e tem teto de tempo por requisição. Os dois matariam o streaming — resposta que
 * aparece inteira no fim desperdiça o SSE das camadas de baixo, e o teto abortaria
 * a conversa longa no meio. O corte aqui é do chamador, pelo `signal`.
 *
 * **Nunca lança por falha de rede ou status**: emite `{ type: 'error' }` e termina.
 * Um chat que estoura exceção deixa a tela travada, e o requisito da #250 é o
 * oposto — a conversa continua utilizável depois do erro.
 */
export async function* streamChat(
  body: ChatRequest,
  init: StreamChatInit = {},
): AsyncGenerator<ChatStreamEvent> {
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
  } catch (erro) {
    if (init.signal?.aborted) return;
    yield { type: 'error', error: { code: 'AI_NETWORK_ERROR', message: (erro as Error).message } };
    return;
  }

  if (!res.ok || !res.body) {
    const error = await erroDeResposta(res);
    if (error.code === 'AI_UNAUTHORIZED') {
      await transport.onUnauthorized?.({ path, body: null });
    }
    yield { type: 'error', error };
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
  } catch (erro) {
    if (init.signal?.aborted) return;
    // Queda no meio do stream: o que já chegou fica na tela, e o erro diz isso.
    yield { type: 'error', error: { code: 'AI_NETWORK_ERROR', message: (erro as Error).message } };
    return;
  }

  const ultimo = parseQuadro(buffer);
  if (ultimo) yield ultimo;
}
