import { stripQueryString } from './telemetry-redaction';

/**
 * Serializadores de request/response do pino.
 *
 * Por que substituir os defaults: o serializador `req` que vem do `pino-std-serializers` grava
 * **todos os cabeçalhos** da requisição — `authorization` e `cookie` inclusive — e a `url`
 * inteira, com query string. Enquanto isso ficava só no `docker logs` já era ruim; a partir
 * desta issue o log é enviado ao Loki, ou seja, o token de acesso de um usuário passaria a ser
 * indexado e guardado num segundo lugar.
 *
 * Isso também contradizia o que o `docs/THREAT_MODEL.md` §"Vazamento por log" afirma: que os
 * logs registram a forma da operação, não o conteúdo. Agora o código corresponde ao documento.
 *
 * O que sobra é o que se usa de fato para diagnosticar: método, caminho **sem query** e status.
 */

type LoggableRequest = {
  id?: unknown;
  method?: string;
  url?: string;
};

type LoggableResponse = {
  statusCode?: number;
};

export function serializeRequest(req: LoggableRequest): Record<string, unknown> {
  return {
    id: req.id,
    method: req.method,
    // `path`, e não `url`: o nome diferente deixa explícito no Grafana que a query foi cortada
    // de propósito, em vez de parecer uma URL que por acaso não tinha parâmetro.
    path: req.url ? stripQueryString(req.url) : undefined,
  };
}

export function serializeResponse(res: LoggableResponse): Record<string, unknown> {
  return { statusCode: res.statusCode };
}
