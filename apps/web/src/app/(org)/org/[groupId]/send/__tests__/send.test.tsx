import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, PlanTemplate, SendRecipient, SentItem } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({
  group: null as MyGroup | null,
  router: { replace: vi.fn(), push: vi.fn() },
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ctx.router,
}));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    contentApi: { plans: vi.fn() },
    sendsApi: { recipients: vi.fn(), send: vi.fn(), list: vi.fn(), revoke: vi.fn() },
  };
});

import { toast } from 'sonner';
import { contentApi, sendsApi } from '@fatia/api-client';
import OrgSendPage from '../page';

const plano = (p: Partial<PlanTemplate> = {}): PlanTemplate => ({
  id: 't1',
  kind: 'WORKOUT',
  title: 'Inferior v2',
  description: null,
  level: 'intermediate',
  cover: null,
  authorName: 'Helena',
  authorRole: 'PROFESSIONAL',
  publishedAt: null,
  updatedAt: '2026-11-20T00:00:00Z',
  exercises: [],
  goals: null,
  meals: [],
  adoptedPlanId: null,
  draft: false,
  ...p,
});

const pessoa = (name: string, p: Partial<SendRecipient> = {}): SendRecipient => ({
  membershipId: `m-${name.split(' ')[0]!.toLowerCase()}`,
  name,
  accompaniedByMe: false,
  hasPlan: true,
  alreadyHas: false,
  openEnded: false,
  ...p,
});

const enviado = (p: Partial<SentItem> = {}): SentItem => ({
  id: 'o1',
  kind: 'WORKOUT',
  title: 'Inferior v1',
  version: 1,
  changeNote: null,
  name: 'Ana Dias',
  membershipId: 'm-ana',
  sentAt: '2026-09-30T12:00:00Z',
  status: 'ACCEPTED',
  schedule: 'FLEXIBLE',
  startDate: null,
  endDate: null,
  progress: null,
  noProgress: false,
  canRevoke: false,
  ...p,
});

function prepara(itens: SentItem[] = []) {
  ctx.group = grupo({ role: 'PROFESSIONAL' });
  vi.mocked(contentApi.plans).mockResolvedValue([
    plano(),
    plano({ id: 't2', title: 'Braços', draft: true }),
    plano({ id: 't3', title: 'Cutting', kind: 'NUTRITION' }),
  ]);
  vi.mocked(sendsApi.recipients).mockResolvedValue({
    recipients: [
      pessoa('Ana Dias', { accompaniedByMe: true }),
      pessoa('Diego Reis', { alreadyHas: true }),
      pessoa('Eva Lima', { hasPlan: false }),
    ],
  });
  vi.mocked(sendsApi.list).mockResolvedValue({ items: itens });
}

