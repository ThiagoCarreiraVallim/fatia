import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { MeUser, NewsFeed } from '@fatia/api-client';

const api = vi.hoisted(() => ({
  me: vi.fn(),
  updateMe: vi.fn(),
  exportMyData: vi.fn(),
  deleteMe: vi.fn(),
  mine: vi.fn(),
  plan: vi.fn(),
  today: vi.fn(),
  news: vi.fn(),
  markRead: vi.fn(),
  seen: vi.fn(),
  markSeen: vi.fn(),
  availability: vi.fn(),
  listStudents: vi.fn(),
  reminders: vi.fn(),
  toast: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: api.toast }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: api.push, replace: api.replace }),
  usePathname: () => '/you',
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    usersApi: {
      ...actual.usersApi,
      me: api.me,
      updateMe: api.updateMe,
      exportMyData: api.exportMyData,
      deleteMe: api.deleteMe,
    },
    groupsApi: { ...actual.groupsApi, mine: api.mine },
    billingApi: { ...actual.billingApi, plan: api.plan },
    progressApi: { ...actual.progressApi, today: api.today },
    newsApi: { list: api.news, markRead: api.markRead },
    tutorialsApi: { seen: api.seen, markSeen: api.markSeen },
    professionalApi: { ...actual.professionalApi, listStudents: api.listStudents },
    remindersApi: { ...actual.remindersApi, list: api.reminders },
    getChatAvailability: api.availability,
  };
});

import { YouScreen } from '../you-screen';
import { DeleteAccountScreen } from '../delete-account-screen';
import { UnitsScreen } from '../units-screen';
import { NewsScreen } from '../news-screen';
import { HelpScreen } from '../help-screen';
import { writeNewsCache } from '../news-cache';
import { centerSquare } from '../avatar-crop';

const ME: MeUser = {
  id: 'u1',
  email: 'ana@email.com',
  name: 'Ana Demo',
  role: 'USER',
  timezone: 'America/Sao_Paulo',
  heightCm: 168,
  sex: null,
  birthDate: null,
  activityLevel: null,
  objective: null,
  onboardedAt: '2026-10-01T00:00:00Z',
  onboardingStep: null,
  nickname: null,
  bio: null,
  avatarUrl: null,
  avatarVisibility: 'COMMUNITIES',
  keepMealPhotos: false,
  whatsapp: null,
  whatsappOptIn: false,
  loadUnit: 'KG',
  distanceUnit: 'KM',
};

const FEED: NewsFeed = {
  items: [
    {
      id: 'unidades',
      date: '2026-11-10',
      title: 'Unidades',
      body: 'Carga em kg ou lb.',
      icon: 'ruler',
      tone: 'lime',
      href: '/you/units',
      unread: true,
    },
    {
      id: 'tema-claro',
      date: '2026-10-30',
      title: 'Tema claro',
      body: 'Escolha em Aparência.',
      icon: 'sun',
      tone: 'neutral',
      href: null,
      unread: false,
    },
  ],
  unreadCount: 1,
};

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

const assign = vi.fn();

