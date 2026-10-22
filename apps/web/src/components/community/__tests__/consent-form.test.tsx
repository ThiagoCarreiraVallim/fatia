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

describe('ConsentForm editando', () => {
  it('não repete o título da tela e não diz que nada vem marcado', () => {
    render(
      <ConsentForm
        initial={{ scopes: ['GOALS'], statsOptIn: false }}
        team={EQUIPE}
        submitLabel="Salvar"
        editing
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText('O que a equipe pode ver de você')).toHaveClass('sr-only');
    expect(screen.queryByText(/Nada vem marcado/)).not.toBeInTheDocument();
    expect(screen.getByText(/Desmarcar tira o acesso/)).toBeInTheDocument();
  });
});

describe('ConsentForm com escopos obrigatórios', () => {
  it('entrando: o obrigatório vem marcado, travado e dito, e vai junto no envio', async () => {
    const onSubmit = vi.fn();
    render(
      <ConsentForm
        team={EQUIPE}
        submitLabel="Entrar"
        required={['GOALS', 'WORKOUT']}
        onSubmit={onSubmit}
      />,
    );
    const treino = screen.getByRole('checkbox', { name: /Treino/ });
    expect(treino).toBeChecked();
    expect(treino).toBeDisabled();
    // O aviso chega ao leitor de tela pela descrição, não só pela cor.
    expect(treino).toHaveAccessibleDescription('Obrigatório nesta comunidade');
    expect(screen.getByRole('checkbox', { name: /Metas/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /Alimentação/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Alimentação/ })).toBeEnabled();
    expect(screen.queryByText(/Nada vem marcado/)).not.toBeInTheDocument();

    await userEvent.click(treino);
    expect(treino).toBeChecked();
    await userEvent.click(screen.getByRole('checkbox', { name: /Alimentação/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(onSubmit).toHaveBeenCalledWith({
      scopes: ['WORKOUT', 'NUTRITION', 'GOALS'],
      statsOptIn: false,
    });
  });

  it('editando: só trava o obrigatório que a pessoa já compartilha', () => {
    render(
      <ConsentForm
        initial={{ scopes: ['WORKOUT'], statsOptIn: false }}
        team={EQUIPE}
        submitLabel="Salvar"
        editing
        required={['WORKOUT', 'GOALS']}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: /Treino/ })).toBeDisabled();
    // Quem entrou antes de Metas virar obrigatório não passa a dever Metas.
    const metas = screen.getByRole('checkbox', { name: /Metas/ });
    expect(metas).not.toBeChecked();
    expect(metas).toBeEnabled();
    expect(screen.getByText(/é preciso sair da comunidade/)).toBeInTheDocument();
  });
});
