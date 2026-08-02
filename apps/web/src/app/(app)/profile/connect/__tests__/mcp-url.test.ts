import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mcpServerUrl } from '@/lib/mcp-url';

/**
 * O endereço que o fluxo de conexão manda colar no Claude (issue #164).
 *
 * Herdeiro do guarda que morava em `profile/tokens/__tests__/mcp-url.test.ts`, que nasceu porque
 * aquela tela mandava colar `/mcp/sse` — sub-rota que **não existe**: o `McpController` é
 * `@Controller('mcp')` com um único `@All()`. Quem seguia a instrução não conectava, e o erro
 * aparecia do lado do Claude, longe daqui.
 *
 * A versão anterior lia o `.tsx` e regexava as URLs escritas no arquivo. Isso só funcionava
 * porque a tela tinha um domínio de exemplo **hardcoded** (`https://seu-dominio.com/mcp`) — ou
 * seja, o teste dependia justamente do outro defeito da tela para ter o que casar. Agora ele
 * chama `mcpServerUrl()`, o código de verdade, e continua lendo o controller de verdade: nada é
 * repetido à mão dos dois lados.
 */

const HERE = __dirname;
/** Raiz do monorepo, subindo de `.../apps/web/src/app/(app)/profile/connect/__tests__`. */
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..', '..', '..', '..');
const CONTROLLER = resolve(REPO_ROOT, 'apps/api/src/mcp/mcp.controller.ts');
const WEB_APP_SRC = resolve(REPO_ROOT, 'apps/web/src');

describe('endereço do servidor mostrado ao usuário', () => {
  const controller = readFileSync(CONTROLLER, 'utf8');

  it('o controller continua sem sub-rota', () => {
    // Se algum dia o servidor ganhar uma sub-rota, este caso cai primeiro e obriga a revisitar a
    // tela em vez de deixá-la mentindo em silêncio.
    expect(controller).toMatch(/@Controller\(['"]mcp['"]\)/);
    expect(controller).toMatch(/@All\(\)/);
  });

  it('monta o endereço no caminho declarado pelo controller, sem nada depois', () => {
    const base = controller.match(/@Controller\(['"]([^'"]+)['"]\)/)?.[1];
    expect(base).toBeTruthy();

    const url = new URL(mcpServerUrl('https://api.exemplo.test'));

    expect(url.pathname).toBe(`/${base}`);
    expect(url.search).toBe('');
    expect(url.origin).toBe('https://api.exemplo.test');
  });

  it('não duplica a barra quando a URL da API termina em /', () => {
    expect(new URL(mcpServerUrl('https://api.exemplo.test/')).pathname).toBe('/mcp');
  });

  it('nenhuma tela escreve o endereço à mão', () => {
    // O defeito original não foi só a sub-rota errada: era uma URL literal na tela, com domínio
    // de exemplo, que nenhum ambiente jamais serviu. Endereço escrito à mão em `.tsx` volta a ser
    // um endereço que ninguém atualiza — o único caminho é `mcpServerUrl()`.
    const offenders: string[] = [];

    for (const entry of readdirSync(WEB_APP_SRC, { recursive: true, encoding: 'utf8' })) {
      if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue;
      const file = join(WEB_APP_SRC, entry);
      // A própria fábrica é onde o caminho pode ser escrito.
      if (file === resolve(WEB_APP_SRC, 'lib/mcp-url.ts')) continue;
      if (file.includes('__tests__')) continue;

      for (const match of readFileSync(file, 'utf8').matchAll(/https?:\/\/[^\s<'"`]*\/mcp\b/g)) {
        offenders.push(`${entry}: ${match[0]}`);
      }
    }

    expect(offenders.sort()).toEqual([]);
  });
});
