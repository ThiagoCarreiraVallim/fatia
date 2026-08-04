import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
 * O item do painel depende de React Query; quando mostra e quando some é caso de
 * `components/sharing/__tests__/professional-panel-link.test.tsx`. Aqui o dublê
 * rende um link de verdade porque o que este arquivo cobra é a **montagem**: o
 * painel do profissional foi entregue sem porta de entrada nenhuma, e um dublê
 * que rendesse `null` deixaria a remoção do componente do perfil passar verde.
 */
vi.mock('@/components/sharing/professional-panel-link', () => ({
  ProfessionalPanelLink: () => <a href="/students">Meus alunos</a>,
}));

describe('menu do perfil', () => {
  it('leva ao fluxo de conectar a IA, com um nome que descreve o destino', async () => {
    render(await ProfilePage());

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
    render(await ProfilePage());

    expect(screen.getByRole('link', { name: /Meus alunos/ })).toHaveAttribute('href', '/students');
  });

  it('não deixa uma segunda superfície de conexão viva na mesma tela', async () => {
    const { container } = render(await ProfilePage());

    // O perfil tinha um `<details>` "Conectar ao Claude" com o endereço, ao lado do item de menu
    // que levava a OUTRA tela de conexão, com outro texto. Duas superfícies para a mesma coisa é
    // como as instruções divergiram até uma delas mandar colar um endereço inexistente.
    expect(container.querySelectorAll('details')).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: /Conectar/ })).toHaveLength(1);
  });
});
