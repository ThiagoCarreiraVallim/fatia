import {
  erroDoChat,
  getConfiguredTransport,
  textoDeErroDoChat,
  type ApiTransport,
} from '@fatia/api-client';

const PATH = '/api/chat/transcribe';
const FALHOU = 'Não deu para transcrever agora. Tente de novo ou digite.';

export type DictationOutcome = { text: string | null; error: string | null };

/**
 * A resposta do `/chat/transcribe` lida como o resto do app lê as suas.
 *
 * O ditado sobe o arquivo pelo `uploadAsync` (o `fetch` do React Native não manda
 * um arquivo do aparelho como corpo cru), então passa por fora do `apiFetch` e
 * perdia o que ele faz: com o token revogado, o 401 virava "não deu para
 * transcrever" e a sessão continuava aberta; o 402 tinha um texto só dele. Aqui
 * o 401 vai ao `onUnauthorized` do transporte, que encerra a sessão como em
 * qualquer outra chamada, e os erros nomeados usam o texto do chat.
 */
export async function readDictationResponse(
  status: number,
  body: string,
  transport: Pick<ApiTransport, 'onUnauthorized'> = getConfiguredTransport(),
): Promise<DictationOutcome> {
  if (status === 401) {
    await transport.onUnauthorized?.({ path: PATH, body: null });
    return { text: null, error: textoDeErroDoChat({ code: 'AI_UNAUTHORIZED' }) };
  }
  const parsed = parseJson(body);
  if (status >= 400) {
    const error = erroDoChat(parsed);
    if (error.code !== 'AI_UNKNOWN_ERROR') return { text: null, error: textoDeErroDoChat(error) };
    if (status === 402) {
      return { text: null, error: textoDeErroDoChat({ code: 'AI_PLAN_REQUIRED' }) };
    }
    if (status === 429) {
      return { text: null, error: textoDeErroDoChat({ code: 'AI_QUOTA_EXCEEDED' }) };
    }
    return { text: null, error: FALHOU };
  }
  const text = (parsed as { text?: unknown } | null)?.text;
  return { text: typeof text === 'string' && text.trim() ? text.trim() : null, error: null };
}

function parseJson(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}
