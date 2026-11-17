import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { OnboardingProgress } from '@fatia/api-client';
import { OnboardingFlow } from '../onboarding-flow';

const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: nav.replace }) }));
vi.mock('@/components/notifications/use-web-push', () => ({
  useWebPush: () => ({ busy: false, enable: vi.fn().mockResolvedValue('on') }),
}));

vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    usersApi: { me: vi.fn(), completeOnboarding: vi.fn(), updateMe: vi.fn() },
    onboardingApi: { progress: vi.fn(), save: vi.fn(), finish: vi.fn(), firstSteps: vi.fn() },
    billingApi: { plan: vi.fn() },
    groupsApi: {
      mine: vi.fn(),
      previewInvite: vi.fn(),
      acceptInvite: vi.fn(),
      previewBySlug: vi.fn(),
      join: vi.fn(),
    },
    nutritionApi: { suggestGoals: vi.fn(), recognizeMealPhoto: vi.fn() },
    remindersApi: { list: vi.fn(), create: vi.fn() },
    acceptAiConsent: vi.fn(),
  };
});

import {
  AI_CONSENT_TEXTS,
  ApiError,
  acceptAiConsent,
  billingApi,
  groupsApi,
  nutritionApi,
  onboardingApi,
  remindersApi,
  usersApi,
} from '@fatia/api-client';

const GOALS = {
  kcalMin: 1700,
  kcalMax: 1850,
  proteinMinG: 126,
  proteinMaxG: 154,
  carbsMinG: 115,
  carbsMaxG: 227,
  fatMinG: 49,
  fatMaxG: 69,
  weeklyWorkouts: 3,
  dailyStepsTarget: 9000,
  dailyWaterTargetMl: 2500,
};

const progress = (p: Partial<OnboardingProgress> = {}): OnboardingProgress => ({
  step: null,
  onboardedAt: null,
  profile: {
    objective: null,
    sex: null,
    birthDate: null,
    heightCm: null,
    activityLevel: null,
    weightKg: null,
  },
  draft: {},
  teamSuggestion: null,
  ...p,
});

const FULL_PROFILE: OnboardingProgress['profile'] = {
  objective: 'LOSE',
  sex: 'FEMALE',
  birthDate: '1996-03-12',
  heightCm: 168,
  activityLevel: 'MODERATE',
  weightKg: 65.4,
};

function renderFlow(props: Parameters<typeof OnboardingFlow>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OnboardingFlow {...props} />
    </QueryClientProvider>,
  );
}

