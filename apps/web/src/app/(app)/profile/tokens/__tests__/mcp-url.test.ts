import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A tela de tokens é onde o usuário copia a URL do servidor MCP para colar no Claude. Ela mandava
 * colar `/mcp/sse` — caminho que **não existe**: o `McpController` é `@Controller('mcp')` com
 * `@All()`, sem sub-rota. Quem seguisse a instrução simplesmente não conectava, e o erro aparecia
 * do lado do Claude, longe daqui.
 *
 * O teste lê o controller de verdade em vez de repetir a string `/mcp`. Repetir só provaria que
 * eu escrevi duas vezes a mesma coisa; ler o controller faz a tela quebrar aqui no dia em que o
 * caminho do servidor mudar — que é o único momento em que este teste tem alguma utilidade.
 */

const PAGE = resolve(__dirname, '..', 'page.tsx');
/** `apps/` — sobe de `__tests__` até a raiz dos apps, sem contar `..` na mão. */
const APPS = resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');
const CONTROLLER = resolve(APPS, 'api', 'src', 'mcp', 'mcp.controller.ts');

describe('URL do MCP mostrada ao usuário', () => {
  const page = readFileSync(PAGE, 'utf8');
  const controller = readFileSync(CONTROLLER, 'utf8');

  it('o controller continua sem sub-rota', () => {
    // Se algum dia o MCP ganhar uma sub-rota, este caso cai primeiro e obriga a revisitar a tela
    // em vez de deixá-la mentindo em silêncio.
    expect(controller).toMatch(/@Controller\(['"]mcp['"]\)/);
    expect(controller).toMatch(/@All\(\)/);
  });

  it('a tela não anuncia sub-caminho abaixo de /mcp', () => {
    const urls = [...page.matchAll(/https?:\/\/[^\s<'"]*\/mcp[^\s<'"]*/g)].map((m) => m[0]);

    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(url).toMatch(/\/mcp$/);
    }
  });
});
