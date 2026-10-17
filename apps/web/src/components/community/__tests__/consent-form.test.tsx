import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ConsentForm } from '../consent-form';

const EQUIPE = [
  { name: 'Ana', role: 'OWNER' as const },
  { name: 'Bruno', role: 'PROFESSIONAL' as const },
];

describe('ConsentForm', () => {
  it('nada vem marcado, e recusar tudo ainda envia', async () => {
    const onSubmit = vi.fn();
    render(<ConsentForm team={EQUIPE} submitLabel="Entrar" onSubmit={onSubmit} />);

    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
    expect(screen.getByText(/Quem vê: Ana \(dono\) e Bruno \(profissional\)/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(onSubmit).toHaveBeenCalledWith({ scopes: [], statsOptIn: false });
  });

  it('envia as categorias marcadas na ordem canônica e o opt-in à parte', async () => {
    const onSubmit = vi.fn();
    render(<ConsentForm team={EQUIPE} submitLabel="Entrar" onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /Água e passos/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /Alimentação/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /estatísticas da comunidade/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(onSubmit).toHaveBeenCalledWith({ scopes: ['NUTRITION', 'HABITS'], statsOptIn: true });
  });

  it('parte do que a pessoa já escolheu e mostra o erro', () => {
    render(
      <ConsentForm
        initial={{ scopes: ['GOALS'], statsOptIn: true }}
        team={EQUIPE}
        submitLabel="Salvar"
        error="Algo falhou"
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /Metas/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Treino/ })).not.toBeChecked();
    expect(screen.getByRole('alert')).toHaveTextContent('Algo falhou');
  });
});
