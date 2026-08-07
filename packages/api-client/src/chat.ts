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
 * A lista é **conferida**, não suposta: os `AI_PROVIDER_*` / `AI_MODEL_*` /
 * `AI_ENDPOINT_*` / `AI_RESPONSE_*` são exatamente os `code` de
 * `apps/agent/src/fatia_agent/providers/errors.py`, que o NestJS repassa sem
 * traduzir (o contrato da #247 é repasse de SSE, não tradução). `chat.test.ts`
 * lê aquele arquivo e falha se as duas listas divergirem.
 *
 * `AI_PROVIDER_UNAVAILABLE` esteve aqui e **nenhuma camada emitia**: provedor
 * fora do ar chega como `AI_PROVIDER_UNREACHABLE`, caía em `AI_UNKNOWN_ERROR` e
 * o ramo escrito para ele era inalcançável. Era a #157 de novo — tipo do cliente
 * descrevendo um servidor que não existe.
 */
export type ChatErrorCode =
  // Nascem no agente e atravessam as três camadas com o mesmo nome.
  | 'AI_PROVIDER_ERROR'
  | 'AI_PROVIDER_NOT_CONFIGURED'
  | 'AI_MODEL_NOT_ALLOWED'
  | 'AI_ENDPOINT_NOT_ALLOWED'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_UNREACHABLE'
  | 'AI_PROVIDER_REFUSED'
  | 'AI_RESPONSE_UNPARSEABLE'
  | 'AI_RESPONSE_TRUNCATED'
  // Nasce no NestJS (`apps/api/src/ai/ai-quota.ts`).
  | 'AI_QUOTA_EXCEEDED'
  // Nascem no cliente: descrevem falhas de antes de qualquer resposta do servidor.
  | 'AI_NETWORK_ERROR'
  | 'AI_UNAUTHORIZED'
  | 'AI_UNKNOWN_ERROR';

export interface ChatStreamError {
  code: ChatErrorCode;
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
 * Falha de configuração da instância, nos três códigos que a produzem.
 *
 * Mesmo texto de propósito: para quem conversa, "faltou preencher `AI_BASE_URL`",
 * "o modelo não passou pela revisão da #136" e "o host não passou" pedem a mesma
 * coisa (nada) e revelariam infraestrutura de graça. Quem opera distingue pelo
 * `code`, que continua inteiro no log do agente. É o mesmo raciocínio que
 * `apps/api/src/ai/ai-quota.ts` já aplica ao escopo `unpriced`.
 */
const CONFIGURACAO =
  'O chat com IA não está configurado nesta instância. O resto do Fatia ' +
  'funciona normalmente — nada aqui depende de IA.';

/**
 * O provedor não entregou a resposta: não atendeu, recusou, ou falhou de um jeito
 * que o agente não nomeou melhor. A ação de quem lê é uma só — tentar de novo.
 *
 * O 429 do provedor (`AI_PROVIDER_REFUSED`) entra aqui e **não** vira cota: quem
 * conversa não estourou limite nenhum, e mandá-lo esperar até amanhã seria mentir.
 */
const PROVEDOR_FALHOU = 'O provedor de IA não atendeu agora. Tente de novo em alguns minutos.';

/**
 * Texto que o usuário lê, um por código.
 *
 * Um erro genérico ("algo deu errado") faz a pessoa procurar o problema no lugar
 * errado — cota estourada some sozinha amanhã, provedor fora não. Compartilhado
 * entre PWA e nativo pelo mesmo motivo de `streak-copy.ts`: os dois têm de dizer
 * igual.
 *
 * Tabela e não `switch`: `Record<ChatErrorCode, string>` é o que faz código novo
 * sem cópia virar `tsc` vermelho, e é dela que sai o conjunto aceito no parse —
 * assim a lista de códigos conhecidos não tem como divergir da união.
 */
const TEXTOS: Record<ChatErrorCode, string> = {
  AI_PROVIDER_NOT_CONFIGURED: CONFIGURACAO,
  AI_MODEL_NOT_ALLOWED: CONFIGURACAO,
  AI_ENDPOINT_NOT_ALLOWED: CONFIGURACAO,
  AI_PROVIDER_ERROR: PROVEDOR_FALHOU,
  AI_PROVIDER_UNREACHABLE: PROVEDOR_FALHOU,
  AI_PROVIDER_REFUSED: PROVEDOR_FALHOU,
  AI_PROVIDER_TIMEOUT: 'O modelo demorou demais para responder. Tente enviar de novo.',
  AI_RESPONSE_UNPARSEABLE:
    'A resposta do modelo veio em um formato que o Fatia não entendeu. Tente enviar de novo.',
  AI_RESPONSE_TRUNCATED:
    'A resposta ficou longa demais e foi cortada. Tente uma pergunta mais específica.',
  AI_QUOTA_EXCEEDED: 'Você atingiu o limite diário de uso da IA. Ele volta amanhã.',
  AI_NETWORK_ERROR: 'A conexão caiu no meio da resposta. O que já chegou continua acima.',
  AI_UNAUTHORIZED: 'Sua sessão expirou. Entre de novo para continuar a conversa.',
  AI_UNKNOWN_ERROR: 'O chat falhou por um motivo não identificado. Tente enviar de novo.',
};

/**
 * Todos os códigos conhecidos, na ordem da tabela.
 *
 * Exportado para o teste conferir contra `apps/agent` — é o que transforma
 * "declarei um código que ninguém emite" em suíte vermelha.
 */
export const CHAT_ERROR_CODES = Object.keys(TEXTOS) as ChatErrorCode[];

const CODIGOS: ReadonlySet<string> = new Set<string>(CHAT_ERROR_CODES);

/**
 * `resetsAt` na cópia do aluno é data legível, não ISO.
 *
 * O `${resetsAt.toISOString()} (UTC)` de `ai-quota.ts` é mensagem de API, lida
 * por quem opera; aqui é balão de conversa. Sem fuso explícito de propósito: o
 * horário que interessa é o do aparelho de quem lê. Data impossível não pode
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
      // Código desconhecido vira `AI_UNKNOWN_ERROR`, e a `message` do servidor
      // **fica de fora**. O docstring do agente é explícito: "a mensagem em
      // português é para o humano que lê o log, o código é para o cliente
      // decidir". Ela carrega caminho de endpoint, `AI_BASE_URL`, nome de modelo
      // e host do subprocessador (#136) — diagnóstico sem ação possível para
      // quem conversa. Por isso `ChatStreamError` nem tem o campo: mostrar de
      // novo custa `tsc` vermelho, não revisão de código.
      const code: ChatErrorCode =
        bruto && CODIGOS.has(bruto) ? (bruto as ChatErrorCode) : 'AI_UNKNOWN_ERROR';
      const error: ChatStreamError = { code };
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
    const resetsAt = texto(dentro.resetsAt);
    if (resetsAt) error.resetsAt = resetsAt;
    return error;
  }
  // Sem código nomeado, o status ainda distingue os casos que a #250 exige
  // separar: cota (429) não é provedor fora (5xx).
  if (res.status === 429) return { code: 'AI_QUOTA_EXCEEDED' };
  if (res.status === 503 || res.status === 504) return { code: 'AI_PROVIDER_UNREACHABLE' };
  return { code: 'AI_UNKNOWN_ERROR' };
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
  } catch {
    if (init.signal?.aborted) return;
    // A `message` do `fetch` não entra no evento: ela varia por navegador e não
    // diz nada acionável a quem conversa. A cópia por código é a da tela.
    yield { type: 'error', error: { code: 'AI_NETWORK_ERROR' } };
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
  } catch {
    if (init.signal?.aborted) return;
    // Queda no meio do stream: o que já chegou fica na tela, e o erro diz isso.
    yield { type: 'error', error: { code: 'AI_NETWORK_ERROR' } };
    return;
  }

  const ultimo = parseQuadro(buffer);
  if (ultimo) yield ultimo;
}
