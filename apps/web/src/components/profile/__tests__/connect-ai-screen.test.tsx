import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { McpConnectionsOverview, MeUser } from '@fatia/api-client';

const api = vi.hoisted(() => ({
  me: vi.fn(),
  overview: vi.fn(),
  exportMyData: vi.fn(),
  openAi: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('sonner', () => ({ toast: api.toast }));
vi.mock('@/components/layout/ai-menu', () => ({
  useAiMenu: () => ({ isOpen: false, open: api.openAi, close: vi.fn() }),
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    usersApi: { ...actual.usersApi, me: api.me, exportMyData: api.exportMyData },
    mcpConnectionsApi: { overview: api.overview },
  };
});

import { ConnectAiScreen } from '../connect-ai-screen';

const SERVER = 'https://api.exemplo.test/mcp';
const ME = { id: 'u1', email: 'ana@email.com', name: 'Ana' } as MeUser;
const overview = (connections: McpConnectionsOverview['connections'] = []) => ({
  serverUrl: SERVER,
  connections,
});

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ConnectAiScreen />
    </QueryClientProvider>,
  );
}

const writeText = vi.fn();

/**
 * O user-event instala o próprio `navigator.clipboard` no `setup()`: a área de
 * transferência falsa entra depois dele, senão o teste exercita a do user-event.
 */
function setupUser() {
  const user = userEvent.setup();
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  return user;
}

beforeEach(() => {
  api.me.mockResolvedValue(ME);
  api.overview.mockResolvedValue(overview());
  writeText.mockReset().mockResolvedValue(undefined);
});

afterEach(() => vi.clearAllMocks());

describe('Conectar sua IA (Al-V6)', () => {
  it('mostra o selo grátis, a pergunta e as três IAs, começando no Claude', async () => {
    renderScreen();

    expect(screen.getByText('grátis')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Registre e consulte conversando com a sua IA' }),
    ).toBeInTheDocument();
    const group = screen.getByRole('radiogroup', { name: 'Qual IA você usa?' });
    expect(
      within(group)
        .getAllByRole('radio')
        .map((r) => r.textContent),
    ).toEqual(['Claude', 'ChatGPT', 'Outro app']);
    expect(await screen.findByText('Abra Settings → Connectors')).toBeInTheDocument();
  });

  it('cada passo abre e fecha; trocar de IA troca os passos', async () => {
    const user = setupUser();
    renderScreen();

    await user.click(screen.getByRole('radio', { name: 'ChatGPT' }));
    expect(screen.getByText('Ative o modo desenvolvedor')).toBeInTheDocument();
    // O primeiro passo vem aberto, os outros só com o título.
    expect(screen.getByText('No ChatGPT, na web.')).toBeInTheDocument();
    expect(screen.queryByText('Em Avançado. Só precisa fazer uma vez.')).not.toBeInTheDocument();

    const passo2 = screen.getByRole('button', { name: /Ative o modo desenvolvedor/ });
    await user.click(passo2);
    expect(passo2).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Em Avançado. Só precisa fazer uma vez.')).toBeInTheDocument();
    expect(screen.queryByText('No ChatGPT, na web.')).not.toBeInTheDocument();
  });

  it('o endereço vem da API; copiar avisa "Copiado" e abre o passo de autorizar com o e-mail', async () => {
    const user = setupUser();
    renderScreen();

    expect(await screen.findByText(SERVER)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar endereço' }));

    expect(writeText).toHaveBeenCalledWith(SERVER);
    expect(await screen.findByRole('button', { name: 'Endereço copiado' })).toHaveTextContent(
      'Copiado',
    );
    expect(screen.getByText('Com o mesmo e-mail desta conta: ana@email.com.')).toBeInTheDocument();
  });

  it('sem permissão de copiar, diz para copiar à mão', async () => {
    writeText.mockRejectedValue(new Error('negado'));
    const user = setupUser();
    renderScreen();

    await screen.findByText(SERVER);
    await user.click(screen.getByRole('button', { name: 'Copiar endereço' }));

    expect(await screen.findByText(/não deixou copiar/)).toBeInTheDocument();
  });

  it('o teste guiado tem a pergunta e o que esperar', async () => {
    renderScreen();
    expect(screen.getByText('Teste: “Qual é meu resumo de hoje?”')).toBeInTheDocument();
    expect(
      screen.getByText('Se ele responder com seus números, está conectado.'),
    ).toBeInTheDocument();
  });

  it('"Não funcionou?" mostra as três verificações e leva ao tutorial da Ajuda (Al-V6d)', async () => {
    const user = setupUser();
    renderScreen();
    await screen.findByText(SERVER);

    await user.click(screen.getByRole('radio', { name: 'ChatGPT' }));
    await user.click(screen.getByRole('button', { name: 'Não funcionou?' }));

    const card = screen.getByRole('region', { name: 'Não funcionou' });
    expect(within(card).getByText(`Confira se o link está inteiro: ${SERVER}`)).toBeInTheDocument();
    expect(
      within(card).getByText('Entre com o mesmo e-mail desta conta: ana@email.com'),
    ).toBeInTheDocument();
    expect(
      within(card).getByText('No ChatGPT, ative o conector na conversa antes de perguntar'),
    ).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: /Ver o tutorial/ })).toHaveAttribute(
      'href',
      '/you/help?tutorial=conectar-sua-ia',
    );
    // O teste sai do lugar: a prancha troca um pelo outro.
    expect(screen.queryByText('Teste: “Qual é meu resumo de hoje?”')).not.toBeInTheDocument();
  });

  it('app sem MCP: usar a IA do Fatia ou exportar os dados (Al-V6e)', async () => {
    api.exportMyData.mockResolvedValue({ url: 'https://x.test/e', expiresAt: '' });
    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    const user = setupUser();
    renderScreen();
    await screen.findByText(SERVER);

    await user.click(screen.getByRole('button', { name: 'Não funcionou?' }));
    await user.click(screen.getByRole('button', { name: 'Meu app não aceita MCP' }));

    const card = screen.getByRole('region', { name: 'Este app não aceita MCP' });
    await user.click(within(card).getByRole('button', { name: 'Usar a IA do Fatia' }));
    expect(api.openAi).toHaveBeenCalled();
    await user.click(within(card).getByRole('button', { name: 'Exportar dados' }));
    await waitFor(() => expect(api.exportMyData).toHaveBeenCalled());
    vi.unstubAllGlobals();
  });

  it('conectado (Al-V6c): abre na IA da conexão, com último acesso e sem prometer desconectar aqui', async () => {
    api.overview.mockResolvedValue(
      overview([
        {
          id: 'c1',
          clientName: 'ChatGPT',
          connectedAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        },
      ]),
    );
    renderScreen();

    const card = await screen.findByRole('region', { name: 'Conectado ao ChatGPT' });
    expect(screen.getByRole('radio', { name: 'ChatGPT' })).toHaveAttribute('aria-checked', 'true');
    expect(
      within(card).getByText(
        'Último acesso agora · para desconectar, remova o conector no app da sua IA.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Configurações da IA/)).not.toBeInTheDocument();
  });

  it('a conexão de outra IA não marca esta como conectada', async () => {
    api.overview.mockResolvedValue(
      overview([
        {
          id: 'c1',
          clientName: 'Claude',
          connectedAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        },
      ]),
    );
    const user = setupUser();
    renderScreen();
    await screen.findByRole('region', { name: 'Conectado ao Claude' });

    await user.click(screen.getByRole('radio', { name: 'ChatGPT' }));

    expect(screen.queryByRole('region', { name: /Conectado/ })).not.toBeInTheDocument();
    expect(screen.getByText('Teste: “Qual é meu resumo de hoje?”')).toBeInTheDocument();
  });

  it('avisa da privacidade e não usa jargão de login', async () => {
    const { container } = renderScreen();
    await screen.findByText(SERVER);

    expect(screen.getByText(/política de privacidade do app dela/)).toBeInTheDocument();
    for (const jargon of [/\bOAuth\b/i, /\bDCR\b/i, /\bLogto\b/i, /\bBearer\b/i]) {
      expect(container.textContent).not.toMatch(jargon);
    }
  });
});
