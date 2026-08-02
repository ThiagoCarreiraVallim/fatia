/**
 * Configuração do access log.
 *
 * Duas regras de privacidade se somam aqui, achadas em revisões independentes:
 *
 * 1. **Cabeçalhos e query string** (#215, `common/log-serializers.ts`): o
 *    serializador padrão do `pino-http` grava `headers` inteiro — `authorization`
 *    incluído. A correção é lista de permissão, e mora lá. Este arquivo a **usa**;
 *    não a repete. Duas listas de permissão divergem, e a que divergir por último
 *    é a que vaza.
 *
 * 2. **Código de barras escaneado** (#140, `docs/DATA_RETENTION.md`): o `:code` da
 *    rota de consulta é o vínculo pessoa↔produto que o documento promete não
 *    existir. Ele **não** é resolvido pela regra 1: o serializador de #215 descarta
 *    a query string, mas preserva o `path` — e o código é um segmento do path,
 *    não um parâmetro de query. Ver `mascararCodigoDeBarras` abaixo.
 */

import type { Options } from 'pino-http';
import { serializeRequest, serializeResponse } from './log-serializers';

/** `/api/nutrition/foods/barcode/:code`. O `:code` é o dado a proteger. */
const CONSULTA_POR_CODIGO_DE_BARRAS = /^(\/api\/nutrition\/foods\/barcode\/)[^/?#]*/;

export const CODIGO_OMITIDO = '***';

/** Healthcheck bate a cada poucos segundos e não diz nada. */
const HEALTHCHECK = '/health';

/** O caminho como ele pode ir para o log: sem o código de barras. */
export function caminhoSemCodigoDeBarras(caminho: string): string {
  return caminho.replace(CONSULTA_POR_CODIGO_DE_BARRAS, `$1${CODIGO_OMITIDO}`);
}

/** Rotas que não geram linha de access log. */
export function foraDoAccessLog(url: string | undefined): boolean {
  if (url === undefined) return false;
  return url === HEALTHCHECK || CONSULTA_POR_CODIGO_DE_BARRAS.test(url);
}

/**
 * `serializeRequest` com o código de barras trocado por `***` no caminho.
 *
 * **Por que isto não é redundante com o `autoLogging.ignore` logo abaixo.** O
 * `ignore` tira a rota do caminho de sucesso, mas o `pino-http` inscreve
 * `res.on('error', …)` **fora** do `if (shouldLogSuccess)` (`logger.js`), então um
 * erro de socket registra a linha mesmo em rota ignorada. Sem a máscara, é ali que
 * o código sairia.
 *
 * **E por que não é redundante com o serializador de #215.** Aquele descarta a
 * query string inteira e devolve só o `path`; aqui o dado sensível *está* no path.
 * As duas coisas se completam: ele tira `?search=whey`, esta tira o `:code`.
 */
export function serializarRequisicao(req: Parameters<typeof serializeRequest>[0]) {
  const serializado = serializeRequest(req);
  return { ...serializado, path: caminhoSemCodigoDeBarras(serializado.path) };
}

/**
 * Opções do `pino-http`. Ficam aqui, e não inline no `AppModule`, porque é o que
 * permite o teste alimentar o `pino-http` com **estas** opções e conferir a linha
 * que sai — ler a configuração e acreditar nela foi exatamente o que deixou passar
 * os dois vazamentos descritos no topo do arquivo.
 */
export function opcoesDoPinoHttp(ambiente: string | undefined): Options {
  const producao = ambiente === 'production';
  return {
    transport: producao ? undefined : { target: 'pino-pretty', options: { singleLine: true } },
    level: producao ? 'info' : 'debug',
    autoLogging: { ignore: (req) => foraDoAccessLog(req.url) },
    serializers: { req: serializarRequisicao, res: serializeResponse },
  };
}
