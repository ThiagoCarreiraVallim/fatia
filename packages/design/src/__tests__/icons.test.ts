import { describe, expect, it } from 'vitest';
import * as lucideReact from 'lucide-react';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { CUSTOM_ICONS, ICON_NAMES, ICONS } from '../icons';

/**
 * Os nomes são os do canvas (`.i-<nome>` em canvas.css). Cada um aponta para um
 * ícone do lucide que existe nos dois pacotes, ou para um desenho próprio
 * (marca de terceiro, que o lucide não traz).
 */
// O lucide-react-native não carrega no Node (traz o react-native junto); os
// nomes exportados vêm da declaração de tipos do pacote.
const requireFromHere = createRequire(__filename);
const nativeTypes = readFileSync(
  join(
    dirname(requireFromHere.resolve('lucide-react-native')),
    '../types/lucide-react-native.d.ts',
  ),
  'utf8',
);
const lucideNativeExports = (name: string) => new RegExp(`\\b${name}\\b`).test(nativeTypes);

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
      expect(lucideReact).toHaveProperty(target);
      expect(lucideNativeExports(target)).toBe(true);
    },
  );

  it('desenho próprio traz o path do SVG em 24×24', () => {
    for (const [name, icon] of Object.entries(CUSTOM_ICONS)) {
      expect(ICONS[name as keyof typeof ICONS]).toBe(`custom:${name}`);
      expect(icon.paths.length).toBeGreaterThan(0);
    }
  });
});
