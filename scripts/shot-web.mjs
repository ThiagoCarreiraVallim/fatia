// Print de rotas do PWA logado como o demo, no tamanho de celular (390×844) e,
// com --desktop, também 1440×900. Para comparar com a prancha lado a lado.
// Uso: node scripts/shot-web.mjs <saída> /rota [/rota ...] [--desktop] [--light]
//      Ação antes do print: "/rota@click=Texto do botão" (clica e espera) ou
//      "/rota@label=Nome acessível" (botão só de ícone, pelo aria-label) ou
//      "/rota@scroll=end" (rola até o fim, para ver o último item e as barras).
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const out = args.shift();
const desktop = args.includes('--desktop');
const light = args.includes('--light');
const routes = args.filter((a) => !a.startsWith('--'));
mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const sizes = [['m', { width: 390, height: 844 }], ...(desktop ? [['d', { width: 1440, height: 900 }]] : [])];
for (const [tag, viewport] of sizes) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    storageState: resolve(import.meta.dirname, '..', 'e2e/.auth/demo.json'),
    colorScheme: light ? 'light' : 'dark',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const spec of routes) {
    const [route, ...actions] = spec.split('@');
    await page.goto('http://localhost:3030' + route, { waitUntil: 'networkidle', timeout: 60_000 }).catch(() => undefined);
    await page.waitForTimeout(800);
    for (const a of actions) {
      const [kind, value] = a.split('=');
      if (kind === 'click') await page.getByText(value, { exact: false }).first().click().catch((e) => errors.push('click ' + value + ': ' + e.message.split('\n')[0]));
      if (kind === 'scroll') await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      if (kind === 'label') await page.getByLabel(value, { exact: true }).first().click().catch((e) => errors.push('label ' + value + ': ' + e.message.split('\n')[0]));
      await page.waitForTimeout(900);
    }
    const name = spec.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'root';
    const file = resolve(out, `${name}.${tag}.png`);
    // Tela como a pessoa vê (sem fullPage): elementos fixos ficam no lugar certo.
    await page.screenshot({ path: file });
    // E a página inteira, para ver o que fica abaixo da dobra.
    await page.screenshot({ path: file.replace('.png', '.full.png'), fullPage: true });
    console.log('ok', file, errors.length ? 'ERROS: ' + errors.join(' | ') : '');
    errors.length = 0;
  }
  await ctx.close();
}
await browser.close();
