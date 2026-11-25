import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AiSettings, ChatMemory } from '@fatia/api-client';

const settings: AiSettings = {
  modes: { DAY_LOG: 'ASK', WORKOUT: 'AUTO', GOALS: 'OFF', MEMORIES: 'ASK' },
  webSearchEnabled: false,
  memories: { count: 2, limit: 50 },
};
const memorias: ChatMemory[] = [
  {
    id: 'm1',
    content: 'Não come carne',
    category: 'PREFERENCE',
    createdAt: '2026-10-12T15:00:00Z',
  },
  { id: 'm2', content: 'Treina às 6h', category: 'ROUTINE', createdAt: '2026-10-13T15:00:00Z' },
];
const api = vi.hoisted(() => ({
  getAiSettings: vi.fn(),
  setAiWriteMode: vi.fn(),
  setWebSearchEnabled: vi.fn(),
  listChatMemories: vi.fn(),
  forgetAllChatMemories: vi.fn(),
  getAiConsent: vi.fn(),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, ...api };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { AiSettingsDrawer } = await import('../config-da-ia');
const { MemoriesDrawer } = await import('../memorias');

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  api.getAiSettings.mockResolvedValue(settings);
  api.setAiWriteMode.mockImplementation(async (c: string, m: string) => ({
    ...settings.modes,
    [c]: m,
  }));
  api.setWebSearchEnabled.mockResolvedValue({});
  api.listChatMemories.mockResolvedValue(memorias);
  api.forgetAllChatMemories.mockResolvedValue({ forgotten: 2 });
  api.getAiConsent.mockResolvedValue({
    chat: { accepted: true },
    webSearch: { accepted: false },
    webSearchEnabled: false,
  });
});

function comCliente(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('Config da IA (Al-M24)', () => {
  it('mostra o modo de cada categoria e o toque gira para o próximo', async () => {
    comCliente(<AiSettingsDrawer open onOpenChange={() => {}} />);

    const registros = await screen.findByRole('button', { name: /Registros do dia/ });
    expect(registros).toHaveTextContent('Perguntar antes');
    expect(screen.getByRole('button', { name: /Treino/ })).toHaveTextContent('Automático');
    expect(screen.getByRole('button', { name: /Metas/ })).toHaveTextContent('Desligado');

    await userEvent.click(registros);
    await waitFor(() => expect(api.setAiWriteMode).toHaveBeenCalledWith('DAY_LOG', 'AUTO'));
    await waitFor(() => expect(registros).toHaveTextContent('Automático'));
  });

  it('o que nunca é automático, e a busca na web pela mesma preferência do chat', async () => {
    comCliente(<AiSettingsDrawer open onOpenChange={() => {}} />);

    const nunca = await screen.findByRole('list', { name: 'Nunca é automático' });
    expect(
      within(nunca)
        .getAllByRole('listitem')
        .map((i) => i.textContent),
    ).toEqual([
      'Apagar qualquer registro',
      'Cobrança e assinatura',
      'Compartilhar com a equipe',
      'Publicar no mural',
    ]);

    await userEvent.click(screen.getByRole('switch', { name: /Busca na web/ }));
    await waitFor(() => expect(api.setWebSearchEnabled).toHaveBeenCalledWith(true));
  });
});

describe('O que a IA lembra (Al-M9)', () => {
  it('categoria e data, o "n de 50", o aviso da equipe e o Apagar todas com confirmação', async () => {
    comCliente(<MemoriesDrawer open onOpenChange={() => {}} />);

    expect(await screen.findByText('Não come carne')).toBeInTheDocument();
    expect(screen.getByText(/preferência · 12 out/)).toBeInTheDocument();
    expect(screen.getByText('2 de 50')).toBeInTheDocument();
    expect(
      screen.getByText('Só você vê. A equipe da academia não tem acesso.'),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Apagar todas' }));
    expect(api.forgetAllChatMemories).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar: apagar todas' }));
    await waitFor(() => expect(api.forgetAllChatMemories).toHaveBeenCalled());
  });
});
