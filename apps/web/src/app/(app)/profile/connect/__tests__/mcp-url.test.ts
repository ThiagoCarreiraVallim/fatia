import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * O endereço que Conectar sua IA manda colar vem da API (`serverUrl` de
 * `GET /users/me/mcp-connections`, montado de `API_PUBLIC_URL`, #388). O path é
 * conferido do lado da API (`apps/api/src/common/__tests__/public-url.spec.ts`).
 *
 * Este guarda nasceu com a #164: uma tela mandava colar `https://seu-dominio.com/mcp/sse`,
 * domínio de exemplo e sub-rota que nunca existiu. Endereço escrito à mão em `.tsx` volta a
 * ser um endereço que ninguém atualiza.
 */

const HERE = __dirname;
/** Raiz do monorepo, subindo de `.../apps/web/src/app/(app)/profile/connect/__tests__`. */
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..', '..', '..', '..');
const WEB_APP_SRC = resolve(REPO_ROOT, 'apps/web/src');

describe('endereço do servidor mostrado ao usuário', () => {
  it('nenhuma tela escreve o endereço à mão', () => {
    const offenders: string[] = [];

    for (const entry of readdirSync(WEB_APP_SRC, { recursive: true, encoding: 'utf8' })) {
      if (!entry.endsWith('.tsx') && !entry.endsWith('.ts')) continue;
      const file = join(WEB_APP_SRC, entry);
      if (file.includes('__tests__')) continue;

      for (const match of readFileSync(file, 'utf8').matchAll(/https?:\/\/[^\s<'"`]*\/mcp\b/g)) {
        offenders.push(`${entry}: ${match[0]}`);
      }
    }

    expect(offenders.sort()).toEqual([]);
  });
});
