import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Public } from '../common/decorators/public.decorator';

/**
 * Endpoint de discovery do MCP conforme spec OAuth Protected Resource Metadata.
 * Aponta o cliente (Claude) para o Logto como authorization server.
 */
@Controller('.well-known')
export class OAuthDiscoveryController {
  constructor(private readonly config: ConfigService) {}

  @Public()
  @Get('oauth-protected-resource')
  oauthProtectedResource() {
    const endpoint = this.config.getOrThrow<string>('LOGTO_ENDPOINT').replace(/\/+$/, '');
    const audience = this.config.getOrThrow<string>('LOGTO_AUDIENCE');

    return {
      resource: audience,
      authorization_servers: [endpoint],
      bearer_methods_supported: ['header'],
      scopes_supported: ['read', 'write'],
    };
  }
}
