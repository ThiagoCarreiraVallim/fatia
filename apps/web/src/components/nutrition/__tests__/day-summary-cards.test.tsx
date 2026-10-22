import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DayTotals, UserGoals } from '@fatia/api-client';
import { CaloriesRingCard } from '../calories-ring-card';
import { MacroBentoGrid } from '../macro-bento-grid';

const totals = { kcal: 1500.4, proteinG: 90, carbsG: 150, fatG: 40 } as DayTotals;
const goals = {
  kcalMin: 1800,
  kcalMax: 2200,
  proteinMinG: 100,
  proteinMaxG: 140,
  carbsMinG: 180,
  carbsMaxG: 250,
  fatMinG: 50,
  fatMaxG: 80,
} as UserGoals;

// O anel e as barras são desenho; o app os lê com número e meta, e o web
// deixava o leitor de tela só com os números soltos.
describe('cards do resumo do dia', () => {
  it('o anel diz quanto foi consumido de quanto', () => {
    render(<CaloriesRingCard totals={totals} goals={goals} />);

    const ring = screen.getByRole('progressbar', { name: '1500 de 2000 kcal consumidas' });
    expect(ring).toHaveAttribute('aria-valuenow', '1500');
    expect(ring).toHaveAttribute('aria-valuemax', '2000');
  });

  it('sem metas, o anel diz só o consumido', () => {
    render(<CaloriesRingCard totals={totals} goals={null} />);

    expect(screen.getByRole('progressbar', { name: '1500 kcal consumidas' })).toBeInTheDocument();
  });

  it('cada macro lê gramas, meta e porcentagem', () => {
    render(<MacroBentoGrid totals={totals} goals={goals} />);

    expect(screen.getByRole('progressbar', { name: 'Proteína' })).toHaveAttribute(
      'aria-valuetext',
      '90 gramas de 120, 75%',
    );
    expect(screen.getByRole('progressbar', { name: 'Gordura' })).toHaveAttribute(
      'aria-valuenow',
      '62',
    );
  });
});
