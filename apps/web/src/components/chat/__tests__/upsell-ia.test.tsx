import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpsellIA } from '../upsell-ia';

/** O chat para quem está no Free (prancha Al-M1, #386). */
describe('UpsellIA', () => {
  it('mostra um jeito de cada vez, o Free e os três caminhos', async () => {
    const user = userEvent.setup();
    render(<UpsellIA />);

    expect(screen.getByRole('heading', { name: 'Fotografe o prato' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Conversa' }));
    expect(screen.getByRole('heading', { name: 'Fale com a IA' })).toBeInTheDocument();
    expect(screen.getByText('Registro manual segue grátis')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver o PRO' })).toHaveAttribute(
      'href',
      '/plan?recurso=chat',
    );
    expect(screen.getByRole('link', { name: 'Usar minha IA pelo MCP' })).toHaveAttribute(
      'href',
      '/profile/connect',
    );
    expect(screen.getByRole('link', { name: 'Agora não' })).toHaveAttribute('href', '/');
  });
});
