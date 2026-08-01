import type { Request } from 'express';
import { FaviconController } from '../favicon.controller';

/**
 * O diretório de conectores usa o favicon da URL do servidor MCP como ícone
 * dentro do produto. Sendo uma API, `api.<dominio>` não serve HTML — sem esta
 * rota o conector apareceria sem ícone para quem já o conectou.
 */
describe('FaviconController', () => {
  const controller = new FaviconController();
  const req = (headers: Record<string, string>) => ({ headers }) as unknown as Request;

  it('redireciona para o ícone do apex, derivado do host da API', () => {
    expect(controller.favicon(req({ host: 'api.fat.ia.br' }))).toEqual({
      url: 'https://fat.ia.br/icons/icon-512.png',
    });
  });

  it('usa o x-forwarded-host quando existe', () => {
    // Atrás do Traefik o `host` pode ser o interno; o encaminhado é o público.
    const result = controller.favicon(
      req({ host: 'localhost:3000', 'x-forwarded-host': 'api.outro.exemplo.com' }),
    );
    expect(result).toEqual({ url: 'https://outro.exemplo.com/icons/icon-512.png' });
  });

  it('ignora a porta ao derivar o apex', () => {
    expect(controller.favicon(req({ host: 'api.fat.ia.br:8443' }))).toEqual({
      url: 'https://fat.ia.br/icons/icon-512.png',
    });
  });
});