describe('painel › enviar para alunos (#405, Pn-18)', () => {
  afterEach(() => vi.clearAllMocks());

  it('hábito, questionário e recomendação aparecem desligados, dizendo quando chegam', async () => {
    prepara();
    renderWithClient(<OrgSendPage />);
    const tipos = await screen.findByRole('radiogroup', { name: 'O que enviar' });
    expect(within(tipos).getByRole('radio', { name: /Plano de treino/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    const habito = within(tipos).getByRole('radio', { name: /Hábito/ });
    expect(habito).toBeDisabled();
    expect(habito).toHaveAccessibleDescription('Chega junto com os hábitos da semana.');
  });

  it('escolhe o plano sem rascunho, quem eu acompanho, e manda o que mudou para quem já tem', async () => {
    prepara();
    vi.mocked(sendsApi.send).mockResolvedValue({
      results: [
        { membershipId: 'm-ana', id: 'o1', version: 1, kind: 'new' },
        { membershipId: 'm-diego', id: 'o2', version: 2, kind: 'update' },
      ],
    });
    renderWithClient(<OrgSendPage />);

    const plano = await screen.findByRole('combobox', { name: 'Plano' });
    await waitFor(() => expect(within(plano).getAllByRole('option')).toHaveLength(2));
    expect(plano).not.toHaveTextContent('Braços');
    fireEvent.change(plano, { target: { value: 't1' } });

    fireEvent.click(await screen.findByRole('button', { name: 'Todos que eu acompanho (1)' }));
    expect(screen.getByRole('checkbox', { name: /Ana Dias/ })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByText('Como chega para Ana')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Diego Reis/ }));
    fireEvent.change(screen.getByLabelText(/O que mudou/), {
      target: { value: 'Trocou 2 exercícios.' },
    });
    expect(screen.getByLabelText('Prévia do cartão')).toHaveTextContent('Trocou 2 exercícios.');

    fireEvent.click(screen.getByRole('radio', { name: 'Flexível' }));
    expect(screen.queryByRole('radiogroup', { name: 'Começa' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Termina em'), { target: { value: '2027-01-31' } });
    fireEvent.change(screen.getByLabelText('Nota no plano (opcional)'), {
      target: { value: 'Foco no joelho.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Enviar para 2 pessoas' }));
    await waitFor(() => expect(sendsApi.send).toHaveBeenCalled());
    expect(vi.mocked(sendsApi.send).mock.calls[0]).toEqual([
      'g1',
      {
        templateId: 't1',
        membershipIds: ['m-ana', 'm-diego'],
        schedule: 'FLEXIBLE',
        endDate: '2027-01-31',
        note: 'Foco no joelho.',
        changeNote: 'Trocou 2 exercícios.',
      },
    ]);
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Enviado · 1 recebeu a versão nova'));
  });

  it('quem segue um flexível sem fim desliga "depois do plano atual" e diz por quê (#461)', async () => {
    prepara();
    vi.mocked(sendsApi.recipients).mockResolvedValue({
      recipients: [pessoa('Ana Dias'), pessoa('Gil Reis', { openEnded: true })],
    });
    renderWithClient(<OrgSendPage />);
    const plano = await screen.findByRole('combobox', { name: 'Plano' });
    fireEvent.change(plano, { target: { value: 't1' } });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Ana Dias/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Depois do plano atual' }));
    expect(screen.getByRole('radio', { name: 'Depois do plano atual' })).toBeEnabled();

    fireEvent.click(screen.getByRole('checkbox', { name: /Gil Reis/ }));
    expect(screen.getByRole('radio', { name: 'Depois do plano atual' })).toBeDisabled();
    // A escolha volta para "Hoje" e a tela diz por quê.
    expect(screen.getByRole('radio', { name: 'Hoje' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/Gil segue um plano flexível sem data de fim/)).toBeInTheDocument();
  });

  it('plano alimentar não pede agenda', async () => {
    prepara();
    vi.mocked(sendsApi.send).mockResolvedValue({
      results: [{ membershipId: 'm-eva', id: 'n1', version: 1, kind: 'new' }],
    });
    renderWithClient(<OrgSendPage />);
    fireEvent.click(await screen.findByRole('radio', { name: /Plano alimentar/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Plano' }), {
      target: { value: 't3' },
    });
    expect(screen.queryByRole('radiogroup', { name: 'Como segue' })).toBeNull();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Eva Lima/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar para Eva' }));
    await waitFor(() =>
      expect(sendsApi.send).toHaveBeenCalledWith('g1', {
        templateId: 't3',
        membershipIds: ['m-eva'],
      }),
    );
  });

  it('enviados recentemente: estado, "sem progresso" sem motivo, e cancelar o que não foi aceito', async () => {
    prepara([
      enviado({ noProgress: true }),
      enviado({
        id: 'o2',
        name: 'Bia Melo',
        status: 'ACCEPTED',
        progress: { done: 5, planned: 12, percent: 42 },
      }),
      enviado({ id: 'o3', name: 'Caio Luz', status: 'SENT', canRevoke: true }),
    ]);
    vi.mocked(sendsApi.revoke).mockResolvedValue({ id: 'o3', status: 'REVOKED' });
    renderWithClient(<OrgSendPage />);

    const lista = await screen.findByRole('list', { name: 'Enviados recentemente' });
    const itens = within(lista).getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('aceito');
    expect(itens[0]).toHaveTextContent('sem progresso');
    expect(itens[1]).toHaveTextContent('42% · sessão 5 de 12');
    expect(within(itens[0]!).queryByRole('button', { name: /Cancelar envio/ })).toBeNull();

    fireEvent.click(
      within(itens[2]!).getByRole('button', { name: 'Cancelar envio para Caio Luz' }),
    );
    expect(sendsApi.revoke).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Cancelar este envio?' })).getByRole('button', {
        name: 'Cancelar envio',
      }),
    );
    await waitFor(() => expect(sendsApi.revoke).toHaveBeenCalledWith('g1', 'o3'));
  });
});
