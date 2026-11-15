import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { NotificationSettings, Reminder } from '@fatia/api-client';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  settings: vi.fn(),
  setQuietHours: vi.fn(),
  setPreferences: vi.fn(),
  webPushStatus: vi.fn(),
  subscribeWebPush: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: api.toast }));
// O "+" vai para a barra do topo; aqui ele aparece no lugar.
vi.mock('@/components/layout/app-top-bar', () => ({
  TopBarActions: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    remindersApi: { list: api.list, create: api.create, update: api.update, remove: api.remove },
    notificationsApi: {
      ...actual.notificationsApi,
      settings: api.settings,
      setQuietHours: api.setQuietHours,
      setPreferences: api.setPreferences,
      webPushStatus: api.webPushStatus,
      subscribeWebPush: api.subscribeWebPush,
    },
  };
});

import { RemindersScreen } from '../reminders-screen';
import { NotificationsScreen } from '../../notifications/notifications-screen';

const R = (over: Partial<Reminder>): Reminder => ({
  id: 'r1',
  kind: 'WATER',
  habitId: null,
  title: 'Água',
  mode: 'INTERVAL',
  everyHours: 2,
  from: '08:00',
  to: '20:00',
  times: [],
  weekdays: [1, 2, 3, 4, 5, 6, 7],
  stepsBelow: null,
  enabled: true,
  createdAt: '2026-11-15T00:00:00Z',
  updatedAt: '2026-11-15T00:00:00Z',
  ...over,
});

const LIST: Reminder[] = [
  R({}),
  R({
    id: 'r2',
    kind: 'MEAL',
    title: 'Almoço',
    mode: 'TIMES',
    everyHours: null,
    from: null,
    to: null,
    times: ['12:30'],
    weekdays: [1, 2, 3, 4, 5],
  }),
  R({
    id: 'r3',
    kind: 'WEIGHT',
    title: 'Pesagem',
    mode: 'TIMES',
    times: ['07:00'],
    weekdays: [1],
    enabled: false,
  }),
];

const ALL = {
  COMMUNITY: true,
  CHALLENGES: true,
  FEED: true,
  MODERATION: true,
  CHAT: true,
  ANNOUNCEMENTS: true,
  PLAN_RECEIVED: true,
  ASSESSMENT_REQUESTED: true,
  QUESTIONNAIRE: true,
  SCHEDULE: true,
  SCHEDULE_REMINDER: true,
  BIRTHDAY: false,
  REMINDERS: true,
};

const SETTINGS: NotificationSettings = {
  preferences: ALL,
  quietHours: { enabled: true, from: '22:00', to: '07:00' },
  team: { name: 'Helena' },
  community: { name: 'Academia Demo' },
};

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  vi.clearAllMocks();
  api.list.mockResolvedValue(LIST);
  api.settings.mockResolvedValue(SETTINGS);
  api.webPushStatus.mockResolvedValue({ publicKey: null, subscriptions: 0 });
  api.update.mockImplementation((id: string, input: Partial<Reminder>) =>
    Promise.resolve({ ...LIST.find((r) => r.id === id)!, ...input }),
  );
  api.create.mockResolvedValue(R({ id: 'novo' }));
  api.remove.mockResolvedValue({ removed: true });
  api.setQuietHours.mockResolvedValue({ enabled: false, from: '22:00', to: '07:00' });
  api.setPreferences.mockResolvedValue({ ...ALL, BIRTHDAY: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Lembretes (Al-V2)', () => {
  it('lista com o resumo da prancha, liga-desliga e conta os ativos', async () => {
    const user = userEvent.setup();
    renderWith(<RemindersScreen />);
    expect(await screen.findByText('A cada 2 h · 8h–20h')).toBeInTheDocument();
    expect(screen.getByText('12:30 · seg a sex')).toBeInTheDocument();
    expect(screen.getByText('Seg · 07:00')).toBeInTheDocument();
    expect(screen.getByText(/2 ativos · toque no lembrete/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ligar ou desligar Pesagem' }));
    expect(api.update).toHaveBeenCalledWith('r3', { enabled: true });
    expect(await screen.findByText(/3 ativos/)).toBeInTheDocument();
  });

  it('silêncio noturno mostra a janela e desliga no toque', async () => {
    const user = userEvent.setup();
    renderWith(<RemindersScreen />);
    const night = await screen.findByRole('button', { name: /Silêncio noturno/ });
    expect(night).toHaveTextContent('22:00 – 07:00');
    expect(night).toHaveAttribute('aria-pressed', 'true');
    await user.click(night);
    expect(api.setQuietHours).toHaveBeenCalledWith({ enabled: false });
    expect(night).toHaveAttribute('aria-pressed', 'false');
  });

  it('sem push no navegador, "Liberar" pede a permissão e inscreve', async () => {
    const subscription = {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({ keys: { p256dh: 'p', auth: 'a' } }),
    };
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal(
      'Notification',
      Object.assign(function Notification() {}, { permission: 'default', requestPermission }),
    );
    vi.stubGlobal('PushManager', function PushManager() {});
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockResolvedValue(subscription),
          },
        }),
      },
    });
    api.webPushStatus.mockResolvedValue({ publicKey: 'YQ', subscriptions: 0 });
    api.subscribeWebPush.mockResolvedValue({ subscribed: true });

    const user = userEvent.setup();
    renderWith(<RemindersScreen />);
    expect(await screen.findByText('Notificações bloqueadas')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Liberar' }));
    expect(requestPermission).toHaveBeenCalled();
    await waitFor(() =>
      expect(api.subscribeWebPush).toHaveBeenCalledWith({
        endpoint: 'https://push.example/abc',
        p256dh: 'p',
        auth: 'a',
      }),
    );
    await waitFor(() => expect(screen.queryByText('Notificações bloqueadas')).toBeNull());
    Reflect.deleteProperty(navigator, 'serviceWorker');
  });
});

