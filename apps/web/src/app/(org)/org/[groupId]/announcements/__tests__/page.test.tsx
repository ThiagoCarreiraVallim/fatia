import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Announcement, MyGroup, PanelPoll } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    announcementsApi: { list: vi.fn(), create: vi.fn(), cancel: vi.fn() },
    moderationApi: { polls: vi.fn() },
    feedApi: { create: vi.fn() },
  };
});

import { announcementsApi, feedApi, moderationApi } from '@fatia/api-client';
import OrgAnnouncementsPage from '../page';

const agendado: Announcement = {
  id: 'a1',
  title: 'Treino da semana',
  body: 'Bora',
  publishedAs: 'GROUP',
  pin: false,
  pinDays: null,
  push: true,
  repeat: 'WEEKLY',
  nextRunAt: new Date(Date.now() + 86_400_000).toISOString(),
  lastRunAt: null,
  createdAt: new Date().toISOString(),
  author: 'Bruno',
};

const enquete = (p: Partial<PanelPoll> = {}): PanelPoll => ({
  postId: 'p1',
  question: 'Qual horário?',
  author: 'Helena',
  createdAt: new Date().toISOString(),
  closesAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  closed: false,
  totalVotes: null,
  options: [
    { label: '8h', percent: null },
    { label: '9h', percent: null },
  ],
  top: null,
  ...p,
});

function abrir(polls: PanelPoll[] = [enquete()]) {
  ctx.group = grupo({ role: 'PROFESSIONAL', name: 'Academia Demo' });
  vi.mocked(announcementsApi.list).mockResolvedValue([agendado]);
  vi.mocked(moderationApi.polls).mockResolvedValue(polls);
  return renderWithClient(<OrgAnnouncementsPage />);
}

describe('/org/[groupId]/announcements (Pn-14 e Pn-26)', () => {
  afterEach(() => vi.clearAllMocks());

  it('comunicado agora: em nome da comunidade, fixado por 7 dias e com notificação', async () => {
    const user = userEvent.setup();
    vi.mocked(announcementsApi.create).mockResolvedValue(agendado);
    abrir();
    await user.click(await screen.findByRole('button', { name: /Novo comunicado/ }));
    const form = screen.getByRole('form', { name: 'Novo comunicado' });
    await user.type(within(form).getByRole('textbox', { name: 'Título' }), 'Feriado');
    await user.type(within(form).getByRole('textbox', { name: 'Texto' }), 'Abrimos às 8h');
    await user.click(within(form).getByRole('button', { name: 'Publicar agora' }));
    await waitFor(() =>
      expect(announcementsApi.create).toHaveBeenCalledWith('g1', {
        title: 'Feriado',
        body: 'Abrimos às 8h',
        publishedAs: 'GROUP',
        pin: true,
        pinDays: 7,
        push: true,
        at: null,
        repeat: 'NONE',
      }),
    );
  });

  it('agendar pede um horário de 15 em 15 minutos e deixa repetir', async () => {
    const user = userEvent.setup();
    vi.mocked(announcementsApi.create).mockResolvedValue(agendado);
    abrir();
    await user.click(await screen.findByRole('button', { name: /Novo comunicado/ }));
    const form = screen.getByRole('form', { name: 'Novo comunicado' });
    await user.type(within(form).getByRole('textbox', { name: 'Título' }), 'Treino');
    await user.type(within(form).getByRole('textbox', { name: 'Texto' }), 'Semana nova');
    await user.click(within(form).getByRole('radio', { name: 'Agendar' }));
    expect(within(form).getByRole('button', { name: 'Agendar' })).toBeDisabled();
    const amanha = new Date(Date.now() + 86_400_000);
    const dia = `${amanha.getFullYear()}-${String(amanha.getMonth() + 1).padStart(2, '0')}-${String(amanha.getDate()).padStart(2, '0')}`;
    const campoDia = within(form).getByLabelText('Dia');
    await user.clear(campoDia);
    await user.type(campoDia, dia);
    const horario = within(form).getByRole('combobox', { name: 'Horário' });
    const opcoes = within(horario).getAllByRole('option').slice(1);
    expect(opcoes).toHaveLength(96);
    expect(opcoes[0]).toHaveTextContent('00:00');
    expect(opcoes[1]).toHaveTextContent('00:15');
    await user.selectOptions(horario, opcoes[28]!); // 07:00
    await user.click(within(form).getByRole('radio', { name: 'Todo dia' }));
    await user.click(within(form).getByRole('button', { name: 'Agendar e repetir' }));
    await waitFor(() => expect(announcementsApi.create).toHaveBeenCalled());
    const input = vi.mocked(announcementsApi.create).mock.calls[0]![1];
    expect(input.repeat).toBe('DAILY');
    expect(new Date(input.at!).getHours()).toBe(7);
    expect(new Date(input.at!).getMinutes()).toBe(0);
  });

  it('agendados listam a repetição e cancelam com confirmação', async () => {
    const user = userEvent.setup();
    vi.mocked(announcementsApi.cancel).mockResolvedValue({ canceled: true });
    abrir();
    const lista = await screen.findByRole('list', { name: 'Comunicados agendados' });
    expect(within(lista).getByText('Treino da semana')).toBeInTheDocument();
    expect(within(lista).getByText(/toda semana · .* · notificação/)).toBeInTheDocument();
    await user.click(within(lista).getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar comunicado' }));
    await waitFor(() => expect(announcementsApi.cancel).toHaveBeenCalledWith('g1', 'a1'));
  });

  it('enquete com poucos votos: resultado oculto, sem % nem total', async () => {
    abrir([enquete()]);
    const lista = await screen.findByRole('list', { name: 'Enquetes do mural' });
    expect(within(lista).getByText(/Resultado oculto · aparece com 5 votos/)).toBeInTheDocument();
    expect(within(lista).queryByText(/%/)).toBeNull();
  });

  it('enquete com 5 votos ou mais mostra as %, sem nomes', async () => {
    abrir([
      enquete({
        totalVotes: 26,
        options: [
          { label: '8h', percent: 54 },
          { label: '9h', percent: 46 },
        ],
        top: '8h',
      }),
    ]);
    const res = await screen.findByRole('list', { name: 'Resultado: Qual horário?' });
    expect(within(res).getByText('54%')).toBeInTheDocument();
    expect(within(res).getByText(/26 votos · sem nomes/)).toBeInTheDocument();
  });

  it('nova enquete sai no mural em nome da comunidade', async () => {
    const user = userEvent.setup();
    vi.mocked(feedApi.create).mockResolvedValue({} as never);
    abrir();
    await user.click(await screen.findByRole('button', { name: /Nova enquete/ }));
    const form = screen.getByRole('form', { name: 'Nova enquete' });
    await user.type(within(form).getByRole('textbox', { name: 'Pergunta' }), 'Aula nova?');
    await user.type(within(form).getByRole('textbox', { name: 'Opção 1' }), 'HIIT');
    await user.type(within(form).getByRole('textbox', { name: 'Opção 2' }), 'Pilates');
    await user.click(within(form).getByRole('button', { name: 'Publicar no mural' }));
    await waitFor(() =>
      expect(feedApi.create).toHaveBeenCalledWith('g1', {
        kind: 'POLL',
        publishedAs: 'GROUP',
        poll: { question: 'Aula nova?', options: ['HIIT', 'Pilates'], days: 3 },
      }),
    );
  });
});
