// Renderiza pranchas do canvas (.canvas/project/<X>.dc.html) como PNG, com o
// canvas.css injetado, para comparar lado a lado com a tela real.
// Uso: node scripts/render-board.mjs <saída> <Prancha> [<Prancha>...]
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..', '.canvas');
const [out, ...boards] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
for (const board of boards) {
  // O runtime do canvas (dc-runtime.js) no lugar do support.js, e o canvas.css
  // no lugar do blob: assim o script x-dc roda e a prancha sai como no canvas.
  const html = readFileSync(resolve(root, 'project', board + '.dc.html'), 'utf8')
    .replace('./support.js', '../artifact-type/dc-runtime.js')
    .replace(/<link rel="stylesheet" href="\/_blob\/[^"]+">/, '<link rel="stylesheet" href="../canvas.css">');
  const tmp = resolve(root, 'project', `_render-${board}.html`);
  writeFileSync(tmp, html);
  await page.goto(`file://${tmp}`, { waitUntil: 'networkidle' }).catch(() => undefined);
  unlinkSync(tmp);
  await page.waitForTimeout(1200);
  // Os ícones são máscaras de blobs que não vêm na cópia local: escreve o nome
  // do ícone no lugar, para saber qual é. E abre o conteúdo rolável inteiro.
  await page.evaluate(() => {
    document.querySelectorAll('.ic').forEach((el) => {
      const name = [...el.classList].find((c) => c.startsWith('i-'));
      if (!name) return;
      Object.assign(el.style, { mask: 'none', webkitMask: 'none', background: 'transparent', width: 'auto', minWidth: '20px', fontSize: '9px', lineHeight: '1', color: 'currentColor', outline: '1px dashed currentColor' });
      el.textContent = name.slice(2);
    });
    const st = document.createElement('style'); st.textContent = '*{transition:none!important;animation-duration:0s!important}'; document.head.appendChild(st);
    const fx = document.querySelector('.fx');
    if (!fx) return;
    let extra = 0;
    fx.querySelectorAll('*').forEach((el) => {
      const cs = getComputedStyle(el);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) {
        extra = Math.max(extra, el.scrollHeight - el.clientHeight);
        const add = el.scrollHeight - el.clientHeight;
        el.style.overflowY = 'visible';
        for (let a = el.parentElement; a && a !== fx; a = a.parentElement) {
          const h = a.getBoundingClientRect().height;
          if (h) a.style.height = h + add + 'px';
        }
      }
    });
    if (extra) fx.style.height = fx.getBoundingClientRect().height + extra + 'px';
  });
  await page.setViewportSize({ width: 390, height: Math.ceil(await page.evaluate(() => document.querySelector('.fx')?.getBoundingClientRect().height ?? 844)) });
  const frame = page.locator('.fx').first();
  await frame.screenshot({ path: resolve(out, board + '.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  console.log('ok', board);
}
await browser.close();
