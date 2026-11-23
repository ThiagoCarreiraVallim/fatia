import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';
import type { ReactElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GroupTip, MyGroup, PlanTemplate } from '@fatia/api-client';
import { grupo } from '../../../../../(org)/org/[groupId]/__tests__/helpers';

const ctx = vi.hoisted(() => ({ params: { groupId: 'g1' } as Record<string, string> }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('next/navigation', () => ({
  useParams: () => ctx.params,
  usePathname: () => '/community/g1/content',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/components/layout/app-top-bar', () => ({
  useTopBarTitle: vi.fn(),
  TopBarActions: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  topBarActionClass: '',
}));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    groupsApi: { get: vi.fn() },
    groupContentApi: { plans: vi.fn(), tips: vi.fn() },
    groupExerciseApi: { forMember: vi.fn(), memberEquipment: vi.fn() },
    forYouApi: { get: vi.fn() },
  };
});

import { forYouApi, groupContentApi, groupExerciseApi, groupsApi } from '@fatia/api-client';
import CommunityContentPage from '../page';

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const plano = (id: string, kind: PlanTemplate['kind'], title: string) =>
  ({
    id,
    kind,
    title,
    description: null,
    level: null,
    cover: null,
    authorName: 'Helena',
    authorRole: 'PROFESSIONAL',
    publishedAt: '2026-10-10T00:00:00Z',
    updatedAt: '2026-10-10T00:00:00Z',
    exercises: [],
    goals: null,
    meals: [],
    adoptedPlanId: null,
  }) as unknown as PlanTemplate;

const dica = (id: string, category: GroupTip['category'], title: string): GroupTip => ({
  id,
  title,
  body: 'Texto',
  category,
  image: null,
  pinned: false,
  authorName: 'Helena',
  authorRole: 'PROFESSIONAL',
  publishedAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
});

function abrir(g: Partial<MyGroup>) {
  vi.mocked(groupsApi.get).mockResolvedValue(grupo({ role: 'MEMBER', ...g }));
  vi.mocked(groupContentApi.plans).mockResolvedValue([
    plano('p1', 'WORKOUT', 'Treino A'),
    plano('p2', 'NUTRITION', 'Cardápio leve'),
  ]);
  vi.mocked(groupContentApi.tips).mockResolvedValue([
    dica('d1', 'NUTRITION', 'Proteína no café'),
    dica('d2', 'RECOVERY', 'Durma bem'),
  ]);
  vi.mocked(groupExerciseApi.forMember).mockResolvedValue([] as never);
  vi.mocked(groupExerciseApi.memberEquipment).mockResolvedValue([] as never);
  vi.mocked(forYouApi.get).mockResolvedValue({ count: 0 } as never);
  return renderWithClient(<CommunityContentPage />);
}

describe('seções escondidas na comunidade do membro (#413)', () => {
  afterEach(() => vi.clearAllMocks());

  it('sem nutrição: some o plano alimentar e a dica de nutrição; o resto fica', async () => {
    abrir({ hiddenSections: ['NUTRITION_TIPS', 'NUTRITION_PLANS'] });
    const planos = await screen.findByRole('list', { name: 'Planos da equipe' });
    expect(within(planos).getByText('Treino A')).toBeInTheDocument();
    expect(within(planos).queryByText('Cardápio leve')).toBeNull();
    await userEvent.click(screen.getByRole('tab', { name: 'Dicas' }));
    const dicas = await screen.findByRole('list', { name: 'Dicas da equipe' });
    expect(within(dicas).getByText('Durma bem')).toBeInTheDocument();
    expect(within(dicas).queryByText('Proteína no café')).toBeNull();
  });

  it('sem Desafios: a aba some; nada escondido, as quatro abas', async () => {
    abrir({ hiddenSections: ['CHALLENGES'] });
    const abas = await screen.findByRole('navigation', { name: 'Seções da comunidade' });
    await screen.findByText('Cardápio leve');
    expect(within(abas).queryByRole('link', { name: 'Desafios' })).toBeNull();
    expect(within(abas).getByRole('link', { name: 'Conteúdo' })).toBeInTheDocument();
  });

  it('nada escondido: tudo aparece', async () => {
    abrir({ hiddenSections: [] });
    expect(await screen.findByText('Cardápio leve')).toBeInTheDocument();
    const abas = screen.getByRole('navigation', { name: 'Seções da comunidade' });
    expect(within(abas).getByRole('link', { name: 'Desafios' })).toBeInTheDocument();
  });
});
