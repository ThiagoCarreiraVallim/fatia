import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import type { WorkoutPlanExercise } from '@fatia/api-client';
import { PlanExerciseSheet } from '../plan-exercise-sheet';

/** Configurar exercício: A (padrão), B (série por série) e D (cardio) — #378. */

vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});

const item = (over: Partial<WorkoutPlanExercise> = {}, muscleGroup = 'ombro') =>
  ({
    id: 'pe1',
    planId: 'p',
    exerciseId: 1,
    order: 1,
    targetSets: 3,
    targetReps: '12-15',
    repUnit: 'REPS',
    loadMode: 'WEIGHT',
    startLoadKg: 8,
    restSeconds: 60,
    technique: 'NORMAL',
    biSetWithNext: false,
    notes: null,
    cardioTarget: null,
    cardioDurationSeconds: null,
    cardioDistanceMeters: null,
    cardioIntensity: null,
    sets: [],
    exercise: { id: 1, name: 'Elevação lateral', muscleGroup, equipment: 'halteres' },
    ...over,
  }) as WorkoutPlanExercise;

function setup(over: Partial<WorkoutPlanExercise> = {}, group?: string, birthDate?: string) {
  const onSave = vi.fn();
  const onRemove = vi.fn();
  const user = userEvent.setup();
  render(
    <PlanExerciseSheet
      item={item(over, group)}
      open
      onOpenChange={vi.fn()}
      loadUnit="KG"
      birthDate={birthDate ?? null}
      onSave={onSave}
      onRemove={onRemove}
    />,
  );
  return { user, onSave, onRemove };
}

describe('Configurar exercício (Al-T21)', () => {
  it('abre com o que está gravado e salva o que foi digitado, com vírgula', async () => {
    const { user, onSave } = setup();
    expect(screen.getByRole('heading', { name: 'Elevação lateral' })).toBeInTheDocument();
    const sets = screen.getByRole('textbox', { name: 'Séries' });
    expect(sets).toHaveValue('3');
    expect(sets).toHaveAttribute('inputmode', 'numeric');
    await user.click(screen.getByRole('button', { name: 'Mais uma série' }));
    expect(sets).toHaveValue('4');
    const load = screen.getByRole('textbox', { name: 'Carga inicial (kg)' });
    expect(load).toHaveAttribute('inputmode', 'decimal');
    await user.clear(load);
    await user.type(load, '8,5');
    await user.click(screen.getByRole('button', { name: '1:30' }));
    await user.click(screen.getByRole('button', { name: 'Drop-set' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSets: 4,
        targetReps: '12-15',
        startLoadKg: 8.5,
        restSeconds: 90,
        technique: 'DROP_SET',
        biSetWithNext: false,
      }),
    );
  });

  it('mínimo acima do máximo aparece no campo e trava o Salvar', async () => {
    const { user, onSave } = setup();
    const min = screen.getByRole('textbox', { name: 'Repetições mínimas' });
    await user.clear(min);
    await user.type(min, '20');
    expect(screen.getByText('O mínimo passa do máximo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('série por série (B): monta a tabela a partir do simples e alterna o tipo', async () => {
    const { user, onSave } = setup();
    await user.click(screen.getByRole('switch', { name: 'Configurar série por série' }));
    expect(screen.getAllByRole('textbox', { name: /^Repetições da série/ })).toHaveLength(3);
    await user.click(screen.getByRole('button', { name: 'Série 1: normal' }));
    expect(screen.getByRole('button', { name: 'Série 1: drop' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adicionar série' }));
    expect(screen.getAllByRole('textbox', { name: /^Repetições da série/ })).toHaveLength(4);
    await user.click(screen.getByRole('button', { name: 'Remover série 4' }));
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSave.mock.calls[0][0].sets).toEqual([
      { kind: 'DROP', reps: 15, loadKg: 8 },
      { kind: 'NORMAL', reps: 15, loadKg: 8 },
      { kind: 'NORMAL', reps: 15, loadKg: 8 },
    ]);
  });

  it('remover do plano pergunta antes', async () => {
    const { user, onRemove } = setup();
    await user.click(screen.getByRole('button', { name: 'Remover do plano' }));
    expect(onRemove).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('cardio (D): meta por distância e intensidade com a faixa de batimentos da idade', async () => {
    const today = new Date();
    const birth = `${today.getFullYear() - 30}-01-01`;
    const { user, onSave } = setup({ targetReps: '', restSeconds: null }, 'cardio', birth);
    expect(screen.queryByRole('textbox', { name: 'Séries' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Distância' }));
    const km = screen.getByRole('textbox', { name: 'Distância (km)' });
    await user.clear(km);
    await user.type(km, '3,5');
    await user.click(screen.getByRole('button', { name: /Moderada/ }));
    expect(screen.getByText('133–152 bpm')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(onSave).toHaveBeenCalledWith({
      cardioTarget: 'DISTANCE',
      cardioDistanceMeters: 3500,
      cardioDurationSeconds: null,
      cardioIntensity: 'MODERATE',
    });
  });

  it('cardio sem data de nascimento não inventa batimentos', () => {
    setup({ targetReps: '' }, 'cardio');
    expect(screen.queryByText(/bpm/)).toBeNull();
    expect(screen.getByText(/data de nascimento/)).toBeInTheDocument();
  });
});
