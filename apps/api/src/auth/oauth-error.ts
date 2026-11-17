import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Erros do OAuth no formato da RFC 6749 §5.2.
 *
 * Importa mais do que parece: o Claude decide o que fazer a partir do campo
 * `error`. Com `invalid_grant` ele descarta o refresh token e refaz o
 * consentimento; com um erro que não reconhece, ele repete a mesma chamada e
 * falha em laço até o usuário desconectar o conector na mão.
 *
 * Antes disto o facade lançava `BadRequestException`, que o Nest serializa como
 * `{ statusCode, message }` — um formato que nenhum cliente OAuth entende.
 */
export type OAuthErrorCode =
  | 'invalid_request'
  | 'invalid_client'
  | 'invalid_grant'
  | 'unauthorized_client'
  | 'unsupported_grant_type'
  | 'invalid_scope'
  | 'server_error'
  | 'temporarily_unavailable';

/** Códigos que a RFC manda responder com 401 em vez de 400. */
const UNAUTHORIZED_CODES: ReadonlySet<OAuthErrorCode> = new Set([
  'invalid_client',
  'unauthorized_client',
]);

/**
 * Status de cada código. `server_error` e `temporarily_unavailable` são falha
 * nossa (ou do Logto), não do cliente: com 5xx o cliente tenta de novo mais
 * tarde e guarda o refresh token, em vez de descartá-lo como num 400.
 */
function statusOf(code: OAuthErrorCode): HttpStatus {
  if (code === 'server_error') return HttpStatus.INTERNAL_SERVER_ERROR;
  if (code === 'temporarily_unavailable') return HttpStatus.SERVICE_UNAVAILABLE;
  return UNAUTHORIZED_CODES.has(code) ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_REQUEST;
}

export class OAuthError extends HttpException {
  constructor(
    readonly code: OAuthErrorCode,
    description: string,
  ) {
    super({ error: code, error_description: description }, statusOf(code));
    // O `HttpException` só usa a resposta como `message` quando ela é string.
    // Com o objeto da RFC, `message` viraria o genérico "Auth Error" — inútil no
    // log e em qualquer stack trace, justamente quando se precisa dele.
    this.message = description;
  }
}
