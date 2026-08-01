import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Rotas que precisam viver FORA do prefixo global `api`.
 *
 * O `exclude` do `setGlobalPrefix` casa a rota **exata** — não cobre
 * sub-caminhos. Uma rota nova que devia ser pública sobe em `/api/...` e some do
 * lugar onde o cliente procura, sem erro nenhum: a aplicação inicia, o teste
 * unitário do controller passa, e só quebra em produção.
 *
 * Aconteceu duas vezes:
 *
 * - `/.well-known/oauth-protected-resource/mcp` — o `WWW-Authenticate` do 401
 *   anuncia essa URL como `resource_metadata`, e ela respondia 404. Cliente que
 *   seguisse o cabeçalho, como manda a spec, não achava o metadata.
 * - `/favicon.ico` — o diretório de conectores usa o favicon do servidor MCP
 *   como ícone dentro do produto.
 *
 * O spec lê o `main.ts` em vez de subir a aplicação de propósito: o alvo é a
 * lista de exclusões, e instanciar o Nest inteiro exigiria banco e env completos
 * para verificar uma constante.
 */

const MAIN = resolve(__dirname, '..', 'main.ts');

/** Rotas anunciadas a clientes externos, que não podem viver sob `/api`. */
const MUST_BE_EXCLUDED = [
  '/health',
  '/mcp',
  '/favicon.ico',
  '/.well-known/oauth-protected-resource',
  '/.well-known/oauth-protected-resource/mcp',
  '/.well-known/oauth-authorization-server',
  '/oauth/register',
  '/oauth/authorize',
  '/oauth/callback',
  '/oauth/token',
];

describe('prefixo global da API', () => {
  const source = readFileSync(MAIN, 'utf8');
  const excludeBlock = source.slice(
    source.indexOf("setGlobalPrefix('api'"),
    source.indexOf('});', source.indexOf("setGlobalPrefix('api'")),
  );

  it.each(MUST_BE_EXCLUDED)('mantém %s fora do prefixo', (route) => {
    expect(excludeBlock).toContain(`'${route}'`);
  });

  it('não confia em sub-caminho herdar a exclusão do pai', () => {
    // `/.well-known/oauth-protected-resource` NÃO cobre `.../mcp`. As duas
    // precisam estar listadas — este teste existe para que remover uma delas
    // achando que a outra basta quebre aqui, e não em produção.
    expect(excludeBlock).toContain("'/.well-known/oauth-protected-resource'");
    expect(excludeBlock).toContain("'/.well-known/oauth-protected-resource/mcp'");
  });

  it('todo controller com rota pública de descoberta está coberto', () => {
    // O guard `@Public()` diz que a rota dispensa token; não diz nada sobre o
    // prefixo. São coisas independentes, e é fácil confundir.
    const discovery = readFileSync(
      join(__dirname, '..', 'auth', 'oauth-discovery.controller.ts'),
      'utf8',
    );
    const paths = [...discovery.matchAll(/@Get\(\[?([^)]+)\]?\)/g)].flatMap((m) =>
      [...m[1].matchAll(/'([^']+)'/g)].map((p) => `/.well-known/${p[1]}`),
    );

    expect(paths.length).toBeGreaterThan(0);
    for (const path of paths) {
      expect(excludeBlock).toContain(`'${path}'`);
    }
  });
});
