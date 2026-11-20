import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InviteOrigins, MyGroup } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, reportApi: { origins: vi.fn() } };
});

import { reportApi } from '@fatia/api-client';
import OriginsPage from '../page';

const origens = (p: Partial<InviteOrigins> = {}): InviteOrigins => ({
  days: 30,
  joined: 36,
  activated: 20,
  percent: 56,
  rows: [
    {
      key: 'a',
      origin: 'QR',
      label: 'recepção',
      kind: 'qr',
      joined: 19,
      activated: 15,
      percent: 79,
    },
    {
      key: 'b',
      origin: 'INSTAGRAM',
      label: null,
      kind: 'link',
      joined: 14,
      activated: null,
      percent: null,
    },
    {
      key: 'other',
      origin: null,
      label: null,
      kind: 'other',
      joined: 7,
      activated: null,
      percent: null,
    },
  ],
  ...p,
});

function abrir(d: InviteOrigins = origens()) {
  ctx.group = grupo();
  vi.mocked(reportApi.origins).mockResolvedValue(d);
  return renderWithClient(<OriginsPage />);
}

describe('origem dos convites (#400, Pn-25)', () => {
  afterEach(() => vi.clearAllMocks());

  it('cartões, tabela e o rodapé de privacidade', async () => {
    abrir();
    expect(screen.getByRole('heading', { name: 'Origem dos convites' })).toBeInTheDocument();
    expect(
      screen.getByText('De onde vem quem entra e quem começa a registrar em 48 h.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Links e QRs' })).toHaveAttribute(
      'href',
      '/org/g1/invites',
    );
    const cartoes = await screen.findByRole('list', { name: 'Resumo das origens' });
    expect(within(cartoes).getByText('36')).toBeInTheDocument();
    expect(within(cartoes).getByText('20')).toBeInTheDocument();
    expect(within(cartoes).getByText('56%')).toBeInTheDocument();
    expect(within(cartoes).getByText('só aparece com 5 pessoas ou mais')).toBeInTheDocument();

    const linhas = within(screen.getByRole('table')).getAllByRole('row');
    expect(within(linhas[1]!).getByText('QR · recepção')).toBeInTheDocument();
    expect(within(linhas[1]!).getByText('79%')).toBeInTheDocument();
    expect(within(linhas[2]!).getByText('Instagram')).toBeInTheDocument();
    expect(within(linhas[2]!).getByText('amostra pequena demais para mostrar')).toBeInTheDocument();
    // As pequenas somadas, sem rótulo (Pn-25c mostrava cada uma: a privacidade vence).
    expect(within(linhas[3]!).getByText('Outras origens')).toBeInTheDocument();
    expect(within(linhas[3]!).getByText('vários')).toBeInTheDocument();
    expect(within(linhas[3]!).getByText('7')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Contamos só quem entrou e quanto ativou. Nada de nome, nada de dado de saúde. Origens com menos de 5 pessoas entram juntas em "Outras origens", sem nome, ou não aparecem.',
      ),
    ).toBeInTheDocument();
    expect(reportApi.origins).toHaveBeenCalledWith('g1', 30);
  });

  it('no celular, a tabela vira uma lista de cartões (Pn-25 em 390)', async () => {
    abrir();
    const lista = await screen.findByRole('list', { name: 'Origens' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens).toHaveLength(3);
    expect(within(itens[0]!).getByText('QR · recepção')).toBeInTheDocument();
    expect(within(itens[0]!).getByText('QR')).toBeInTheDocument();
    expect(within(itens[0]!).getByText('79%')).toBeInTheDocument();
    expect(within(itens[0]!).getByText('19 entraram · 15 ativaram')).toBeInTheDocument();
    expect(within(itens[1]!).getByText('amostra pequena demais para mostrar')).toBeInTheDocument();
    expect(within(itens[2]!).getByText('Outras origens')).toBeInTheDocument();
    expect(within(itens[2]!).getByText('7 entraram')).toBeInTheDocument();
  });

  it('o período troca entre 7 e 30 dias', async () => {
    const user = userEvent.setup();
    abrir();
    await screen.findByRole('table');
    await user.click(screen.getByRole('radio', { name: '7 dias' }));
    await waitFor(() => expect(reportApi.origins).toHaveBeenLastCalledWith('g1', 7));
  });

  it('número de 30 dias suprimido pela diferença com 7 dias: sem "menos de 5"', async () => {
    abrir(
      origens({
        joined: null,
        activated: null,
        percent: null,
        rows: [{ ...origens().rows[0]!, joined: null, activated: null, percent: null }],
      }),
    );
    const linhas = within(await screen.findByRole('table')).getAllByRole('row');
    expect(within(linhas[1]!).queryByText('menos de 5')).toBeNull();
    expect(within(linhas[1]!).getByText('amostra pequena demais para mostrar')).toBeInTheDocument();
  });

  it('total pequeno demais sai como amostra pequena, nunca zero', async () => {
    abrir(origens({ joined: null, activated: null, percent: null }));
    const cartoes = await screen.findByRole('list', { name: 'Resumo das origens' });
    expect(within(cartoes).getAllByText('amostra pequena demais para mostrar')).toHaveLength(3);
  });

  it('sem nenhum link com nome: ensina a criar um', async () => {
    abrir(origens({ joined: null, activated: null, percent: null, rows: [] }));
    expect(await screen.findByText('Ainda sem dados')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar link com nome' })).toHaveAttribute(
      'href',
      '/org/g1/invites?novo=link',
    );
    expect(screen.queryByRole('table')).toBeNull();
    // Como na Pn-25b: o rodapé de privacidade só acompanha números.
    expect(screen.queryByText(/Contamos só quem entrou/)).toBeNull();
  });
});
