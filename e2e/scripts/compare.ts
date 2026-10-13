/**
 * pnpm ui:compare <etapa-a> <etapa-b> — gera um HTML lado a lado (ADR 029).
 *
 * Saída: e2e/screenshots/compare-<a>-vs-<b>.html, com as imagens referenciadas
 * por caminho relativo (abre direto no navegador, sem servidor).
 */
import { existsSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [a, b] = process.argv.slice(2);
if (!a || !b) {
  console.error('uso: pnpm ui:compare <etapa-a> <etapa-b>');
  process.exit(1);
}

const root = resolve(__dirname, '..', 'screenshots');
const projects = ['mobile', 'desktop'];

const list = (stage: string, project: string) => {
  const dir = resolve(root, stage, project);
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : [];
};

const sections = projects
  .map((project) => {
    const names = [...new Set([...list(a, project), ...list(b, project)])].sort();
    const rows = names
      .map((name) => {
        const cell = (stage: string) =>
          existsSync(resolve(root, stage, project, name))
            ? `<img loading="lazy" src="${stage}/${project}/${name}">`
            : '<div class="none">—</div>';
        return `<tr><th colspan="2">${name.replace('.png', '')}</th></tr><tr><td>${cell(a)}</td><td>${cell(b)}</td></tr>`;
      })
      .join('\n');
    return `<h2>${project}</h2><table><tr><th>${a}</th><th>${b}</th></tr>${rows}</table>`;
  })
  .join('\n');

const out = resolve(root, `compare-${a}-vs-${b}.html`);
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>${a} × ${b}</title>
<style>body{font-family:system-ui;background:#131313;color:#eee;margin:16px}table{width:100%;border-collapse:collapse}
td{vertical-align:top;width:50%;padding:4px}img{width:100%;border:1px solid #333}th{text-align:left;padding:12px 4px 4px;color:#2ce500}
.none{padding:40px;text-align:center;color:#666}</style>
<h1>${a} × ${b}</h1>${sections}`,
);
console.log(out);
