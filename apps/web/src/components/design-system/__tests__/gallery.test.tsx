import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// O vaul chama `setPointerCapture`, que o jsdom não tem.
vi.mock('@/components/ui/drawer', () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Pass,
    DrawerHeader: Pass,
    DrawerFooter: Pass,
    DrawerClose: Pass,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  };
});

import { DesignSystemGallery } from '../gallery';

/**
 * A galeria é a tela de revisão do ui:snap: tem de cobrir as pranchas
 * Componentes, Componentes-plano, Main e Movimento, não uma amostra.
 */
describe('galeria do design system', () => {
  function renderGallery() {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: (q: string) => ({
        matches: false,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
      }),
    });
    const client = new QueryClient();
    return render(
      <QueryClientProvider client={client}>
        <DesignSystemGallery />
      </QueryClientProvider>,
    );
  }

  it('tem as seções das pranchas', () => {
    renderGallery();
    for (const title of [
      'Cores',
      'Tipografia',
      'Espaço e raios',
      'Seleção',
      'Listas',
      'Navegação',
      'Retorno e folha',
      'PRO',
      'Compartilhar',
      'Gerar com IA',
      'Movimento',
    ]) {
      expect(screen.getByRole('region', { name: title }), title).toBeInTheDocument();
    }
  });

  it('PRO nos 9 estados e as 8 animações com Repetir', () => {
    renderGallery();
    const pro = screen.getByRole('region', { name: 'PRO' });
    expect(within(pro).getAllByRole('listitem')).toHaveLength(9);
    const motion = screen.getByRole('region', { name: 'Movimento' });
    expect(within(motion).getAllByRole('button', { name: 'Repetir' })).toHaveLength(8);
  });

  it('a barra de 5 abas aparece no escuro e no claro', () => {
    renderGallery();
    expect(screen.getAllByRole('navigation', { name: 'Barra de abas (exemplo)' })).toHaveLength(2);
  });
});
