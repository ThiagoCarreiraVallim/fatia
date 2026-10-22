import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { QuickAddProvider, useQuickAdd } from '../quick-add';

const nav = vi.hoisted(() => ({ pathname: '/', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: nav.push }),
}));

vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  };
});

// Os drawers de registro têm testes próprios; aqui importa qual abre e com quê.
vi.mock('@/components/nutrition/food-search-drawer', () => ({
  FoodSearchDrawer: ({ date, mealType }: { date: string; mealType: string }) => (
    <div data-testid="refeicao">{`${date} ${mealType}`}</div>
  ),
}));
vi.mock('@/components/progress/log-water-drawer', () => ({
  LogWaterDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="agua" /> : null),
}));
vi.mock('@/components/progress/log-weight-drawer', () => ({
  LogWeightDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="peso" /> : null),
}));
vi.mock('@/components/progress/log-steps-drawer', () => ({
  LogStepsDrawer: ({ open }: { open: boolean }) => (open ? <div data-testid="passos" /> : null),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: { getActiveSession: vi.fn(), startSession: vi.fn() },
    getChatAvailability: vi.fn(),
  };
});

import { getChatAvailability, workoutApi } from '@fatia/api-client';

const availability = vi.mocked(getChatAvailability);

const getActiveSession = vi.mocked(workoutApi.getActiveSession);
const startSession = vi.mocked(workoutApi.startSession);

// O gatilho de verdade mora na barra (`bottom-nav.tsx`); aqui basta quem chame `open`.
function Gatilho() {
  const { open } = useQuickAdd();
  return (
    <button type="button" onClick={open}>
      Registrar
    </button>
  );
}

function renderQuickAdd() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <QuickAddProvider>
        <Gatilho />
      </QuickAddProvider>
    </QueryClientProvider>,
  );
}

async function abrirMenu() {
  const user = userEvent.setup();
  renderQuickAdd();
  await user.click(screen.getByRole('button', { name: 'Registrar' }));
  return { user, menu: screen.getByRole('dialog') };
}

describe('QuickAddProvider', () => {
  beforeEach(() => {
    nav.pathname = '/';
    getActiveSession.mockResolvedValue(null);
    availability.mockResolvedValue({ available: false } as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('o "+" abre o menu com os cinco registros', async () => {
    const { menu } = await abrirMenu();
    expect(within(menu).getByRole('heading', { name: 'Registrar' })).toBeInTheDocument();
    const rotulos = within(menu)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(rotulos).toEqual(['Refeição', 'Água', 'Peso', 'Passos', 'Começar treino livre']);
  });

  it.each([
    ['Água', 'agua'],
    ['Peso', 'peso'],
    ['Passos', 'passos'],
  ])('%s fecha o menu e abre o drawer do registro', async (rotulo, testId) => {
    const { user, menu } = await abrirMenu();
    await user.click(within(menu).getByRole('button', { name: rotulo }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId(testId)).toBeInTheDocument();
  });

  it('refeição abre a busca em hoje, no tipo da hora', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 14, 12, 30));
    const { user, menu } = await abrirMenu();
    await user.click(within(menu).getByRole('button', { name: 'Refeição' }));
    expect(screen.getByTestId('refeicao')).toHaveTextContent('2026-10-14 LUNCH');
  });

  it('com treino aberto, retoma a sessão em vez de começar outra', async () => {
    getActiveSession.mockResolvedValue({ id: 's1' } as never);
    const { user, menu } = await abrirMenu();
    const treino = await within(menu).findByRole('button', { name: 'Continuar treino' });
    await user.click(treino);
    expect(startSession).not.toHaveBeenCalled();
    expect(nav.push).toHaveBeenCalledWith('/workout');
  });

  it('sem treino aberto, começa um livre e vai para a tela de Treino', async () => {
    startSession.mockResolvedValue({ id: 's2' } as never);
    const { user, menu } = await abrirMenu();
    const treino = await within(menu).findByRole('button', { name: 'Começar treino livre' });
    await waitFor(() => expect(treino).toBeEnabled());
    await user.click(treino);
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith('/workout'));
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it('sem IA na instância, o menu não mostra o cartão do chat', async () => {
    const { menu } = await abrirMenu();
    await waitFor(() => expect(availability).toHaveBeenCalled());
    expect(within(menu).queryByRole('link')).not.toBeInTheDocument();
  });

  it('com IA, o cartão do chat vem antes dos registros e fecha o menu ao ser escolhido', async () => {
    availability.mockResolvedValue({ available: true, allowed: true } as never);
    const { user, menu } = await abrirMenu();
    const chat = await within(menu).findByRole('link', { name: /Chat com a IA/ });
    expect(chat).toHaveAttribute('href', '/chat');
    expect(
      chat.compareDocumentPosition(within(menu).getByRole('button', { name: 'Refeição' })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.click(chat);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('no Free, o cartão leva ao plano e avisa que é do PRO', async () => {
    availability.mockResolvedValue({
      available: true,
      allowed: false,
      reason: 'plan_required',
    } as never);
    const { menu } = await abrirMenu();
    const chat = await within(menu).findByRole('link', { name: /Chat com a IA/ });
    expect(chat).toHaveAttribute('href', '/plan?recurso=chat');
    expect(chat).toHaveTextContent(/exige o plano PRO/);
  });
});
