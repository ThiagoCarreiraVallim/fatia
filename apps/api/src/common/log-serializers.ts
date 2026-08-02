import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Serializadores de log por **lista de permissão**, não por lista de bloqueio.
 *
 * O padrão do `pino-http` (`pino-std-serializers.req`) inclui `headers` inteiro. Como
 * `authorization` é um header, todo request autenticado gravava o **Bearer do usuário em texto
 * puro** no log da API — e o conector MCP é público, então eram tokens de gente real, válidos até
 * expirar, para quem tivesse acesso ao log do container.
 *
 * Bloquear header por header não resolve de forma durável: a lista precisa crescer sozinha toda
 * vez que alguém introduz um header novo que carrega segredo, e ninguém lembra. Aqui a escolha é
 * a inversa — só sai o que está escrito abaixo.
 *
 * A query string também fica de fora, e não é excesso de zelo: as buscas deste produto carregam
 * dado de saúde (`?search=whey`, filtros de peso), e `docs/THREAT_MODEL.md` §"Vazamento por log"
 * já registra que os logs de tool não gravam input nem output. O log de request seguia outra
 * regra que ninguém tinha escolhido.
 */

/** Cabeçalhos que ajudam a depurar e não carregam segredo nem dado de saúde. */
const HEADERS_PERMITIDOS = ['user-agent', 'content-type', 'content-length', 'referer'] as const;

function headersPermitidos(headers: IncomingMessage['headers']): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const nome of HEADERS_PERMITIDOS) {
    const valor = headers[nome];
    if (typeof valor === 'string') saida[nome] = valor;
  }
  return saida;
}

export function serializeRequest(req: IncomingMessage & { id?: unknown; url?: string }) {
  // Só o caminho. `req.url` traz a query string, e é lá que vive o termo de busca.
  const caminho = (req.url ?? '').split('?')[0];

  return {
    id: req.id,
    method: req.method,
    path: caminho,
    headers: headersPermitidos(req.headers),
    remoteAddress: req.socket?.remoteAddress,
  };
}

export function serializeResponse(res: ServerResponse) {
  // Sem `headers` na resposta: é por onde sairia `set-cookie` — a sessão do PWA em texto puro.
  return { statusCode: res.statusCode };
}
