import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useCallback } from 'react';
import {
  AppTopBar,
  TopBarActions,
  TopBarProvider,
  useTopBarBack,
  useTopBarTitle,
} from '../app-top-bar';

/**
 * A barra de topo estilo iOS: voltar sobe pelo mapa de rotas (não pelo
 * histórico), o título é o da tela, e a tela pode trocar o título, pôr ações e
 * interceptar o voltar.
 */

const pathname = vi.hoisted(() => ({ atual: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.atual }));

function montar(tela: React.ReactNode = null) {
  return render(
    <TopBarProvider>
      <AppTopBar />
      {tela}
    </TopBarProvider>,
  );
}

describe('AppTopBar', () => {
  it('não aparece no Início, que é a raiz', () => {
    pathname.atual = '/';
    montar();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Voltar/ })).not.toBeInTheDocument();
  });

  it('numa rota funda aberta direto, voltar leva ao pai do mapa', () => {
    pathname.atual = '/workout/plans/abc';
    montar();
    expect(screen.getByRole('heading', { level: 1, name: 'Plano de treino' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para Planos de treino' })).toHaveAttribute(
      'href',
      '/workout/plans',
    );
  });

  it('a tela troca o título genérico pelo nome real', () => {
    pathname.atual = '/workout/plans/abc';
    function Tela() {
      useTopBarTitle('Treino A');
      return null;
    }
    montar(<Tela />);
    expect(screen.getByRole('heading', { level: 1, name: 'Treino A' })).toBeInTheDocument();
  });

  it('as ações da tela aparecem na barra', () => {
    pathname.atual = '/nutrition';
    montar(
      <TopBarActions>
        <button type="button">Copiar dia</button>
      </TopBarActions>,
    );
    const barra = screen.getByRole('banner');
    expect(barra).toContainElement(screen.getByRole('button', { name: 'Copiar dia' }));
  });

  it('a tela pode interceptar o voltar (treino em andamento confirma)', async () => {
    pathname.atual = '/workout/session/s1';
    const confirmar = vi.fn();
    function Tela() {
      const onBack = useCallback(() => confirmar(), []);
      useTopBarBack(onBack);
      return null;
    }
    montar(<Tela />);
    await userEvent
      .setup()
      .click(screen.getByRole('link', { name: 'Voltar para Histórico de treino' }));
    expect(confirmar).toHaveBeenCalledTimes(1);
  });
});
