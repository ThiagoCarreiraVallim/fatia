import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Guarda das docs de entrada contra o toolchain real (issue #36).
 *
 * O `CONTRIBUTING.md` pedia Node >= 20 (é 24) e mandava rodar `pnpm test`, que
 * não existe na raiz. As duas foram corrigidas lá — e continuaram no
 * `docs/ONBOARDING.md`, que é justamente para onde o README manda o recém-chegado
 * primeiro. Consertar arquivo por arquivo repete o defeito no próximo arquivo;
 * por isso o guarda varre TODA doc de entrada, e falha dizendo arquivo e linha.
 *
 * A fonte da verdade é o `package.json` da raiz (`engines.node` e `scripts`), não
 * uma constante mantida à mão aqui.
 */

const REPO_ROOT = resolve(__dirname, '../../../..');

const rootPackage = JSON.parse(readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8')) as {
  engines: { node: string };
  scripts: Record<string, string>;
};

/**
 * Docs que um contribuidor de fora lê: a raiz do repositório e `docs/`. O
 * `_archive` fica de fora — é histórico declarado como não-atual — e os READMEs
 * de pacote também, porque `pnpm <script>` lá dentro resolve contra o
 * `package.json` do próprio pacote, não contra o da raiz.
 */
function entryDocs(): string[] {
  const found = ['README.md', 'CONTRIBUTING.md', 'SECURITY.md'];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '_archive') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.md')) found.push(full.slice(REPO_ROOT.length + 1));
    }
  };

  walk(resolve(REPO_ROOT, 'docs'));
  return found;
}

const DOCS = entryDocs();

function linesOf(relative: string): string[] {
  return readFileSync(resolve(REPO_ROOT, relative), 'utf8').split('\n');
}

describe('docs de entrada × toolchain', () => {
  it('varre as docs de entrada (sanidade da descoberta)', () => {
    // Sem isto, um erro de caminho deixaria os casos abaixo passando vazios.
    expect(DOCS).toContain('docs/ONBOARDING.md');
    expect(DOCS.length).toBeGreaterThan(10);
  });

  it('mantém .nvmrc na mesma major que engines.node', () => {
    const engines = /(\d+)/.exec(rootPackage.engines.node)?.[1];
    const nvmrc = readFileSync(resolve(REPO_ROOT, '.nvmrc'), 'utf8').trim();

    expect(nvmrc.split('.')[0]).toBe(engines);
  });

  it('cita a major do Node do engines em toda doc que afirma uma versão', () => {
    const expected = /(\d+)/.exec(rootPackage.engines.node)?.[1];

    /**
     * As quatro formas que aparecem hoje nas docs: `>= 24`, `24+`, `v24.x` e
     * `Node 24`. Só linhas que falam de Node são olhadas — número solto em
     * qualquer outro contexto não é versão de runtime.
     */
    const VERSION_FORMS = [
      /(?:>=|≥)\s*v?(\d+)/g,
      /\bv(\d+)\.x\b/g,
      /\b(\d+)\+/g,
      /\bnode(?:\.js)?[^a-z0-9]{0,4}v?(\d+)\b/gi,
    ];

    const wrong: string[] = [];

    for (const relative of DOCS) {
      linesOf(relative).forEach((line, index) => {
        if (!/node/i.test(line)) return;

        for (const form of VERSION_FORMS) {
          for (const match of line.matchAll(form)) {
            if (match[1] !== expected) {
              wrong.push(`${relative}:${index + 1} diz "${match[0]}", engines.node é ${expected}`);
            }
          }
        }
      });
    }

    expect(wrong.sort()).toEqual([]);
  });

  it('só cita `pnpm <script>` que existe na raiz', () => {
    /**
     * Verbos do próprio pnpm: não são scripts do repositório e não têm de estar
     * no `package.json`. Qualquer outro token depois de `pnpm` é promessa de
     * script — e `pnpm test` era uma promessa que o repositório não cumpria.
     */
    const PNPM_BUILTINS = new Set([
      'install',
      'i',
      'add',
      'remove',
      'update',
      'dlx',
      'exec',
      'run',
      'why',
      'store',
      'audit',
      'publish',
      'link',
      'unlink',
      'prune',
      'rebuild',
      'setup',
      'config',
      'list',
      'ls',
      'outdated',
      'import',
      'patch',
      'deploy',
      'init',
      'licenses',
      'pack',
      'env',
      'root',
    ]);

    /** `pnpm x` entre crases ou abrindo linha de bloco de código — nunca em prosa. */
    const INVOCATION = /(?:`|^\s*)pnpm ([a-zA-Z0-9:@._-]+)/g;

    const missing: string[] = [];
    let seen = 0;

    for (const relative of DOCS) {
      linesOf(relative).forEach((line, index) => {
        for (const match of line.matchAll(INVOCATION)) {
          const script = match[1];
          if (script.startsWith('-') || PNPM_BUILTINS.has(script)) continue;
          seen++;
          if (!(script in rootPackage.scripts)) {
            missing.push(`${relative}:${index + 1} manda rodar \`pnpm ${script}\`, que não existe`);
          }
        }
      });
    }

    expect(missing.sort()).toEqual([]);

    // Guarda do guarda: se o reconhecimento parar de casar, o caso acima fica
    // verde por não achar nada — o mesmo verde de quando está tudo certo.
    expect(seen).toBeGreaterThan(20);
  });
});
