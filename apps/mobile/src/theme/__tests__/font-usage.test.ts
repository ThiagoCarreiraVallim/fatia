import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * No Android, texto sem `fontFamily` sai em Roboto, e `font-bold` sozinho só
 * pede o peso — a letra continua a do sistema. O validador viu o corpo do
 * Hoje em Roboto por isso. Duas guardas:
 *
 * - todo `Text` do app passa pelo `Text` do DS (Manrope por padrão);
 * - `font-medium`/`font-semibold`/`font-bold`/`font-extrabold` trocam a
 *   família Manrope do peso, e não só o `fontWeight`.
 */
const ROOT = path.resolve(__dirname, '../../..');
const require = createRequire(import.meta.url);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === '__tests__' || name === 'node_modules') return [];
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return full.endsWith('.tsx') ? [full] : [];
  });
}

describe('fontes no app', () => {
  it('nenhum arquivo usa o Text do react-native direto (só o Text do DS)', () => {
    const own = path.join(ROOT, 'src/components/ui/text.tsx');
    const offenders = [...tsxFiles(path.join(ROOT, 'app')), ...tsxFiles(path.join(ROOT, 'src'))]
      .filter((f) => f !== own)
      .filter((f) =>
        /import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*'react-native'/.test(readFileSync(f, 'utf8')),
      )
      .map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it('as classes de peso trocam a família Manrope', () => {
    const config = require('../../../tailwind.config.js') as {
      corePlugins?: Record<string, boolean>;
      plugins: { handler: (api: unknown) => void }[];
    };
    expect(config.corePlugins?.fontWeight).toBe(false);
    const utilities: Record<string, { fontFamily?: string }> = {};
    for (const p of config.plugins) {
      p.handler({ addUtilities: (u: typeof utilities) => Object.assign(utilities, u) });
    }
    expect(utilities['.font-medium']?.fontFamily).toBe('Manrope_500Medium');
    expect(utilities['.font-semibold']?.fontFamily).toBe('Manrope_600SemiBold');
    expect(utilities['.font-bold']?.fontFamily).toBe('Manrope_700Bold');
    expect(utilities['.font-extrabold']?.fontFamily).toBe('Manrope_800ExtraBold');
  });
});
