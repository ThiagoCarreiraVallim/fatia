import { Controller, Get, Redirect, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from './decorators/public.decorator';

/**
 * Favicon do servidor MCP.
 *
 * O diretório de conectores usa o favicon da URL do servidor MCP como ícone
 * dentro do produto. Sendo uma API, `api.<dominio>` não tem HTML nem favicon —
 * sem isto o conector apareceria sem ícone para quem já o conectou.
 *
 * Redireciona para o ícone servido pelo site institucional em vez de embutir o
 * binário na imagem da API: uma cópia só, no lugar onde ela já é mantida.
 */
@Controller()
export class FaviconController {
  @Public()
  @Get('favicon.ico')
  @Redirect(undefined, 301)
  favicon(@Req() req: Request) {
    // `api.fat.ia.br` → `fat.ia.br`. A topologia do compose garante que a API
    // vive num subdomínio do apex onde o site é servido.
    const host = ((req.headers['x-forwarded-host'] ?? req.headers.host) as string) ?? '';
    const apex = host.split(':')[0].split('.').slice(1).join('.');
    return { url: `https://${apex}/icons/icon-512.png` };
  }
}
