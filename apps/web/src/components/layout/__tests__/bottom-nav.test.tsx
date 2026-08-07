import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BottomNav } from '../bottom-nav';

/**
 * A troca de navegação da #250: o Chat toma a vaga do Perfil.
 *
 * O caso olha os links renderizados, e não o texto do arquivo — asserção que
 * procura identificador no fonte inteiro casa com a linha de `import` e passa
 * sem provar nada.
 */

const pathname = vi.hoisted(() => ({ atual: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname.atual }));

function hrefs(): string[] {
  return screen.getAllByRole('link').map((a) => a.getAttribute('href') ?? '');
}

describe('BottomNav', () => {
  it('leva ao chat e não ao perfil', () => {
    pathname.atual = '/';
    render(<BottomNav />);
    expect(screen.getByRole('link', { name: 'Chat' })).toHaveAttribute('href', '/chat');
    expect(screen.queryByRole('link', { name: 'Perfil' })).not.toBeInTheDocument();
    expect(hrefs()).not.toContain('/profile');
  });

  it('continua com cinco abas — a vaga foi trocada, não somada', () => {
    pathname.atual = '/';
    render(<BottomNav />);
    expect(hrefs()).toEqual(['/progress', '/nutrition', '/', '/workout', '/chat']);
  });

  it('marca o chat como ativo quando é a rota atual', () => {
    pathname.atual = '/chat';
    render(<BottomNav />);
    const rotulo = screen.getByText('Chat');
    expect(rotulo).toHaveClass('text-primary');
    expect(screen.getByText('Dashboard')).toHaveClass('text-muted-foreground');
  });
});
