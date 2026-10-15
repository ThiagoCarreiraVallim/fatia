import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@fatia/api-client';

/**
 * Toda tela de `(app)` e `(pro)` precisa estar no mapa de rotas: é dele que a
 * barra de topo tira o título e o "voltar". Tela nova sem entrada cairia no
 * pai genérico, com título vazio — e ninguém repararia até abrir no celular.
 */

const APP = resolve(__dirname, '..', '..', '..', 'app');

function paginas(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return paginas(caminho);
    return nome === 'page.tsx' ? [caminho] : [];
  });
}

function rotaDe(arquivo: string): string {
  const segs = relative(APP, arquivo)
    .split(sep)
    .slice(0, -1)
    .filter((s) => !/^\(.*\)$/.test(s))
    .map((s) => (s.startsWith('[') ? ':' + s.slice(1, -1).replace(/^\.\.\./, '') : s));
  return '/' + segs.join('/');
}

function normal(pattern: string): string {
  return pattern.replace(/:[^/]+/g, ':p');
}

describe('mapa de rotas', () => {
  const telas = ['(app)', '(pro)'].flatMap((g) => paginas(join(APP, g))).map(rotaDe);

  it('acha as telas (o teste não passa vazio)', () => {
    expect(telas).toContain('/nutrition/foods');
    expect(telas).toContain('/students/:membershipId');
  });

  it.each(telas)('%s tem entrada no mapa', (rota) => {
    const padroes = ROUTES.map((r) => normal(r.pattern));
    expect(padroes).toContain(normal(rota));
  });
});
