import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ExerciseSearchDrawer } from '../exercise-search-drawer';

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

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: { searchExercises: vi.fn(), logSet: vi.fn() },
  };
});

import { workoutApi } from '@fatia/api-client';

const supino = {
  id: 7,
  name: 'Supino reto',
  muscleGroup: 'peito',
  source: 'SEED',
} as Awaited<ReturnType<typeof workoutApi.searchExercises>>[number];

describe('ExerciseSearchDrawer', () => {
  it('hands the picked exercise to the session without logging a fake set', async () => {
    vi.mocked(workoutApi.searchExercises).mockResolvedValue([supino]);
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ExerciseSearchDrawer open onOpenChange={onOpenChange} onPick={onPick} />
      </QueryClientProvider>,
    );

    await user.click(await screen.findByRole('button', { name: /supino reto/i }));

    expect(onPick).toHaveBeenCalledWith(supino);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(workoutApi.logSet).not.toHaveBeenCalled();
  });
});
