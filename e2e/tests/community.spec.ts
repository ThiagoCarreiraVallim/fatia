import { expect, type Page, test } from '@playwright/test';
import {
  COMMUNITY_NAME,
  COMMUNITY_SLUG,
  DEMO_EMAIL,
  grantSeatToDemo,
  newInvitePath,
  purgeDemo,
  TEAM_EMAIL,
  TEAM_PASSWORD,
} from './community';
import { logtoSignIn } from './logto';

/**
 * Comunidades do lado do membro (Fase 5), na stack real: convite por link e por
 * e-mail, entrada pelo código e o PRO pago pela comunidade. Cada fluxo começa e
 * termina com o demo fora da "Academia Demo" (`purgeDemo`), e o Mailpit só é
 * lido — nenhuma mensagem é apagada.
 */
test.skip(({ isMobile }) => !isMobile, 'fluxo roda uma vez, no celular');
test.beforeEach(() => purgeDemo());
test.afterEach(() => purgeDemo());

const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';

async function marcar(page: Page, nome: RegExp, marcado: boolean) {
  const box = page.getByRole('checkbox', { name: nome });
  if ((await box.isChecked()) !== marcado) await box.click();
}

test('convite por link: deslogado vê a comunidade; logado escolhe o que compartilhar, muda e sai', async ({
  page,
  browser,
}, info) => {
  const convite = newInvitePath();

  const anonimo = await browser.newContext({
    ...info.project.use,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const fora = await anonimo.newPage();
    await fora.goto(convite);
    await expect(fora.getByRole('heading', { name: COMMUNITY_NAME })).toBeVisible();
    await expect(fora.getByRole('link', { name: 'Entrar para aceitar' })).toHaveAttribute(
      'href',
      new RegExp(`next=${encodeURIComponent(convite)}`),
    );
  } finally {
    await anonimo.close();
  }

  await page.goto(convite);
  for (const box of await page.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
  await marcar(page, /Alimentação/, true);
  await marcar(page, /Água e passos/, true);
  await page.getByRole('button', { name: 'Aceitar e entrar' }).click();

  // A comunidade abre no mural; o que compartilho mora atrás da engrenagem.
  await expect(page).toHaveURL(/\/community\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: COMMUNITY_NAME })).toBeVisible();
  await page.getByRole('link', { name: 'Sobre a comunidade e o que você compartilha' }).click();
  await expect(page).toHaveURL(/\/community\/[0-9a-f-]{36}\/settings$/);
  await expect(page.getByRole('checkbox', { name: /Alimentação/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Água e passos/ })).toBeChecked();

  await marcar(page, /Alimentação/, false);
  await marcar(page, /Água e passos/, false);
  await marcar(page, /Metas/, true);
  await page.getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Compartilhando: Metas.')).toBeVisible();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: /Metas/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Alimentação/ })).not.toBeChecked();

  await page.getByRole('button', { name: 'Sair da comunidade' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/community$/);
  await expect(page.getByRole('link', { name: new RegExp(COMMUNITY_NAME) })).toHaveCount(0);
});

test('convite por e-mail: a equipe convida, o e-mail chega com o link e o demo entra', async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120_000);
  const preview = await page.request.get(`/api/proxy/groups/preview?slug=${COMMUNITY_SLUG}`);
  const { id: groupId } = (await preview.json()) as { id: string };
  const desde = new Date(Date.now() - 1_000);

  // A equipe ainda não tem painel (Fase 6): convida pela API, logada de verdade.
  const equipe = await browser.newContext({
    ...info.project.use,
    storageState: { cookies: [], origins: [] },
  });
  try {
    const p = await equipe.newPage();
    await p.goto('/login');
    await p.getByRole('link', { name: 'Entrar' }).click();
    await logtoSignIn(p, TEAM_EMAIL, TEAM_PASSWORD);
    await p.waitForURL('http://localhost:3030/**');
    const res = await p.request.post(`/api/proxy/groups/${groupId}/invites`, {
      data: { role: 'MEMBER', email: DEMO_EMAIL },
    });
    expect(res.status()).toBe(201);
    expect(((await res.json()) as { emailSent: boolean }).emailSent).toBe(true);
  } finally {
    await equipe.close();
  }

  // Só leitura no Mailpit: procura a mensagem nova para o demo, sem apagar nada.
  let link: string | null = null;
  for (let i = 0; i < 20 && !link; i++) {
    const lista = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=20`)).json()) as {
      messages: Array<{ ID: string; Created: string; To: Array<{ Address: string }> }>;
    };
    const msg = lista.messages.find(
      (m) =>
        new Date(m.Created) >= desde && m.To.some((t) => t.Address.toLowerCase() === DEMO_EMAIL),
    );
    if (msg) {
      const corpo = (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()) as {
        Text: string;
        Subject: string;
      };
      expect(corpo.Subject).toContain(COMMUNITY_NAME);
      link = /\/c\/[A-Za-z0-9_-]{43}/.exec(corpo.Text)?.[0] ?? null;
    } else {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  expect(link).not.toBeNull();

  await page.goto(link!);
  await expect(
    page.getByText('Este convite vale só para a conta do e-mail que o recebeu.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Aceitar e entrar' }).click();
  await expect(page).toHaveURL(/\/community\/[0-9a-f-]{36}$/);
  await page.getByRole('link', { name: 'Sobre a comunidade e o que você compartilha' }).click();
  await expect(page.getByText('Ninguém da equipe olhou seus dados ainda.')).toBeVisible();
});

test('entrar com código pede aprovação, e o pedido pode ser cancelado', async ({ page }) => {
  await page.goto('/community');
  await page.getByRole('button', { name: 'Entrar com código' }).first().click();
  await page.getByLabel('Código da comunidade').fill(COMMUNITY_SLUG);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('dialog').getByText(/Entrada com aprovação do dono/)).toBeVisible();
  await marcar(page, /Treino/, true);
  await page.getByRole('button', { name: 'Pedir para entrar' }).click();

  await expect(page).toHaveURL(/\/community\/[0-9a-f-]{36}$/);
  // Pendente: o aviso fica no lugar do mural, com o caminho para cancelar.
  await expect(page.getByText(/aguardando o dono aprovar/)).toBeVisible();
  await page.getByRole('link', { name: 'Ver ou cancelar o pedido' }).click();
  await page.getByRole('button', { name: 'Cancelar pedido' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cancelar pedido' }).click();
  await expect(page).toHaveURL(/\/community$/);
});

test('assento da comunidade: o plano mostra o PRO pago por ela, sem cobrar o demo', async ({
  page,
}) => {
  const token = newInvitePath().split('/').at(-1)!;
  const aceite = await page.request.post(`/api/proxy/groups/invites/${token}/accept`, {
    data: { scopes: [], statsOptIn: false },
  });
  expect(aceite.status()).toBe(201);
  grantSeatToDemo();

  await page.goto('/plan');
  await expect(
    page.getByRole('heading', { name: `PRO pela comunidade ${COMMUNITY_NAME}` }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar assinatura' })).toHaveCount(0);

  await page.goto('/community');
  await expect(page.getByRole('link', { name: new RegExp(COMMUNITY_NAME) })).toContainText('PRO');
});
