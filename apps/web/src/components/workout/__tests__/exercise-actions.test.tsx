import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ExerciseGroup, SessionSet } from '@fatia/api-client';
import { ExerciseActions } from '../exercise-actions';

function makeGroup(overrides: Partial<ExerciseGroup> = {}): ExerciseGroup {
  return {
    exerciseId: 7,
    exerciseName: 'Leg press',
    isCardio: false,
    sets: [],
    targetSets: 3,
    targetReps: '10',
    isPlanned: true,
    ...overrides,
  };
}

const fakeSets = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}` }) as SessionSet);

function renderActions(
  group: ExerciseGroup,
  props: Partial<Parameters<typeof ExerciseActions>[0]> = {},
) {
  const handlers = { onDoNow: vi.fn(), onMove: vi.fn(), onRemove: vi.fn() };
  render(
    <ExerciseActions
      group={group}
      isFirst={false}
      isLast={false}
      disabled={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ExerciseActions', () => {
  it('"Fazer agora", setas e lixeira chamam cada uma a sua ação', async () => {
    const user = userEvent.setup();
    const h = renderActions(makeGroup());

    await user.click(screen.getByRole('button', { name: 'Fazer Leg press agora' }));
    await user.click(screen.getByRole('button', { name: 'Mover Leg press para cima' }));
    await user.click(screen.getByRole('button', { name: 'Mover Leg press para baixo' }));
    await user.click(screen.getByRole('button', { name: 'Tirar Leg press deste treino' }));

    expect(h.onDoNow).toHaveBeenCalledTimes(1);
    expect(h.onMove.mock.calls).toEqual([['up'], ['down']]);
    expect(h.onRemove).toHaveBeenCalledTimes(1);
  });

  it('exercício concluído mostra "✓ Concluído" no lugar de "Fazer agora"', () => {
    renderActions(makeGroup({ sets: fakeSets(3) }));
    expect(screen.getByText('✓ Concluído')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /agora/ })).not.toBeInTheDocument();
  });

  it('com séries abaixo da meta, ainda dá para fazer agora', () => {
    renderActions(makeGroup({ sets: fakeSets(2) }));
    expect(screen.getByRole('button', { name: 'Fazer Leg press agora' })).toBeInTheDocument();
  });

  it('cardio conta como feito a partir do primeiro registro', () => {
    renderActions(makeGroup({ isCardio: true, targetSets: undefined, sets: fakeSets(1) }));
    expect(screen.getByText('✓ Concluído')).toBeInTheDocument();
  });

  it('trava a seta da ponta e as duas durante uma troca, mas não a lixeira', () => {
    const { unmount } = render(
      <ExerciseActions
        group={makeGroup()}
        isFirst
        isLast={false}
        disabled={false}
        onDoNow={vi.fn()}
        onMove={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /para cima/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /para baixo/ })).toBeEnabled();
    unmount();

    renderActions(makeGroup(), { disabled: true });
    expect(screen.getByRole('button', { name: /para cima/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /para baixo/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /deste treino/ })).toBeEnabled();
  });
});
