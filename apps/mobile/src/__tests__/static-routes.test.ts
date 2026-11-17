import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * Toda rota escrita no código do app (`router.push('/x')`, `href="/x"`,
 * `go('/x')`) precisa existir em `app/`. Uma rota apagada em outra issue
 * (o `/profile/tokens` da #388) quebrava o "Usar minha IA pelo MCP" sem
 * nenhum erro de tipo.
 */
const ROOT = resolve(__dirname, '..', '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === '__tests__' || n === 'node_modules') return [];
    return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** `app/(app)/workout/[id]/index.tsx` → `['workout', '[id]']`. */
function routeOf(file: string): string[] | null {
  const parts = relative(join(ROOT, 'app'), file)
    .replace(/\.tsx?$/, '')
    .split('/')
    .filter((s) => !/^\(.*\)$/.test(s));
  if (parts.some((s) => s.startsWith('_') || s.startsWith('+'))) return null;
  if (parts.at(-1) === 'index') parts.pop();
  return parts;
}

const routes = files(join(ROOT, 'app'))
  .map(routeOf)
  .filter((r): r is string[] => r !== null);

function exists(path: string): boolean {
  const segs = path.split('/').filter(Boolean);
  return routes.some(
    (r) =>
      r.length === segs.length &&
      r.every((s, i) => s === segs[i] || (s.startsWith('[') && s.endsWith(']'))),
  );
}

const LITERAL = /(?:router\.(?:push|replace|navigate)\(|href=\{?|\bgo\()\s*(['"`])(\/[^'"`]*)\1/g;

const used = [...files(join(ROOT, 'src')), ...files(join(ROOT, 'app'))].flatMap((f) =>
  [...readFileSync(f, 'utf8').matchAll(LITERAL)].map((m) => ({
    file: relative(ROOT, f),
    // `${id}` vira um segmento qualquer; query e âncora não fazem parte da rota.
    path: m[2]!.replace(/\$\{[^}]*\}/g, 'x').replace(/[?#].*$/, ''),
  })),
);

describe('rotas escritas no código', () => {
  it('acha as rotas (sanidade)', () => {
    expect(used.length).toBeGreaterThan(20);
    expect(exists('/plan')).toBe(true);
    expect(exists('/nada-aqui')).toBe(false);
  });

  it('todas existem em app/', () => {
    const missing = used.filter((u) => !exists(u.path));
    expect(missing).toEqual([]);
  });
});
