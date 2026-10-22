import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OnboardingWizard } from '../onboarding-wizard';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace }) }));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    usersApi: { me: vi.fn(), completeOnboarding: vi.fn(), skipOnboarding: vi.fn() },
    progressApi: { listWeights: vi.fn() },
    nutritionApi: { suggestGoals: vi.fn() },
  };
});

import { nutritionApi, progressApi, usersApi } from '@fatia/api-client';

const SUGESTAO = {
  age: 30,
  bmr: 1389,
  tdee: 2153,
  targetKcal: 1720,
  goals: {
    kcalMin: 1650,
    kcalMax: 1800,
    proteinMinG: 117,
    proteinMaxG: 143,
    carbsMinG: 119,
    carbsMaxG: 225,
    fatMinG: 48,
    fatMaxG: 67,
    weeklyWorkouts: 4,
    dailyStepsTarget: 9000,
    dailyWaterTargetMl: 2250,
  },
};

function renderWizard(redo = false, returnTo: string | null = null) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingWizard redo={redo} returnTo={returnTo} />
    </QueryClientProvider>,
  );
}

async function ateOCorpo() {
  const user = userEvent.setup();
  renderWizard();
  await user.click(await screen.findByRole('radio', { name: /Perder peso/ }));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
  return user;
}

describe('OnboardingWizard', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 15, 10));
    vi.mocked(usersApi.me).mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      name: 'Ana',
      role: 'USER',
      timezone: 'America/Sao_Paulo',
      heightCm: 168,
      sex: null,
      birthDate: null,
      activityLevel: null,
      objective: null,
      onboardedAt: null,
    });
    vi.mocked(progressApi.listWeights).mockResolvedValue({
      logs: [{ id: 'w', weightKg: 65.4 } as never],
    });
    vi.mocked(nutritionApi.suggestGoals).mockResolvedValue(SUGESTAO);
    vi.mocked(usersApi.completeOnboarding).mockResolvedValue({} as never);
    vi.mocked(usersApi.skipOnboarding).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('só avança com um objetivo escolhido', async () => {
    const user = userEvent.setup();
    renderWizard();
    const continuar = screen.getByRole('button', { name: 'Continuar' });
    expect(continuar).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Manter o peso/ }));
    expect(continuar).toBeEnabled();
  });

  it('o objetivo tocado antes do perfil chegar não é trocado pelo salvo', async () => {
    let entregar!: (v: Awaited<ReturnType<typeof usersApi.me>>) => void;
    vi.mocked(usersApi.me).mockReturnValue(new Promise((r) => (entregar = r)));
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('radio', { name: /Manter o peso/ }));

    entregar({
      id: 'u1',
      email: 'a@b.c',
      name: 'Ana',
      role: 'USER',
      timezone: 'America/Sao_Paulo',
      heightCm: 168,
      sex: 'FEMALE',
      birthDate: '1994-03-12',
      activityLevel: 'MODERATE',
      objective: 'LOSE',
      onboardedAt: null,
    } as never);
    await waitFor(() => expect(usersApi.me).toHaveBeenCalled());
    await screen.findByRole('radio', { name: /Manter o peso/, checked: true });
    expect(screen.getByRole('radio', { name: /Perder peso/ })).not.toBeChecked();
  });

  it('o corpo vem preenchido com a altura e a última pesagem', async () => {
    await ateOCorpo();
    expect(await screen.findByLabelText('Altura (cm)')).toHaveValue('168');
    expect(screen.getByLabelText('Peso (kg)')).toHaveValue('65,4');
  });

  it('aponta o que falta no corpo e não avança', async () => {
    const user = await ateOCorpo();
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    expect(screen.getByText('Escolha uma opção.')).toBeInTheDocument();
    expect(screen.getByText('Informe a data de nascimento.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Sobre você' })).toBeInTheDocument();
  });

  it('calcula com os dados dos passos e salva as metas editadas', async () => {
    const user = await ateOCorpo();
    await user.click(await screen.findByRole('radio', { name: 'Feminino' }));
    await user.type(screen.getByLabelText('Data de nascimento'), '1996-03-12');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('radio', { name: /Moderado/ }));
    await user.click(screen.getByRole('button', { name: 'Calcular minhas metas' }));

    expect(nutritionApi.suggestGoals).toHaveBeenCalledWith({
      sex: 'FEMALE',
      birthDate: '1996-03-12',
      heightCm: 168,
      weightKg: 65.4,
      objective: 'LOSE',
      activityLevel: 'MODERATE',
    });
    expect(await screen.findByText(/2\.153/)).toBeInTheDocument();

    const kcalMin = screen.getByLabelText('Calorias: mínimo');
    await user.clear(kcalMin);
    await user.type(kcalMin, '1700');
    await user.click(screen.getByRole('button', { name: 'Usar estas metas' }));

    await waitFor(() => expect(usersApi.completeOnboarding).toHaveBeenCalled());
    expect(vi.mocked(usersApi.completeOnboarding).mock.calls[0][0]).toEqual({
      sex: 'FEMALE',
      birthDate: '1996-03-12',
      heightCm: 168,
      weightKg: 65.4,
      objective: 'LOSE',
      activityLevel: 'MODERATE',
      goals: { ...SUGESTAO.goals, kcalMin: 1700 },
    });
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
  });

  it('não salva metas com mínimo acima do máximo', async () => {
    const user = await ateOCorpo();
    await user.click(await screen.findByRole('radio', { name: 'Feminino' }));
    await user.type(screen.getByLabelText('Data de nascimento'), '1996-03-12');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('radio', { name: /Moderado/ }));
    await user.click(screen.getByRole('button', { name: 'Calcular minhas metas' }));
    const kcalMin = await screen.findByLabelText('Calorias: mínimo');
    await user.clear(kcalMin);
    await user.type(kcalMin, '1900');
    await user.click(screen.getByRole('button', { name: 'Usar estas metas' }));
    expect(screen.getByText('O mínimo passa do máximo.')).toBeInTheDocument();
    expect(usersApi.completeOnboarding).not.toHaveBeenCalled();
  });

  it('"Pular por agora" marca como visto e vai ao início', async () => {
    const user = userEvent.setup();
    renderWizard();
    await user.click(screen.getByRole('button', { name: 'Pular por agora' }));
    await waitFor(() => expect(usersApi.skipOnboarding).toHaveBeenCalled());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
  });

  it('quem veio de um link volta para ele ao pular', async () => {
    const user = userEvent.setup();
    renderWizard(false, '/c/tok');
    await user.click(screen.getByRole('button', { name: 'Pular por agora' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/c/tok'));
  });

  it('ao refazer, cancelar volta às metas sem chamar o skip', async () => {
    const user = userEvent.setup();
    renderWizard(true);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(usersApi.skipOnboarding).not.toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith('/nutrition/goals');
  });
});
