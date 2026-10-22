import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Exercise } from '@fatia/api-client';
import { ExerciseEditDrawer } from '../exercise-edit-drawer';

// O vaul não monta no jsdom; o conteúdo basta.
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
    workoutApi: { gymEquipment: vi.fn(), updateExercise: vi.fn() },
  };
});

import { workoutApi } from '@fatia/api-client';

const exercicio = {
  id: 9,
  name: 'Remada minha',
  equipment: 'barra',
  instructions: [],
} as unknown as Exercise;

function renderDrawer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ExerciseEditDrawer exercise={exercicio} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('ExerciseEditDrawer › equipamento', () => {
  it('a lista completa tem os da academia primeiro, e o campo é a busca', async () => {
    vi.mocked(workoutApi.gymEquipment).mockResolvedValue({
      equipment: ['halteres'],
      customEquipment: ['Hack da casa'],
    });
    vi.mocked(workoutApi.updateExercise).mockResolvedValue(exercicio);
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'Escolher da lista' }));
    await screen.findByRole('region', { name: 'Da sua academia' });
    const secoes = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'));
    expect(secoes[0]).toBe('Da sua academia');
    // O valor atual já vem marcado, com a lista inteira à mostra.
    expect(screen.getByRole('radio', { name: 'Barra' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Polia' })).toBeInTheDocument();

    const campo = screen.getByLabelText('Equipamento');
    fireEvent.change(campo, { target: { value: 'esteir' } });
    expect(screen.getByRole('radio', { name: 'Esteira' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Polia' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Da sua academia' })).toBeNull();

    fireEvent.change(campo, { target: { value: 'hack' } });
    fireEvent.click(
      within(await screen.findByRole('region', { name: 'Da sua academia' })).getByRole('radio', {
        name: 'Hack da casa',
      }),
    );
    expect(campo).toHaveValue('Hack da casa');
    // Escolher fecha a lista.
    expect(screen.queryByRole('region', { name: 'Da sua academia' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(workoutApi.updateExercise).toHaveBeenCalledWith(
        9,
        expect.objectContaining({ equipment: 'Hack da casa' }),
      ),
    );
  });
});
