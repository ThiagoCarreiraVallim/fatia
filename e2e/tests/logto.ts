import type { Page } from '@playwright/test';

/**
 * Preenche a tela de entrada do Logto. Com o conector de e-mail ligado ela tem
 * duas etapas (identificador, depois senha — o e-mail também aceita código);
 * sem ele, uma só. Funciona nas duas.
 */
export async function logtoSignIn(page: Page, identifier: string, password: string) {
  await page.locator('input[name="identifier"]').fill(identifier);
  const passwordInput = page.locator('input[name="password"]');
  if (!(await passwordInput.isVisible())) {
    await page.locator('button[type="submit"]').click();
    await passwordInput.waitFor();
  }
  await passwordInput.fill(password);
  await page.locator('button[type="submit"]').click();
}
