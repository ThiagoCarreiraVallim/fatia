import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { WorkoutPlan } from '@fatia/api-client';
import PlansPage from '../page';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    workoutApi: { ...actual.workoutApi, listPlans: vi.fn(), deletePlan: vi.fn() },
  };
});

import { workoutApi } from '@fatia/api-client';

const listPlans = vi.mocked(workoutApi.listPlans);
const deletePlan = vi.mocked(workoutApi.deletePlan);

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PlansPage />
    </QueryClientProvider>,
  );
}

const PUSH = { id: 'p1', name: 'Push', exercises: [] } as unknown as WorkoutPlan;

describe('PlansPage', () => {
  beforeEach(() => {
    listPlans.mockReset();
    deletePlan.mockReset();
  });

  it('pergunta antes de excluir o plano, e só exclui na confirmação', async () => {
    listPlans.mockResolvedValue([PUSH]);
    deletePlan.mockResolvedValue(undefined as never);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Excluir plano Push' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Os treinos já feitos com ele continuam no histórico.');
    expect(deletePlan).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(deletePlan).toHaveBeenCalledWith('p1'));
  });

  it('erro ao carregar aparece com tentar de novo, e não como lista vazia', async () => {
    listPlans.mockRejectedValueOnce(new Error('sem conexão'));
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Não foi possível carregar seus planos',
    );
    expect(screen.queryByText('Nenhum plano criado ainda')).toBeNull();

    listPlans.mockResolvedValueOnce([PUSH]);
    await user.click(screen.getByRole('button', { name: /tentar de novo/i }));
    expect(await screen.findByText('Push')).toBeInTheDocument();
  });
});
