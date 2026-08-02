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
 *
 * **Este é o único serializador de log da API.** A #39 (observabilidade) tinha nascido com uma
 * cópia em `observability/`, escrita sem conhecimento desta — e as duas já divergiam. Duas listas
 * de permissão com o mesmo propósito não ficam iguais por muito tempo, e a divergência aparece
 * como campo que vaza numa e não na outra. Serializador novo entra aqui.
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

/**
 * Só o caminho. `req.url` é o request-target cru: traz a query string, onde vive o termo de
 * busca, e aceita fragmento — o Node não rejeita `GET /api/foods#whey`, e o Express casa a rota
 * pelo caminho antes do `#`. Cortar só no `?` deixaria o `#` como uma segunda porta para a mesma
 * classe de dado.
 */
function caminhoSemQuery(url: string): string {
  const corte = url.search(/[?#]/);
  return corte === -1 ? url : url.slice(0, corte);
}

export function serializeRequest(req: IncomingMessage & { id?: unknown; url?: string }) {
  return {
    id: req.id,
    method: req.method,
    path: caminhoSemQuery(req.url ?? ''),
    headers: headersPermitidos(req.headers),
    // Sem `remoteAddress`. Ele saiu na #39, quando o log deixou de morar só no `docker logs` e
    // passou a ser enviado ao Loki: IP é dado pessoal, e ali fica indexado num segundo store,
    // com retenção própria. O ganho diagnóstico que compensaria isso não existe — em produção a
    // API fica atrás do Traefik, então o valor é sempre o endereço do proxy, igual em toda
    // requisição. É a mesma decisão que `telemetry-redaction.ts` já toma para `client.address` e
    // `network.peer.address` no span; manter o IP aqui era redigir a mesma informação numa camada
    // e publicá-la na outra. Se um dia for preciso rastrear origem, o caminho é o
    // `x-forwarded-for` com `trust proxy` configurado — e aí é decisão consciente, não default.
  };
}

export function serializeResponse(res: ServerResponse) {
  // Sem `headers` na resposta: é por onde sairia `set-cookie` — a sessão do PWA em texto puro.
  return { statusCode: res.statusCode };
}