describe('OnboardingFlow (#371)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 4, 10));
    vi.mocked(usersApi.me).mockResolvedValue({ name: 'Ana', onboardedAt: null } as never);
    vi.mocked(onboardingApi.progress).mockResolvedValue(progress());
    vi.mocked(onboardingApi.save).mockImplementation(async (i) => progress({ step: i.step }));
    vi.mocked(onboardingApi.finish).mockResolvedValue({} as never);
    vi.mocked(billingApi.plan).mockResolvedValue({
      tier: 'FREE',
      requiresPlan: true,
      webCheckout: false,
      prices: null,
    } as never);
    vi.mocked(groupsApi.mine).mockResolvedValue([]);
    vi.mocked(nutritionApi.suggestGoals).mockResolvedValue({ tdee: 2153, goals: GOALS } as never);
    vi.mocked(usersApi.completeOnboarding).mockResolvedValue({} as never);
    vi.mocked(remindersApi.list).mockResolvedValue([]);
    vi.mocked(remindersApi.create).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    document.cookie = 'fatia_convite=; Max-Age=0; Path=/';
  });

  it('sem convite começa no objetivo e grava a etapa seguinte a cada "Continuar"', async () => {
    const user = userEvent.setup();
    renderFlow();
    const continuar = await screen.findByRole('button', { name: 'Continuar' });
    expect(continuar).toBeDisabled();
    // Etapas 1 a 7 não têm "Pular" (as pranchas só o mostram da 8 em diante).
    expect(screen.queryByRole('button', { name: 'Pular' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Perder gordura/ }));
    await user.click(continuar);
    expect(onboardingApi.save).toHaveBeenCalledWith({ step: 'body', objective: 'LOSE' });
    expect(await screen.findByRole('heading', { name: 'Sobre você' })).toBeInTheDocument();
  });

  it('retoma na etapa salva, já preenchida, com o aviso de "continuando"', async () => {
    vi.mocked(onboardingApi.progress).mockResolvedValue(
      progress({ step: 'activity', profile: FULL_PROFILE }),
    );
    renderFlow();
    expect(
      await screen.findByRole('heading', { name: 'Como é seu dia a dia?' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Moderado/ })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Continuando de onde parou')).toBeInTheDocument();
    expect(screen.getByText('Salvo a cada passo')).toBeInTheDocument();
  });

  it('as metas concluem o perfil e seguem para os lembretes, sem duplicar o que já existe', async () => {
    vi.mocked(onboardingApi.progress).mockResolvedValue(
      progress({ step: 'goals', profile: FULL_PROFILE }),
    );
    vi.mocked(remindersApi.list).mockResolvedValue([{ kind: 'WATER' } as never]);
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('button', { name: 'Aumentar calorias' }));
    await user.click(screen.getByRole('button', { name: 'Usar estas metas' }));
    await waitFor(() =>
      expect(usersApi.completeOnboarding).toHaveBeenCalledWith(
        expect.objectContaining({
          objective: 'LOSE',
          activityLevel: 'MODERATE',
          birthDate: '1996-03-12',
          weightKg: 65.4,
          goals: expect.objectContaining({ kcalMin: 1750, kcalMax: 1900 }),
        }),
      ),
    );
    expect(onboardingApi.save).toHaveBeenLastCalledWith({ step: 'reminders' });

    // Água e refeições vêm ligadas; a água já existe e não é criada de novo.
    await user.click(await screen.findByRole('button', { name: 'Ligar 2 lembretes' }));
    await waitFor(() => expect(remindersApi.create).toHaveBeenCalledTimes(1));
    expect(remindersApi.create).toHaveBeenCalledWith(expect.objectContaining({ kind: 'MEAL' }));
    expect(onboardingApi.save).toHaveBeenLastCalledWith({ step: 'notifications' });
  });

  it('da etapa 8 em diante tudo é pulável, e o fim vai ao Hoje', async () => {
    vi.mocked(onboardingApi.progress).mockResolvedValue(
      progress({ step: 'notifications', profile: FULL_PROFILE, onboardedAt: '2026-11-04' }),
    );
    vi.mocked(groupsApi.mine).mockResolvedValue([{ status: 'ACTIVE', name: 'Academia' } as never]);
    const user = userEvent.setup();
    renderFlow();
    await user.click(await screen.findByRole('button', { name: 'Pular' }));
    // Já está numa comunidade e a compra está desligada: não sobra etapa.
    await waitFor(() => expect(onboardingApi.finish).toHaveBeenCalled());
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'));
  });

  it('a foto do prato sem o aceite da IA abre o aceite em vez do erro', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 10, height: 10 }));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,A');
    vi.mocked(onboardingApi.progress).mockResolvedValue(
      progress({ step: 'ai', profile: FULL_PROFILE, onboardedAt: '2026-11-04' }),
    );
    vi.mocked(billingApi.plan).mockResolvedValue({
      tier: 'PRO',
      source: 'GROUP',
      requiresPlan: true,
      webCheckout: false,
      groupName: 'Academia',
      prices: null,
    } as never);
    vi.mocked(nutritionApi.recognizeMealPhoto).mockRejectedValue(
      new ApiError('Aceite pendente', 403, { code: 'AI_CONSENT_REQUIRED' }),
    );
    vi.mocked(acceptAiConsent).mockResolvedValue({
      chat: { accepted: true },
      webSearch: { accepted: false },
      webSearchEnabled: false,
    } as never);
    const user = userEvent.setup();
    renderFlow();
    await user.upload(
      await screen.findByLabelText('Foto do prato'),
      new File(['x'], 'p.jpg', { type: 'image/jpeg' }),
    );
    expect(await screen.findByRole('dialog', { name: AI_CONSENT_TEXTS.chat.title })).toBeTruthy();
    expect(screen.queryByText('Aceite pendente')).toBeNull();
    await user.click(screen.getByRole('button', { name: AI_CONSENT_TEXTS.chat.accept }));
    expect(acceptAiConsent).toHaveBeenCalledWith('chat');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('com convite: boas-vindas, e "não aceito" segue sem a comunidade', async () => {
    vi.mocked(groupsApi.previewInvite).mockResolvedValue({
      group: { id: 'g1', name: 'Academia Demo', description: null, type: 'SPONSORED' },
      role: 'MEMBER',
      invitedBy: 'Helena',
      team: [
        { name: 'Bruno Lima', role: 'OWNER' },
        { name: 'Helena Souza', role: 'PROFESSIONAL' },
      ],
      memberCount: 40,
      emailBound: false,
      expiresAt: '2026-12-01T00:00:00Z',
      requiredSharingScopes: ['WORKOUT'],
      activeChallenge: { title: 'Semana ativa', participants: 38 },
    });
    const user = userEvent.setup();
    renderFlow({ inviteToken: 'a'.repeat(43) });
    expect(
      await screen.findByRole('heading', { name: 'Bem-vinda à Academia Demo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Semana ativa · 38 participando')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(onboardingApi.save).toHaveBeenLastCalledWith({ step: 'share' });

    expect(await screen.findByText('Bruno (dono) e Helena (profissional)')).toBeInTheDocument();
    // Nada opcional vem marcado (ADR 026).
    expect(screen.getByRole('switch', { name: /Alimentação/ })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    await user.click(screen.getByRole('button', { name: /Não aceito/ }));
    expect(groupsApi.acceptInvite).not.toHaveBeenCalled();
    expect(onboardingApi.save).toHaveBeenLastCalledWith({ step: 'objective' });
    expect(
      await screen.findByRole('heading', { name: 'Qual é o seu objetivo?' }),
    ).toBeInTheDocument();
  });

  it('aceitar o convite leva o obrigatório e o que a pessoa ligou', async () => {
    vi.mocked(groupsApi.previewInvite).mockResolvedValue({
      group: { id: 'g1', name: 'Academia Demo', description: null, type: 'SOCIAL' },
      role: 'MEMBER',
      invitedBy: null,
      team: [],
      memberCount: 4,
      emailBound: false,
      expiresAt: '2026-12-01T00:00:00Z',
      requiredSharingScopes: ['WORKOUT'],
      activeChallenge: null,
    });
    vi.mocked(onboardingApi.progress).mockResolvedValue(progress({ step: 'share' }));
    vi.mocked(groupsApi.acceptInvite).mockResolvedValue({} as never);
    const user = userEvent.setup();
    renderFlow({ inviteToken: 'b'.repeat(43) });
    await user.click(await screen.findByRole('switch', { name: /Corpo/ }));
    await user.click(screen.getByRole('button', { name: 'Aceitar e continuar' }));
    await waitFor(() =>
      expect(groupsApi.acceptInvite).toHaveBeenCalledWith('b'.repeat(43), {
        scopes: ['WORKOUT', 'BODY'],
        statsOptIn: false,
      }),
    );
  });

  it('refazer não mexe na etapa salva e volta às metas', async () => {
    vi.mocked(onboardingApi.progress).mockResolvedValue(
      progress({ profile: FULL_PROFILE, onboardedAt: '2026-11-01' }),
    );
    const user = userEvent.setup();
    renderFlow({ redo: true });
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('button', { name: 'Calcular minhas metas' }));
    await user.click(await screen.findByRole('button', { name: 'Usar estas metas' }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/nutrition/goals'));
    expect(onboardingApi.save).not.toHaveBeenCalled();
    expect(onboardingApi.finish).not.toHaveBeenCalled();
  });
});