beforeEach(() => {
  api.me.mockResolvedValue(ME);
  api.updateMe.mockImplementation(async (patch: Partial<MeUser>) => ({ ...ME, ...patch }));
  api.mine.mockResolvedValue([]);
  api.plan.mockResolvedValue({ requiresPlan: true, tier: 'FREE' });
  api.today.mockResolvedValue({ weight: { latest: { weightKg: 70.2 } } });
  api.news.mockResolvedValue(FEED);
  api.seen.mockResolvedValue({ seen: [] });
  api.markSeen.mockImplementation(async (id: string) => ({ seen: [id] }));
  api.availability.mockResolvedValue({ available: false });
  api.listStudents.mockResolvedValue([]);
  api.reminders.mockResolvedValue([
    { id: 'r1', enabled: true },
    { id: 'r2', enabled: true },
    { id: 'r3', enabled: false },
  ]);
  vi.stubGlobal('location', { ...window.location, assign });
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Você (Al-V1)', () => {
  it('cabeçalho, peso, estatura e as seções da prancha', async () => {
    renderWith(<YouScreen />);
    expect(await screen.findByText('ana@email.com · nas comunidades: Ana')).toBeInTheDocument();
    expect(await screen.findByText('70,2')).toBeInTheDocument();
    expect(screen.getByText('168')).toBeInTheDocument();
    for (const t of ['Progresso', 'Nutrição', 'Treino', 'IA', 'Comunidade e equipe', 'Conta']) {
      expect(screen.getByRole('region', { name: t })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: /Unidades.*kg · km/ })).toHaveAttribute(
      'href',
      '/you/units',
    );
    expect(await screen.findByLabelText('1 não lidas')).toBeInTheDocument();
    // Lembretes (Al-V2, #389) em "Rotina e avisos", com quantos estão ligados.
    expect(await screen.findByRole('link', { name: /Lembretes.*2 ativos/ })).toHaveAttribute(
      'href',
      '/you/reminders',
    );
    expect(screen.getByRole('link', { name: 'Apagar minha conta' })).toHaveAttribute(
      'href',
      '/you/delete',
    );
  });

  it('guardar fotos liga e avisa com o texto da prancha', async () => {
    const user = userEvent.setup();
    renderWith(<YouScreen />);
    const row = await screen.findByRole('button', { name: /Guardar fotos das refeições/ });
    await waitFor(() => expect(row).toBeEnabled());
    expect(row).toHaveAttribute('aria-pressed', 'false');
    await user.click(row);
    await waitFor(() => expect(api.updateMe).toHaveBeenCalledWith({ keepMealPhotos: true }));
    await waitFor(() => expect(api.toast).toHaveBeenCalledWith('Novas fotos serão guardadas'));
  });

  it('exportar pede o link e baixa por ele', async () => {
    api.exportMyData.mockResolvedValue({ url: 'https://api.x/api/exports/tok', expiresAt: 'x' });
    const user = userEvent.setup();
    renderWith(<YouScreen />);
    await user.click(await screen.findByRole('button', { name: /Exportar meus dados/ }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://api.x/api/exports/tok'));
    expect(api.toast).toHaveBeenCalledWith(
      'Arquivo pronto · baixe pelo link (vale 24 h)',
      expect.anything(),
    );
  });

  it('trocar senha vai ao fluxo do Logto e volta para Você', async () => {
    const user = userEvent.setup();
    renderWith(<YouScreen />);
    await user.click(await screen.findByRole('button', { name: /Trocar senha/ }));
    expect(assign).toHaveBeenCalledWith('/api/logto/sign-in?tela=senha&next=%2Fyou');
  });
});

describe('Apagar conta (Al-V8)', () => {
  it('só habilita com APAGAR e manda a palavra certa', async () => {
    api.deleteMe.mockResolvedValue({ deleted: true });
    const user = userEvent.setup();
    renderWith(<DeleteAccountScreen />);
    const button = screen.getByRole('button', { name: 'Apagar minha conta' });
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Digite APAGAR para confirmar'), 'apaga');
    expect(button).toBeDisabled();
    await user.type(screen.getByLabelText('Digite APAGAR para confirmar'), 'r ');
    expect(button).toBeEnabled();
    await user.click(button);
    await waitFor(() => expect(api.deleteMe).toHaveBeenCalledWith('APAGAR'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/api/logto/sign-out'));
  });

  it('a conta dona de comunidade avisa que ela some junto', async () => {
    api.mine.mockResolvedValue([
      { id: 'g1', name: 'Academia Demo', role: 'OWNER' },
      { id: 'g2', name: 'Corrida', role: 'MEMBER' },
    ]);
    renderWith(<DeleteAccountScreen />);
    expect(await screen.findByText('Esta conta é a dona de Academia Demo')).toBeInTheDocument();
    expect(screen.queryByText(/Corrida/)).not.toBeInTheDocument();
  });
});

describe('Unidades (Al-V10/V10b)', () => {
  it('trocar para lb salva, muda a prévia e oferece voltar ao padrão', async () => {
    const user = userEvent.setup();
    renderWith(<UnitsScreen />);
    expect(await screen.findByText('padrão')).toBeInTheDocument();
    expect(screen.getByText('52,5 kg × 10')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Voltar ao padrão do Brasil' })).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'lb' }));
    await waitFor(() =>
      expect(api.updateMe).toHaveBeenCalledWith({ loadUnit: 'LB', distanceUnit: 'KM' }),
    );
    expect(await screen.findByText('115,7 lb × 10')).toBeInTheDocument();
    expect(screen.getByText('alterado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voltar ao padrão do Brasil' }));
    await waitFor(() =>
      expect(api.updateMe).toHaveBeenLastCalledWith({ loadUnit: 'KG', distanceUnit: 'KM' }),
    );
  });
});

describe('Novidades (Al-V11/V11b)', () => {
  it('mostra o "novo" e marca tudo como lido', async () => {
    api.markRead.mockResolvedValue({
      items: FEED.items.map((i) => ({ ...i, unread: false })),
      unreadCount: 0,
    });
    const user = userEvent.setup();
    renderWith(<NewsScreen />);
    expect(await screen.findByText('1 novidade')).toBeInTheDocument();
    expect(screen.getByText('novo')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Marcar tudo como lido' }));
    expect(await screen.findByText('Tudo lido')).toBeInTheDocument();
    expect(api.markRead).toHaveBeenCalledWith(undefined);
    expect(screen.queryByText('novo')).toBeNull();
  });

  it('sem conexão mostra o que estava salvo, sem "novo"', async () => {
    writeNewsCache(FEED, new Date('2026-11-09T10:00:00Z'));
    api.news.mockRejectedValue(new TypeError('Failed to fetch'));
    renderWith(<NewsScreen />);
    expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
    expect(screen.getByText('salvo em 9 nov')).toBeInTheDocument();
    expect(screen.getByText('Unidades')).toBeInTheDocument();
    expect(screen.queryByText('novo')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Marcar tudo como lido' })).toBeNull();
  });
});

describe('Ajuda (Al-V12/V12b)', () => {
  it('abrir um tutorial mostra o texto e marca como assistido', async () => {
    const user = userEvent.setup();
    renderWith(<HelpScreen />);
    await user.click(screen.getByRole('button', { name: /Escanear o código de barras/ }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText(/aponte para o código do pacote/)).toBeInTheDocument();
    await waitFor(() => expect(api.markSeen).toHaveBeenCalledWith('codigo-de-barras'));
  });

  it('a busca filtra e "Repetir primeiros passos" volta ao começo', async () => {
    const user = userEvent.setup();
    renderWith(<HelpScreen />);
    expect(screen.getByRole('link', { name: /Repetir primeiros passos/ })).toHaveAttribute(
      'href',
      '/onboarding?next=/you/help',
    );
    await user.type(screen.getByLabelText('Buscar ajuda'), 'libras');
    expect(screen.getByRole('button', { name: /Ver a carga em libras/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Registrar uma refeição/ })).toBeNull();
  });

  it('abre direto no tutorial pedido (o "Ver o tutorial" de Conectar sua IA, #388)', async () => {
    renderWith(<HelpScreen initialTutorialId="conectar-sua-ia" />);
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Conectar ao Claude ou ChatGPT')).toBeInTheDocument();
    expect(within(sheet).getByText(/remova o conector no app da sua IA/)).toBeInTheDocument();
  });

  // Revisão da #388: o `?tutorial=` passa pelo mesmo caminho do toque na lista.
  it('o tutorial aberto pela rota também fica marcado como assistido', async () => {
    renderWith(<HelpScreen initialTutorialId="conectar-sua-ia" />);
    await screen.findByRole('dialog');
    await waitFor(() => expect(api.markSeen).toHaveBeenCalledWith('conectar-sua-ia'));
    expect(api.markSeen).toHaveBeenCalledTimes(1);
  });

  it('fechar o tutorial aberto pela rota tira o ?tutorial= da URL', async () => {
    const user = userEvent.setup();
    renderWith(<HelpScreen initialTutorialId="conectar-sua-ia" />);
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.replace).toHaveBeenCalledWith('/you/help', { scroll: false });
  });

  it('fechar um tutorial aberto pela lista não mexe na URL', async () => {
    const user = userEvent.setup();
    renderWith(<HelpScreen />);
    await user.click(screen.getByRole('button', { name: /Escanear o código de barras/ }));
    await screen.findByRole('dialog');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.replace).not.toHaveBeenCalled();
  });

  it('tutorial que não existe não abre nada', () => {
    renderWith(<HelpScreen initialTutorialId="nao-existe" />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('foto de perfil', () => {
  it('o corte pega o quadrado do centro', () => {
    expect(centerSquare(1200, 800)).toEqual({ sx: 200, sy: 0, side: 800 });
    expect(centerSquare(600, 900)).toEqual({ sx: 0, sy: 150, side: 600 });
  });
});
