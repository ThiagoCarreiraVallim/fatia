import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { withQuote } from '@fatia/api-client';
import { FalaComCitacao } from '../citacao';

/** A pergunta que cita um trecho: a citação aparece à parte, e não como `> ` cru. */
describe('fala com citação', () => {
  it('desenha o trecho citado como citação, separado da pergunta', () => {
    render(<FalaComCitacao text={withQuote('Frango: 31 g de proteína', 'e o feijão?')} />);

    const citacao = screen.getByRole('blockquote');
    expect(citacao).toHaveTextContent('Frango: 31 g de proteína');
    expect(citacao.textContent).not.toContain('>');
    expect(screen.getByText('e o feijão?')).toBeInTheDocument();
  });

  it('fala sem citação fica como está', () => {
    const { container } = render(<FalaComCitacao text="bom dia" />);
    expect(container.querySelector('blockquote')).toBeNull();
    expect(container).toHaveTextContent('bom dia');
  });
});
