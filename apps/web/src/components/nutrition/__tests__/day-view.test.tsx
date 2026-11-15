import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DayNutrient, Meal } from '@fatia/api-client';
import { DayNutrientsCard } from '../day-nutrients-card';
import { DayMealSources } from '../day-meal-sources';

const nutrients: DayNutrient[] = [
  {
    key: 'kcal',
    label: 'Calorias',
    unit: 'kcal',
    value: 1500,
    min: 1800,
    max: 2200,
    status: 'under',
  },
  {
    key: 'protein_g',
    label: 'Proteína',
    unit: 'g',
    value: 90,
    min: 100,
    max: 140,
    status: 'under',
  },
  {
    key: 'carbs_g',
    label: 'Carboidratos',
    unit: 'g',
    value: 0,
    min: null,
    max: null,
    status: 'none',
  },
  { key: 'fat_g', label: 'Gorduras', unit: 'g', value: 40, min: null, max: 70, status: 'ok' },
  {
    key: 'sodium_mg',
    label: 'Sódio',
    unit: 'mg',
    value: 2400,
    min: null,
    max: 2000,
    status: 'over',
  },
];

const meals: Meal[] = [
  {
    id: 'lunch-1',
    userId: 'u',
    mealType: 'LUNCH',
    eatenAt: '2026-11-15T15:41:00Z',
    notes: null,
    hasPhoto: true,
    origin: 'AI',
    items: [
      {
        id: 'i1',
        mealId: 'lunch-1',
        foodId: 1,
        foodName: 'Arroz branco',
        groupId: null,
        grams: 100,
        kcal: 500,
        proteinG: 10,
        carbsG: 80,
        fatG: 5,
        source: 'AI',
      },
    ],
  },
  {
    id: 'snack-1',
    userId: 'u',
    mealType: 'SNACK',
    eatenAt: '2026-11-15T19:00:00Z',
    notes: null,
    hasPhoto: false,
    origin: 'AI',
    items: [
      {
        id: 'i2',
        mealId: 'snack-1',
        foodId: 2,
        foodName: 'Banana',
        groupId: null,
        grams: 100,
        kcal: 1000,
        proteinG: 1,
        carbsG: 23,
        fatG: 0,
        source: 'AI',
      },
    ],
  },
];

describe('DayNutrientsCard (Al-N1)', () => {
  it('em "Todos" mostra cada nutriente com a faixa, e o toque escolhe um', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<DayNutrientsCard nutrients={nutrients} selected={null} onSelect={onSelect} />);

    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('1.800–2.200 kcal')).toBeInTheDocument();
    expect(screen.getByText('até 2.000 mg')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Sódio, 2\.400 mg/ }));
    expect(onSelect).toHaveBeenCalledWith('sodium_mg');
  });

  it('um nutriente escolhido diz o estado em texto, não só na cor', () => {
    render(<DayNutrientsCard nutrients={nutrients} selected="sodium_mg" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Sódio' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('passou 400 mg')).toBeInTheDocument();
    expect(screen.getByText('até 2.000 mg')).toBeInTheDocument();
  });
});

describe('DayMealSources (De onde veio)', () => {
  it('cada refeição leva à tela dela, com foto ou IA marcadas e o % do dia', () => {
    render(
      <DayMealSources
        meals={meals}
        nutrient={nutrients[0]}
        date="2026-11-15"
        onAddMeal={vi.fn()}
      />,
    );

    const lunch = screen.getByRole('link', { name: /Almoço/ });
    expect(lunch).toHaveAttribute('href', '/nutrition/meals/lunch-1?date=2026-11-15');
    expect(within(lunch).getByLabelText('com foto')).toBeInTheDocument();
    expect(within(lunch).getByText('33%')).toBeInTheDocument();

    const snack = screen.getByRole('link', { name: /Lanche/ });
    expect(
      within(snack).getByLabelText('reconhecida pela IA, foto não guardada'),
    ).toBeInTheDocument();
    expect(within(snack).queryByLabelText('com foto')).not.toBeInTheDocument();
  });

  it('o vazio do tipo e o botão do fim abrem o registro', async () => {
    const onAddMeal = vi.fn();
    const user = userEvent.setup();
    render(
      <DayMealSources
        meals={meals}
        nutrient={nutrients[0]}
        date="2026-11-15"
        onAddMeal={onAddMeal}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Registrar Jantar' }));
    expect(onAddMeal).toHaveBeenCalledWith('DINNER');

    await user.click(screen.getByRole('button', { name: 'Adicionar lanche ou refeição' }));
    expect(onAddMeal).toHaveBeenCalledTimes(2);
  });
});
