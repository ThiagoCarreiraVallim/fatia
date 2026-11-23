import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, WelcomeEditorState } from '@fatia/api-client';

const ctx = vi.hoisted(() => ({
  group: { id: 'g1', name: 'Academia Demo', role: 'OWNER', avatarUrl: null },
}));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group as MyGroup }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    welcomeApi: { editor: vi.fn(), save: vi.fn(), pages: vi.fn() },
    groupsApi: {
      ...actual.groupsApi,
      members: vi.fn().mockResolvedValue([
        { membershipId: 'm1', name: 'Bruno Lima', role: 'OWNER', status: 'ACTIVE', joinedAt: null },
        {
          membershipId: 'm2',
          name: 'Helena Prado',
          role: 'PROFESSIONAL',
          status: 'ACTIVE',
          joinedAt: null,
        },
        { membershipId: 'm3', name: 'Carla', role: 'MEMBER', status: 'ACTIVE', joinedAt: null },
      ]),
    },
  };
});

import { toast } from 'sonner';
import { welcomeApi } from '@fatia/api-client';
import OrgWelcomePage from '../page';

const capa = {
  position: 1,
  kind: 'COVER' as const,
  title: 'Bem-vinda à Academia Demo',
  body: 'Treino e companhia desde 2012.',
  showTeam: false,
};
const combinados = {
  position: 2,
  kind: 'PLAIN' as const,
  title: 'Combinados da casa',
  body: '- Traga toalha e garrafa\n- Devolva os pesos no lugar',
  showTeam: false,
};
const estado = (p: Partial<WelcomeEditorState> = {}): WelcomeEditorState => ({
  pages: [],
  publishedAt: null,
  showOnJoin: true,
  ...p,
});

function renderPage(state: WelcomeEditorState) {
  vi.mocked(welcomeApi.editor).mockResolvedValue(state);
  vi.mocked(welcomeApi.save).mockImplementation(async (_g, input) =>
    estado({
      pages: input.pages.map((p, i) => ({ position: i + 1, ...p })),
      publishedAt: input.published ? '2026-11-21T10:00:00Z' : null,
      showOnJoin: input.showOnJoin,
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrgWelcomePage />
    </QueryClientProvider>,
  );
}

describe('/org/[groupId]/welcome (Pn-23)', () => {
  afterEach(() => vi.clearAllMocks());

  it('sem páginas: padrão do Fatia, e "Criar a primeira página" abre o editor', async () => {
    renderPage(estado());
    expect(await screen.findByText('Usando o padrão do Fatia')).toBeInTheDocument();
    expect(screen.getByText('sem páginas próprias')).toBeInTheDocument();
    // O que o aluno vê hoje: a marca e a equipe (sem a aluna).
    expect(screen.getByText('Bruno e Helena')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Criar a primeira página' }));
    const form = screen.getByRole('form', { name: 'Página de boas-vindas' });
    await userEvent.type(within(form).getByLabelText('Título'), 'Combinados da casa');
    await userEvent.type(within(form).getByLabelText('Texto'), '- Traga toalha');
    expect(within(form).getByText('14 de 300')).toBeInTheDocument();
    // O aviso fixo de saúde.
    expect(screen.getByText('Não peça dado de saúde aqui')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar rascunho' }));
    await waitFor(() =>
      expect(welcomeApi.save).toHaveBeenCalledWith('g1', {
        pages: [
          { kind: 'PLAIN', title: 'Combinados da casa', body: '- Traga toalha', showTeam: false },
        ],
        showOnJoin: true,
        published: false,
      }),
    );
  });

  it('"Ver o padrão" mostra as boas-vindas do Fatia', async () => {
    renderPage(estado());
    await userEvent.click(await screen.findByRole('button', { name: 'Ver o padrão' }));
    const d = await screen.findByRole('dialog');
    expect(within(d).getByText('Bem-vinda à Academia Demo')).toBeInTheDocument();
  });

  it('rascunho com 2 páginas: abas, prévia com lista e publicar', async () => {
    renderPage(estado({ pages: [capa, combinados] }));
    expect(await screen.findByText('rascunho')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: '2 · Combinados da casa' }));
    const previa = screen.getByRole('region', { name: 'Prévia no celular' });
    expect(within(previa).getAllByRole('listitem')).toHaveLength(2);
    expect(within(previa).getByText('Traga toalha e garrafa')).toBeInTheDocument();
    expect(within(previa).getByText('2 de 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Publicar' }));
    await waitFor(() =>
      expect(welcomeApi.save).toHaveBeenCalledWith(
        'g1',
        expect.objectContaining({ published: true }),
      ),
    );
    expect(await screen.findByText('publicado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voltar para rascunho' })).toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith('Publicado · aparece para quem entrar a partir de agora');
  });

  it('até 3 páginas: o botão "Página" some na terceira', async () => {
    renderPage(estado({ pages: [capa, combinados] }));
    await userEvent.click(await screen.findByRole('button', { name: 'Página' }));
    expect(screen.getByRole('tab', { name: '3 · Página nova' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Página' })).not.toBeInTheDocument();
  });

  it('texto acima de 300 caracteres não salva e diz o porquê', async () => {
    renderPage(estado({ pages: [combinados] }));
    const form = await screen.findByRole('form', { name: 'Página de boas-vindas' });
    const texto = within(form).getByLabelText('Texto');
    await userEvent.clear(texto);
    await userEvent.click(texto);
    await userEvent.paste('a'.repeat(301));
    expect(within(form).getByText('Texto até 300 caracteres (301)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar rascunho' })).toBeDisabled();
    expect(welcomeApi.save).not.toHaveBeenCalled();
  });

  it('"Mostrar ao entrar" e "Mostrar a equipe" vão no salvar; "Ver como aluno" abre a tela do aluno', async () => {
    renderPage(estado({ pages: [combinados], publishedAt: '2026-11-20T10:00:00Z' }));
    await userEvent.click(
      await screen.findByRole('switch', { name: 'Mostrar ao entrar na comunidade' }),
    );
    await userEvent.click(screen.getByRole('switch', { name: 'Mostrar a equipe nesta página' }));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(welcomeApi.save).toHaveBeenCalledWith('g1', {
        pages: [
          {
            kind: 'PLAIN',
            title: 'Combinados da casa',
            body: combinados.body,
            showTeam: true,
          },
        ],
        showOnJoin: false,
        published: true,
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ver como aluno' }));
    const d = await screen.findByRole('dialog');
    expect(
      within(d).getByRole('region', { name: 'Boas-vindas da Academia Demo' }),
    ).toBeInTheDocument();
    expect(within(d).getByText('Bruno e Helena')).toBeInTheDocument();
  });
});
