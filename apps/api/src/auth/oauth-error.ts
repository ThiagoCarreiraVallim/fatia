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
  | 'server_error';

/** Códigos que a RFC manda responder com 401 em vez de 400. */
const UNAUTHORIZED_CODES: ReadonlySet<OAuthErrorCode> = new Set([
  'invalid_client',
  'unauthorized_client',
]);

export class OAuthError extends HttpException {
  constructor(
    readonly code: OAuthErrorCode,
    description: string,
  ) {
    super(
      { error: code, error_description: description },
      UNAUTHORIZED_CODES.has(code) ? HttpStatus.UNAUTHORIZED : HttpStatus.BAD_REQUEST,
    );
    // O `HttpException` só usa a resposta como `message` quando ela é string.
    // Com o objeto da RFC, `message` viraria o genérico "Auth Error" — inútil no
    // log e em qualquer stack trace, justamente quando se precisa dele.
    this.message = description;
  }
}
