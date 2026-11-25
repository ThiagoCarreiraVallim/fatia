import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ChatConversationSummary } from '@fatia/api-client';

const agora = new Date();
const diasAtras = (n: number) => new Date(agora.getTime() - n * 86_400_000).toISOString();
const conversas: ChatConversationSummary[] = [
  {
    id: 'a',
    title: 'Proteína do almoço',
    preview: 'Você comeu 57 g de proteína no almoço.',
    updatedAt: agora.toISOString(),
  } as ChatConversationSummary,
  {
    id: 'b',
    title: 'Treino de perna',
    preview: null,
    updatedAt: diasAtras(3),
  } as ChatConversationSummary,
  {
    id: 'c',
    title: 'Meta de peso',
    preview: 'Faltam 2 kg.',
    updatedAt: diasAtras(20),
  } as ChatConversationSummary,
];

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return { ...actual, listConversations: vi.fn(async () => conversas) };
});
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { ConversationsDrawer } = await import('../conversas');

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

describe('ConversationsDrawer (#384)', () => {
  it('agrupa em Hoje, Esta semana e Antes, com a última fala embaixo do nome', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ConversationsDrawer aberta={undefined} />
      </QueryClientProvider>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Conversas' }));
    const lista = await screen.findByRole('navigation', { name: 'Lista de conversas' });
    const grupos = await within(lista).findAllByRole('heading', { level: 3 });
    expect(grupos.map((g) => g.textContent)).toEqual(['Hoje', 'Esta semana', 'Antes']);
    expect(within(lista).getByText('Você comeu 57 g de proteína no almoço.')).toBeInTheDocument();
    expect(within(lista).getByText('Faltam 2 kg.')).toBeInTheDocument();
  });
});
