import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AiMenuProvider, AiMenuStage, useAiMenu } from '../ai-menu';
import { takeFirstMessage } from '@/components/chat/drawer-message';

/**
 * O menu do botão da IA, "O que vamos registrar?" (prancha `Al-H6c5` e
 * variações `Al-H6c6` Free, `Al-H6c7` teclado e `Al-H6c9` retomar). Não é
 * folha: a tela atual encolhe até um notch no topo e o menu aparece atrás.
 */

const nav = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
}));

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
    nutritionApi: { ...actual.nutritionApi, myFoods: vi.fn() },
  };
});

import {
  getChatAvailability,
  listConversations,
  nutritionApi,
  workoutApi,
} from '@fatia/api-client';

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
  const { open } = useAiMenu();
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
      <AiMenuProvider>
        <AiMenuStage>
          <p>Tela atual</p>
        </AiMenuStage>
        <Trigger />
      </AiMenuProvider>
    </QueryClientProvider>,
  );
  await user.click(screen.getByRole('button', { name: 'Abrir a IA' }));
  const menu = await screen.findByRole('dialog', { name: 'O que vamos registrar?' });
  await waitFor(() => expect(front()).toHaveAttribute('data-state', 'open'));
  return { user, menu };
}

const front = () => screen.getByTestId('ai-menu-front');
const notch = () => screen.getAllByRole('button', { name: 'Voltar para o Hoje' })[0]!;

describe('menu da IA', () => {
  beforeEach(() => {
    // A prancha é de 390 × 844.
    Object.assign(window, { innerWidth: 390, innerHeight: 844 });
    vi.mocked(nutritionApi.myFoods).mockResolvedValue({ favorites: [], recent: [] });
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
    const manual = within(menu)
      .getByRole('heading', { name: 'Registrar manual' })
      .closest('section')!;
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
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Abrir a IA' }));
    await user.click(await screen.findByRole('button', { name: 'Refeição' }));
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

  it('no Free: o cartão "Registre falando ou por foto" contrasta com o fundo do menu', async () => {
    availability.mockResolvedValue({
      available: true,
      allowed: false,
      reason: 'plan_required',
      photos: false,
      dictation: false,
    });
    const { menu } = await openDrawer();
    const lead = await within(menu).findByText('Registre falando ou por foto');
    const card = lead.closest('.rounded-card');
    // O menu é `bg-sunken` (#0c0c0c); o cartão sobe para `card`, que se destaca
    // nele nos dois temas (teste de tokens do @fatia/design).
    expect(menu).toHaveClass('bg-sunken');
    expect(card).toHaveClass('bg-card');
    expect(within(menu).getByRole('button', { name: 'Ver o PRO' })).toBeVisible();
    expect(within(menu).getByRole('link', { name: 'Minha IA (MCP)' })).toBeVisible();
  });

  it('o "voltar" do navegador fecha o menu', async () => {
    await openDrawer();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    act(() => {
      fireEvent(window, new PopStateEvent('popstate'));
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('abrir encolhe a tela atual até o notch da prancha, e ela sai do alcance', async () => {
    await openDrawer();
    const f = front();
    expect(f).toHaveStyle({ top: '8px', left: '36px', width: '318px', height: '160px' });
    expect(f).toHaveStyle({ borderRadius: '32px' });
    expect(f.firstElementChild).toHaveStyle({
      transform: 'translateY(-30px) scale(0.815)',
      transformOrigin: '50% 0',
      width: '390px',
    });
    expect(f).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Tela atual').closest('[aria-hidden="true"]')).toBe(f);
    expect(f).toHaveAttribute('inert');
    // O voltar do cabeçalho e o notch inteiro dizem para onde voltam.
    expect(screen.getAllByRole('button', { name: 'Voltar para o Hoje' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Conversas' })).toBeVisible();
  });

  it('tocar no notch volta para a tela, que ocupa a janela de novo', async () => {
    const { user } = await openDrawer();
    await user.click(notch());
    expect(front()).toHaveAttribute('data-state', 'closed');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(front()).not.toHaveAttribute('aria-hidden');
    expect(front().style.position).toBe('');
    expect(screen.getByText('Tela atual')).toBeVisible();
  });

  it('o voltar do cabeçalho e o Esc fecham', async () => {
    const { user, menu } = await openDrawer();
    await user.click(within(menu).getByRole('button', { name: 'Voltar para o Hoje' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await user.click(screen.getByRole('button', { name: 'Abrir a IA' }));
    await screen.findByRole('dialog');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('arrastar o notch para baixo fecha', async () => {
    await openDrawer();
    fireEvent.pointerDown(notch(), { clientY: 100 });
    fireEvent.pointerMove(notch(), { clientY: 170 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('com o teclado o notch baixa para 112 e o título sobe para a linha do voltar', async () => {
    const { user, menu } = await openDrawer();
    await user.click(await within(menu).findByRole('textbox'));
    await waitFor(() => expect(front()).toHaveStyle({ height: '112px' }));
    const title = within(menu).getByRole('heading', { name: 'O que vamos registrar?' });
    expect(title.parentElement).toHaveStyle({ top: '136px' });
    expect(title.parentElement).toContainElement(
      within(menu).getByRole('button', { name: 'Conversas' }),
    );
    // Tocar no vazio esconde o teclado.
    fireEvent.mouseDown(within(menu).getByRole('button', { name: 'Esconder teclado' }));
    await waitFor(() => expect(front()).toHaveStyle({ height: '160px' }));
  });

  it('com conversa pendente o campo abre conversa nova (Al-H6c9)', async () => {
    const { menu } = await openDrawer();
    const campo = await within(menu).findByRole('textbox');
    await waitFor(() => expect(campo).toHaveAttribute('placeholder', 'Nova conversa…'));
  });

  it('o completar traz o que a pessoa já registrou', async () => {
    const { user, menu } = await openDrawer();
    const campo = await within(menu).findByRole('textbox');
    await user.type(campo, 'Regis');
    expect(await within(menu).findByRole('button', { name: 'Registro do almoço' })).toBeVisible();
  });
});
