import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, ICONS } from '@fatia/design';

/**
 * O mapa de ícones do app (`components/ui/icon.tsx`) cobre todos os nomes do
 * canvas com o ícone do `@fatia/design`. Lido do fonte porque o Vitest daqui
 * não monta React Native; a web confere o mesmo mapa renderizando.
 */
const SRC = readFileSync(join(__dirname, '..', '..', 'components', 'ui', 'icon.tsx'), 'utf8');
const block = SRC.slice(SRC.indexOf('export const ICON_COMPONENTS'));
const map = Object.fromEntries(
  [...block.slice(0, block.indexOf('};')).matchAll(/^\s+(\w+): ('custom'|\w+),$/gm)].map((m) => [
    m[1],
    m[2],
  ]),
);

describe('ícones do app', () => {
  it('todo nome do canvas tem o ícone mapeado em @fatia/design', () => {
    for (const name of ICON_NAMES) {
      const target = ICONS[name];
      expect(map[name], name).toBe(target.startsWith('custom:') ? "'custom'" : target);
    }
  });

  it('cada ícone vem do lucide-react-native', () => {
    const imports = SRC.slice(0, SRC.indexOf("from 'lucide-react-native'"));
    for (const component of Object.values(map)) {
      if (component !== "'custom'")
        expect(imports, component).toMatch(new RegExp(`\\b${component},`));
    }
  });
});
