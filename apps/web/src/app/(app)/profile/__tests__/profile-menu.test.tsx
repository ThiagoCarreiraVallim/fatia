import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProfilePage from '../page';

/**
 * O item de menu que leva ao fluxo de conexão (issue #164).
 *
 * O destino sempre foi a tela de conectar o Claude, mas o rótulo dizia "Dispositivos — Integração
 * com Apple Health e Garmin", com ícone de relógio. Nenhuma das duas integrações existe (#151), e
 * ninguém procuraria conexão de IA ali. A tela mais importante da issue era, na prática,
 * inalcançável.
 *
 * O caso olha o link renderizado — não o texto do arquivo —, porque o defeito é exatamente a
 * relação entre o rótulo e o destino, e é ela que precisa ser conferida junta.
 */

vi.mock('@/lib/auth-server', () => ({
  getCurrentUser: vi.fn(async () => ({
    id: 'user-1',
    email: 'atleta@exemplo.test',
    name: 'Atleta',
    role: 'USER',
  })),
}));

// Fora do caminho: as métricas do topo dependem de React Query e não participam do menu.
vi.mock('@/components/profile/profile-metrics', () => ({ ProfileMetrics: () => null }));

/**
 * A entrada do painel do profissional entra **sem dublê**: o que este arquivo
 * cobra é a montagem, e o painel foi entregue sem porta de entrada nenhuma —
 * `/students` só abria digitando o endereço. Um dublê tornaria o caso uma
 * conversa do teste com ele mesmo; com o componente real, tirá-lo do perfil dá
 * vermelho aqui. Quando ele aparece e quando some é caso próprio, em
 * `components/sharing/__tests__/professional-panel-link.test.tsx`.
 */
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    professionalApi: {
      listStudents: vi.fn(async () => [
        {
          membershipId: 'mem-a',
          name: 'Ana',
          groupId: 'grp-1',
          groupName: 'Academia',
          joinedAt: null,
          scopesGrantedToMe: [],
        },
      ]),
      readStudent: vi.fn(),
    },
  };
});

/** O perfil monta um client component com React Query — daí o provider. */
async function renderProfile() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>{await ProfilePage()}</QueryClientProvider>,
  );
}

describe('menu do perfil', () => {
  it('leva ao fluxo de conectar a IA, com um nome que descreve o destino', async () => {
    await renderProfile();

    const link = screen.getByRole('link', { name: /Conectar sua IA/ });

    expect(link).toHaveAttribute('href', '/profile/connect');
    expect(link.textContent).toMatch(/Claude/);
    // O rótulo antigo prometia integrações que não existem. Prometer de novo seria pior que o
    // nome errado: manda o usuário esperar por algo que não vai encontrar.
    expect(link.textContent).not.toMatch(/Dispositivos|Apple Health|Garmin/);
  });

  it('o perfil monta a entrada do painel do profissional', async () => {
    // A #157 entregou `/students` sem link em lugar nenhum do web ou do mobile:
    // só chegava quem digitasse o endereço. O caso prende a montagem — tirar o
    // componente do perfil volta a deixar o painel inalcançável, e isso tem de
    // dar vermelho.
    await renderProfile();

    // `findBy` porque o item só existe depois da lista responder: quem não
    // atende ninguém recebe `[]` e não ganha entrada nenhuma.
    expect(await screen.findByRole('link', { name: /Meus alunos/ })).toHaveAttribute(
      'href',
      '/students',
    );
  });

  it('não deixa uma segunda superfície de conexão viva na mesma tela', async () => {
    const { container } = await renderProfile();

    // O perfil tinha um `<details>` "Conectar ao Claude" com o endereço, ao lado do item de menu
    // que levava a OUTRA tela de conexão, com outro texto. Duas superfícies para a mesma coisa é
    // como as instruções divergiram até uma delas mandar colar um endereço inexistente.
    expect(container.querySelectorAll('details')).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: /Conectar/ })).toHaveLength(1);
  });
});
