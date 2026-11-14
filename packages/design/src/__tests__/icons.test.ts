import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CUSTOM_ICONS, ICON_NAMES, ICONS } from '../icons';

/**
 * Os nomes são os do canvas (`.i-<nome>` em canvas.css). Cada um aponta para um
 * ícone do lucide que existe nos dois pacotes, ou para um desenho próprio
 * (marca de terceiro, que o lucide não traz).
 *
 * O lucide é dependência da web e do app, não deste pacote (a API, que também
 * o consome, não pode arrastar o react-native junto). Por isso os nomes
 * exportados vêm da declaração de tipos instalada para cada app.
 */
const ROOT = resolve(__dirname, '../../../..');
function exportedNames(app: string, pkg: string, types: string): string {
  const req = createRequire(join(ROOT, 'apps', app, 'package.json'));
  return readFileSync(join(dirname(req.resolve(pkg)), types), 'utf8');
}
const webTypes = exportedNames('web', 'lucide-react', '../lucide-react.d.ts');
const nativeTypes = exportedNames(
  'mobile',
  'lucide-react-native',
  '../types/lucide-react-native.d.ts',
);
const declares = (types: string, name: string) =>
  new RegExp(`declare const ${name}:`).test(types) || new RegExp(`\\b${name}\\b`).test(types);

describe('ícones', () => {
  it('mapeia os 76 nomes da prancha, sem repetir', () => {
    expect(ICON_NAMES).toHaveLength(76);
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it('não mapeia dois nomes para o mesmo desenho', () => {
    const alvos = Object.values(ICONS);
    expect(new Set(alvos).size).toBe(alvos.length);
  });

  it.each(ICON_NAMES.filter((n) => !(n in CUSTOM_ICONS)))(
    '%s existe no lucide-react e no lucide-react-native',
    (name) => {
      const target = ICONS[name];
      expect(new RegExp(`declare const ${target}:`).test(webTypes)).toBe(true);
      expect(declares(nativeTypes, target)).toBe(true);
    },
  );

  it('desenho próprio traz o path do SVG em 24×24', () => {
    for (const [name, icon] of Object.entries(CUSTOM_ICONS)) {
      expect(ICONS[name as keyof typeof ICONS]).toBe(`custom:${name}`);
      expect(icon.paths.length).toBeGreaterThan(0);
    }
  });
});
