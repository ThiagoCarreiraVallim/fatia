import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { AiDrawerProvider, useAiDrawer } from '../ai-drawer';
import { takeFirstMessage } from '@/components/chat/drawer-message';

/**
 * O menu do botão da IA, "O que vamos registrar?" (prancha `Ia-Drawer` e
 * variações `Al-H6c6` Free e `Al-H6c7` teclado).
 */

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));

vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? (
        <div role="dialog" aria-label="O que vamos registrar?">
          {children}
        </div>
      ) : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  };
});

// As folhas de registro têm testes próprios; aqui importa qual abre e com quê.
vi.mock('@/components/nutrition/food-search-drawer', () => ({
  FoodSearchDrawer: ({ mealType }: { mealType: string }) => (
    <div data-testid="refeicao">{mealType}</div>
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
    getChatAvailability: vi.fn(),
    listConversations: vi.fn(),
    workoutApi: { ...actual.workoutApi, getActiveSession: vi.fn(), startSession: vi.fn() },
  };
});

import { getChatAvailability, listConversations, workoutApi } from '@fatia/api-client';

const availability = vi.mocked(getChatAvailability);
const conversations = vi.mocked(listConversations);

const PRO = {
  available: true,
  allowed: true,
  reason: 'ok' as const,
  photos: true,
  dictation: true,
};

function Trigger() {
  const { open } = useAiDrawer();
  return (
    <button type="button" onClick={open}>
      Abrir a IA
    </button>
  );
}

async function openDrawer() {
  const user = userEvent.setup();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <AiDrawerProvider>
        <Trigger />
      </AiDrawerProvider>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Abrir a IA' }));
  return { user, menu: screen.getByRole('dialog') };
}

describe('AiDrawer', () => {
  beforeEach(() => {
    availability.mockResolvedValue(PRO);
    conversations.mockResolvedValue([
      {
        id: 'c-idle',
        title: 'Treino sem ombro',
        createdAt: '2026-11-13T10:00:00Z',
        updatedAt: '2026-11-13T10:00:00Z',
        state: 'idle',
      },
      {
        id: 'c-wait',
        title: 'Registro do almoço',
        createdAt: '2026-11-14T12:41:00Z',
        updatedAt: '2026-11-14T12:41:00Z',
        state: 'waiting',
      },
    ]);
    vi.mocked(workoutApi.getActiveSession).mockResolvedValue(null);
  });

  afterEach(() => vi.clearAllMocks());

  it('o registro manual vem primeiro, com os cinco itens e sem Hábito e Check-in (#390)', async () => {
    const { menu } = await openDrawer();
    const manual = within(menu).getByRole('heading', { name: 'Registrar manual' }).parentElement!
      .parentElement!;
    expect(
      within(manual)
        .getAllByRole('button')
        .map((b) => b.getAttribute('aria-label')),
    ).toEqual(['Refeição', 'Água', 'Peso', 'Passos', 'Começar treino livre']);
    expect(within(menu).queryByText('Hábito')).toBeNull();
    expect(within(menu).queryByText('Check-in')).toBeNull();
  });

  it('cada registro manual abre a folha certa e fecha o menu', async () => {
    const { user, menu } = await openDrawer();
    await user.click(within(menu).getByRole('button', { name: 'Água' }));
    expect(screen.getByTestId('agua')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Abrir a IA' }));
    await user.click(screen.getByRole('button', { name: 'Refeição' }));
    expect(screen.getByTestId('refeicao')).toBeInTheDocument();
  });

  it('o registro manual aparece mesmo com a IA fora do ar (PRD §3.1)', async () => {
    availability.mockRejectedValue(new Error('fora'));
    const { menu } = await openDrawer();
    expect(within(menu).getByRole('button', { name: 'Peso' })).toBeVisible();
    expect(within(menu).queryByRole('textbox')).toBeNull();
  });

  it('as conversas em andamento vêm no topo, e tocar abre a conversa', async () => {
    const { user, menu } = await openDrawer();
    const lista = await within(menu).findByRole('heading', { name: 'Conversas' });
    const botoes = within(lista.parentElement!).getAllByRole('button');
    expect(botoes[0]).toHaveTextContent('Registro do almoço');
    expect(botoes[0]).toHaveTextContent('esperando você');
    await user.click(botoes[0]!);
    expect(nav.replace).toHaveBeenCalledWith('/chat/c-wait');
  });

  it('sem texto aparece o microfone; com texto, enviar', async () => {
    const { user, menu } = await openDrawer();
    const campo = await within(menu).findByRole('textbox', {
      name: 'Pergunte ou registre com a IA',
    });
    expect(within(menu).getByRole('button', { name: 'Ditar' })).toBeVisible();
    expect(within(menu).queryByRole('button', { name: 'Enviar' })).toBeNull();
    await user.type(campo, 'Comi');
    expect(within(menu).getByRole('button', { name: 'Enviar' })).toBeVisible();
    expect(within(menu).queryByRole('button', { name: 'Ditar' })).toBeNull();
  });

  it('enviar abre uma conversa nova e leva a mensagem para ela', async () => {
    const { user, menu } = await openDrawer();
    const campo = await within(menu).findByRole('textbox', {
      name: 'Pergunte ou registre com a IA',
    });
    await user.type(campo, 'Comi arroz e frango no almoço');
    await user.click(within(menu).getByRole('button', { name: 'Enviar' }));

    const destino = nav.replace.mock.calls[0]![0] as string;
    expect(destino).toMatch(/^\/chat\/[0-9a-f-]{36}$/);
    expect(takeFirstMessage(destino.slice('/chat/'.length))).toBe('Comi arroz e frango no almoço');
  });

  it('com o teclado aberto as conversas recolhem e o manual vira um alternador', async () => {
    const { user, menu } = await openDrawer();
    await within(menu).findByRole('heading', { name: 'Conversas' });
    const campo = within(menu).getByRole('textbox', { name: 'Pergunte ou registre com a IA' });
    await user.click(campo);

    expect(within(menu).queryByRole('heading', { name: 'Conversas' })).toBeNull();
    expect(within(menu).queryByRole('button', { name: 'Água' })).toBeNull();
    await user.click(within(menu).getByRole('button', { name: 'Manual' }));
    expect(within(menu).getByRole('button', { name: 'Água' })).toBeVisible();

    // Os chips trocam de "Sugestões" para "Completar" conforme o texto.
    expect(within(menu).getByRole('list', { name: 'Sugestões' })).toBeVisible();
    await user.type(campo, 'Bebi');
    expect(within(menu).getByRole('list', { name: 'Completar' })).toBeVisible();
    await user.click(within(menu).getByRole('button', { name: 'Bebi 500 ml de água' }));
    expect(campo).toHaveValue('Bebi 500 ml de água');
  });

  it('no Free: o registro igual, o bloco "Com a IA Pro" e nada de campo', async () => {
    availability.mockResolvedValue({
      available: true,
      allowed: false,
      reason: 'plan_required',
      photos: false,
      dictation: false,
    });
    const { user, menu } = await openDrawer();
    expect(await within(menu).findByRole('heading', { name: 'Com a IA Pro' })).toBeVisible();
    expect(within(menu).getByRole('button', { name: 'Água' })).toBeVisible();
    expect(within(menu).queryByRole('textbox')).toBeNull();
    expect(listConversations).not.toHaveBeenCalled();
    await user.click(within(menu).getByRole('button', { name: 'Ver o PRO' }));
    expect(nav.replace).toHaveBeenCalledWith('/plan');
  });

  it('o "voltar" do navegador fecha o menu', async () => {
    await openDrawer();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      fireEvent(window, new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});
