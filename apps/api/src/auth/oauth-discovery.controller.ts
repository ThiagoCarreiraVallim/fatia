import { Controller, Get, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';

/**
 * Discovery do MCP. A API age como OAuth Authorization Server público
 * (com DCR) e federa pro Logto internamente. Claude (web/mobile) só
 * enxerga estes endpoints — o Logto fica invisível para o cliente.
 */
@Controller('.well-known')
export class OAuthDiscoveryController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('oauth-protected-resource')
  oauthProtectedResource(@Req() req: Request) {
    const base = this.baseUrl(req);
    const audience = this.config.getOrThrow<string>('LOGTO_AUDIENCE');
    return {
      resource: audience,
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
