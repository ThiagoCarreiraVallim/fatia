import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, type Page, test } from '@playwright/test';
import { logtoSignIn } from './logto';

/**
 * Esqueci minha senha, ponta a ponta (Fase 2): página de login → tela do Logto
 * → código por e-mail (capturado pelo Mailpit do compose) → nova senha.
 *
 * O Logto recusa a mesma senha de antes, então o teste redefine para uma nova,
 * entra com ela e, no fim, devolve a senha do demo com `pnpm logto:bootstrap` —
 * o `auth.setup.ts` continua funcionando. Só no projeto `mobile`: um fluxo
 * basta, e cada execução manda um e-mail.
 */
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const DEMO_EMAIL = process.env.DEMO_EMAIL ?? 'demo@fatia.local';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? 'Fatia-demo-2026!';
const STAGE = process.env.UI_STAGE ?? 'adhoc';

async function shot(page: Page, name: string) {
  const dir = resolve(__dirname, '..', 'screenshots', STAGE, test.info().project.name);
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: resolve(dir, `${name}.png`), animations: 'disabled' });
}

interface MailpitList {
  messages: Array<{ ID: string; Created: string; To: Array<{ Address: string }> }>;
}

/** Código de 6 dígitos do e-mail mais recente para o demo, enviado depois de `since`. */
async function codeSentAfter(since: Date): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=10`)).json()) as MailpitList;
    const message = list.messages.find(
      (m) => new Date(m.Created) >= since && m.To.some((t) => t.Address === DEMO_EMAIL),
    );
    if (message) {
      const body = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as {
        Text: string;
        HTML: string;
      };
      const code = `${body.Text}\n${body.HTML}`.match(/\b(\d{6})\b/)?.[1];
      if (code) return code;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Nenhum código de redefinição chegou ao Mailpit');
}

test('esqueci minha senha: código por e-mail e nova senha', async ({ browser }, info) => {
  test.skip(info.project.name !== 'mobile', 'um fluxo por execução basta');
  test.setTimeout(120_000);

  const context = await browser.newContext({
    ...info.project.use,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await page.goto('/login');
  await page.getByRole('link', { name: 'Esqueci minha senha' }).click();
  await page.waitForURL(/\/(reset|forgot)-password/);
  await page.waitForLoadState('networkidle');
  await shot(page, '05-reset-email');

  const since = new Date(Date.now() - 1000);
  await page.locator('input').first().fill(DEMO_EMAIL);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/verification-code/);
  await shot(page, '06-reset-codigo');

  const code = await codeSentAfter(since);
  await page.locator('input[name="passcode_0"]').click();
  await page.keyboard.type(code);

  const newPassword = page.locator('input[type="password"]');
  await newPassword.first().waitFor();
  await shot(page, '07-reset-nova-senha');
  const temporary = `${DEMO_PASSWORD}-${Date.now()}`;
  try {
    for (const input of await newPassword.all()) await input.fill(temporary);
    await page.locator('button[type="submit"]').click();

    // Concluído, o Logto volta para a tela de entrada — e a senha nova funciona.
    await page.locator('input[name="identifier"]').waitFor({ timeout: 15_000 });
    await shot(page, '08-reset-concluido');
    await logtoSignIn(page, DEMO_EMAIL, temporary);
    await expect(page).toHaveURL(/localhost:3030\/?$/, { timeout: 20_000 });
  } finally {
    await context.close();
    execSync('pnpm logto:bootstrap', { cwd: resolve(__dirname, '../..'), stdio: 'ignore' });
  }
});
