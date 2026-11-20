import { describe, expect, it } from 'vitest';
import { ROLE_ACTIONS, type GroupRole } from '../community';
// O Vite lê o arquivo como texto (`?raw`); o pacote não tem tipos do Node.
// @ts-expect-error -- módulo `?raw` sem declaração de tipo
import doc from '../../../../docs/PERMISSIONS.md?raw';

/**
 * O espelho do cliente (`ROLE_ACTIONS`) bate com a tabela de
 * `docs/PERMISSIONS.md`, que a API confere com a matriz do guarda
 * (`permission-matrix.spec.ts`). Assim as três ficam iguais (#404).
 */
describe('ROLE_ACTIONS espelha docs/PERMISSIONS.md', () => {
  it('cada papel, cada ação', () => {
    const linhas = (doc as string).split('\n');
    const cab = linhas.findIndex((l) => /^\|\s*Ação\s*\|\s*OWNER/.test(l));
    expect(cab).toBeGreaterThan(-1);
    const papeis = linhas[cab]!.split('|')
      .slice(2, -1)
      .map((c) => c.trim() as GroupRole);
    const esperado: Record<string, string[]> = Object.fromEntries(
      papeis.map((r) => [r, [] as string[]]),
    );
    for (const l of linhas.slice(cab + 2)) {
      if (!l.startsWith('| `')) break;
      const c = l
        .split('|')
        .slice(1, -1)
        .map((x) => x.trim());
      const acao = c[0]!.replace(/`/g, '');
      papeis.forEach((r, i) => {
        if (c[i + 1] === 'sim') esperado[r]!.push(acao);
      });
    }
    for (const r of papeis) {
      expect([...ROLE_ACTIONS[r]].sort()).toEqual(esperado[r]!.sort());
    }
    expect(Object.keys(ROLE_ACTIONS).sort()).toEqual([...papeis].sort());
  });
});