describe('folha de lembrete (Al-V3/V3b)', () => {
  it('novo: nasce como a prancha e horários fixos ganham "+ Horário"', async () => {
    const user = userEvent.setup();
    renderWith(<RemindersScreen />);
    await screen.findByText('A cada 2 h · 8h–20h');
    await user.click(screen.getByRole('button', { name: 'Novo lembrete' }));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Novo lembrete')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: 'Salvar · 7 avisos por dia, 7 dias' }),
    ).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Mais' }));
    expect(within(sheet).getByText('3 h')).toBeInTheDocument();
    expect(
      within(sheet).getByRole('button', { name: /Salvar · 5 avisos por dia/ }),
    ).toBeInTheDocument();

    await user.click(within(sheet).getByRole('radio', { name: 'Horários fixos' }));
    await user.click(within(sheet).getByRole('button', { name: 'Adicionar horário' }));
    // O horário novo (18:00) já abre no seletor.
    expect(within(sheet).getByText('Horário 4')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Domingo' }));
    await user.click(
      within(sheet).getByRole('button', { name: 'Salvar · 4 avisos por dia, 6 dias' }),
    );
    expect(api.create).toHaveBeenCalledWith({
      kind: 'WATER',
      mode: 'TIMES',
      times: ['08:00', '12:30', '18:00', '19:00'],
      weekdays: [1, 2, 3, 4, 5, 6],
    });
  });

  it('editar: abre no primeiro horário, o seletor anda e salva', async () => {
    const user = userEvent.setup();
    renderWith(<RemindersScreen />);
    await user.click(await screen.findByText('12:30 · seg a sex'));
    const sheet = await screen.findByRole('dialog');
    expect(within(sheet).getByText('Editar lembrete')).toBeInTheDocument();
    expect(within(sheet).getByText('Horário 1')).toBeInTheDocument();
    // Um só horário: sem "Remover".
    expect(within(sheet).queryByRole('button', { name: 'Remover' })).toBeNull();
    await user.click(within(sheet).getByRole('button', { name: 'Mais uma hora' }));
    await user.click(within(sheet).getByRole('button', { name: 'Menos 5 minutos' }));
    expect(within(sheet).getByRole('button', { name: /13:25/ })).toBeInTheDocument();
    await user.click(within(sheet).getByRole('button', { name: 'Ok' }));
    await user.click(
      within(sheet).getByRole('button', { name: 'Salvar alterações · 1 aviso por dia, 5 dias' }),
    );
    expect(api.update).toHaveBeenCalledWith('r2', {
      kind: 'MEAL',
      mode: 'TIMES',
      times: ['13:25'],
      weekdays: [1, 2, 3, 4, 5],
    });
  });

  it('a lixeira apaga e avisa', async () => {
    const user = userEvent.setup();
    renderWith(<RemindersScreen />);
    await user.click(await screen.findByText('Seg · 07:00'));
    const sheet = await screen.findByRole('dialog');
    await user.click(within(sheet).getByRole('button', { name: 'Apagar lembrete' }));
    expect(api.remove).toHaveBeenCalledWith('r3');
    await waitFor(() => expect(api.toast).toHaveBeenCalledWith('Lembrete apagado'));
  });
});

describe('Notificações (Al-V4)', () => {
  it('três grupos com a equipe, prévia agrupada e liga o opcional', async () => {
    const user = userEvent.setup();
    renderWith(<NotificationsScreen />);
    const team = await screen.findByRole('region', { name: 'Da sua equipe' });
    expect(within(team).getByText('Helena')).toBeInTheDocument();
    expect(within(team).getByText('Plano novo')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Comunidade' })).toHaveTextContent('Chat com a IA');
    expect(
      screen.getByText('Helena enviou um plano novo · 5 novidades em Academia Demo'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Nenhum aviso mostra dado de saúde ou o texto de um post.'),
    ).toBeInTheDocument();

    const birthday = screen.getByRole('button', { name: /Aniversário/ });
    expect(birthday).toHaveAttribute('aria-pressed', 'false');
    await user.click(birthday);
    expect(api.setPreferences).toHaveBeenCalledWith({ BIRTHDAY: true });
    expect(birthday).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: /Plano novo/ }));
    expect(screen.getByText('5 novidades em Academia Demo')).toBeInTheDocument();
  });

  it('erro ao salvar volta a chave e avisa, sem fingir que mudou', async () => {
    api.setPreferences.mockRejectedValue(new Error('500'));
    const user = userEvent.setup();
    renderWith(<NotificationsScreen />);
    const chat = await screen.findByRole('button', { name: /Chat com a IA/ });
    await user.click(chat);
    await waitFor(() =>
      expect(api.toast).toHaveBeenCalledWith('Não deu para salvar. Tente de novo.'),
    );
    expect(chat).toHaveAttribute('aria-pressed', 'true');
  });

  it('sem equipe, "Da sua equipe" não aparece', async () => {
    api.settings.mockResolvedValue({ ...SETTINGS, team: null });
    renderWith(<NotificationsScreen />);
    await screen.findByRole('region', { name: 'Comunidade' });
    expect(screen.queryByRole('region', { name: 'Da sua equipe' })).toBeNull();
  });
});
