import { PATH_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';
import { OAuthDiscoveryController } from '../../auth/oauth-discovery.controller';
import { McpController } from '../../mcp/mcp.controller';
import { apiPublicUrl, mcpPublicUrl } from '../public-url';

/**
 * O endereço que a tela "Conectar sua IA" manda copiar (#388) vem da
 * configuração (`API_PUBLIC_URL`), nunca escrito na tela. E tem de ser
 * exatamente o `resource` que o metadata do OAuth publica: o Claude compara os
 * dois, com o path.
 */
describe('endereço público do MCP', () => {
  it('é a API pública com /mcp, sem barra dobrada', () => {
    expect(mcpPublicUrl({ API_PUBLIC_URL: 'https://api.fat.ia.br/' })).toBe(
      'https://api.fat.ia.br/mcp',
    );
  });

  it('sem a env, cai no endereço do dev', () => {
    expect(apiPublicUrl({ API_PORT: '3100' })).toBe('http://localhost:3100');
    expect(mcpPublicUrl({})).toBe('http://localhost:3000/mcp');
  });

  it('o path é o do controller do MCP, sem sub-rota', () => {
    // Se o servidor um dia ganhar outro caminho, isto cai antes de a tela mandar
    // colar um endereço que responde 404.
    expect(Reflect.getMetadata(PATH_METADATA, McpController)).toBe('mcp');
    expect(new URL(mcpPublicUrl({ API_PUBLIC_URL: 'https://x.test' })).pathname).toBe('/mcp');
  });

  it('é igual ao `resource` que o discovery publica para quem chega pelo endereço público', () => {
    const env = { API_PUBLIC_URL: 'https://api.fat.ia.br' };
    const req = {
      headers: { host: 'api.fat.ia.br', 'x-forwarded-proto': 'https' },
      protocol: 'http',
    } as unknown as Request;

    const { resource } = new OAuthDiscoveryController().oauthProtectedResource(req);

    expect(resource).toBe(mcpPublicUrl(env));
  });
});
