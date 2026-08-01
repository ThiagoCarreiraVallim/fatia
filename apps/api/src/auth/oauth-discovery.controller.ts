import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';

/**
 * Discovery do MCP. A API age como OAuth Authorization Server público
 * (com DCR) e federa pro Logto internamente. Claude (web/mobile) só
 * enxerga estes endpoints — o Logto fica invisível para o cliente.
 */
// Isento do throttle: são dois JSONs estáticos, sem banco e sem custo. Limitar
// por IP aqui só serviria para bloquear o discovery de todos os usuários do
// conector de uma vez, já que o egress da Anthropic é uma faixa compartilhada.
@SkipThrottle()
@Controller('.well-known')
export class OAuthDiscoveryController {
  /**
   * Metadata do protected resource (RFC 9728).
   *
   * O campo `resource` tem de bater **exatamente** com a URL que a pessoa digita
   * no Claude, path incluído — é exigência explícita da doc de conectores. Nosso
   * recurso protegido é o `/mcp`, então é isso que vai aqui.
   *
   * ⚠️ Não confundir com `LOGTO_AUDIENCE`, que é o identifier do API Resource no
   * Logto e vira o `aud` do JWT. Os dois são strings opacas diferentes: uma
   * identifica o recurso para o cliente, a outra identifica a audiência para o
   * IdP. Devolver o audience aqui — como fazíamos — publicava
   * `https://api.fat.ia.br` enquanto o usuário digitava
   * `https://api.fat.ia.br/mcp`, e a divergência reprova no review.
   *
   * Servido nos dois caminhos: o path-específico da RFC 9728 (que é o que o
   * cliente deriva de `/mcp`) e a raiz, para clientes que só olham lá.
   */
  @Public()
  @Get(['oauth-protected-resource', 'oauth-protected-resource/mcp'])
  oauthProtectedResource(@Req() req: Request) {
    const base = this.baseUrl(req);
    return {
      resource: `${base}/mcp`,
      authorization_servers: [base],
      bearer_methods_supported: ['header'],
      scopes_supported: ['read', 'write'],
    };
  }

  @Public()
  @Get('oauth-authorization-server')
  oauthAuthorizationServer(@Req() req: Request) {
    const base = this.baseUrl(req);
    return {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/oauth/token`,
      registration_endpoint: `${base}/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'],
      scopes_supported: ['read', 'write', 'offline_access'],
    };
  }

  private baseUrl(req: Request): string {
    const proto =
      (req.headers['x-forwarded-proto'] as string)?.split(',')[0]?.trim() || req.protocol;
    const host = req.headers['x-forwarded-host'] ?? req.headers.host;
    return `${proto}://${host}`;
  }
}
