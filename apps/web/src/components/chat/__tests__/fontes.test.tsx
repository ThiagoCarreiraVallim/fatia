import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Artefato, ehLinkDaWeb } from '../artefato';

/** O cartão de fontes da busca na web: cada fonte é um link, e só link da web. */
describe('cartão de fontes', () => {
  it('cada fonte vira link que abre fora, com o domínio embaixo', () => {
    render(
      <Artefato
        artefato={{
          toolCallId: 'c1',
          kind: 'sources',
          label: 'Fontes',
          sources: [
            { title: 'Creatina', url: 'https://exemplo.com.br/creatina', domain: 'exemplo.com.br' },
          ],
        }}
      />,
    );

    const link = screen.getByRole('link', { name: 'Creatina' });
    expect(link).toHaveAttribute('href', 'https://exemplo.com.br/creatina');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('exemplo.com.br')).toBeInTheDocument();
  });

  it('URL que não é da web não vira link', () => {
    render(
      <Artefato
        artefato={{
          toolCallId: 'c1',
          kind: 'sources',
          sources: [{ title: 'Armadilha', url: 'javascript:alert(1)', domain: 'x' }],
        }}
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(ehLinkDaWeb('javascript:alert(1)')).toBe(false);
    expect(ehLinkDaWeb('HTTPS://ok.com')).toBe(true);
  });
});
