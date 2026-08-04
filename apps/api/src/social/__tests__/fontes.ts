import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Raiz de `social/`. */
export const RAIZ_SOCIAL = join(__dirname, '..');

/**
 * Fontes de `social/`, sem os testes — que precisam citar o proibido para
 * proibi-lo.
 *
 * Os dois guardas de varredura desta pasta (`no-body-comparison` e
 * `no-inference-cost`) partem desta lista. Cada um com o seu `readdirSync` daria
 * dois jeitos de a varredura morrer em silêncio, e quem consertasse um não
 * saberia do outro.
 */
export function fontesDeSocial(dir: string = RAIZ_SOCIAL): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) return entrada.name === '__tests__' ? [] : fontesDeSocial(caminho);
    return entrada.name.endsWith('.ts') ? [caminho] : [];
  });
}
