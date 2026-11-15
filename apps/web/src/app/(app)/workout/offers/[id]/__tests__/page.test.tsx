import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OfferVersion, PlanOffer } from '@fatia/api-client';

const ctx = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  push: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: ctx.toast }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'o1' }),
  useRouter: () => ({ push: ctx.push }),
  usePathname: () => '/workout/offers/o1',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/layout/app-top-bar', () => ({
  TopBarActions: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
// O vaul chama `setPointerCapture`, que o jsdom não tem: a folha vira um diálogo simples.
vi.mock('@/components/ui/drawer', () => {
  const Passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Drawer: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? <div role="dialog">{children}</div> : null,
    DrawerContent: Passthrough,
    DrawerHeader: Passthrough,
    DrawerFooter: Passthrough,
    DrawerTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
    DrawerDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
    DrawerClose: Passthrough,
  };
});
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    planOffersApi: {
      list: vi.fn(),
      get: vi.fn(),
      accept: vi.fn(),
      decline: vi.fn(),
      undoDecline: vi.fn(),
    },
    workoutApi: { ...actual.workoutApi, startSession: vi.fn() },
  };
});

import { planOffersApi, workoutApi } from '@fatia/api-client';
import OfferPage from '../page';

const api = vi.mocked(planOffersApi);

const version = (over: Partial<OfferVersion> = {}): OfferVersion => ({
  id: 'v1',
  version: 1,
  status: 'PENDING',
  title: 'Inferior',
  schedule: 'CALENDAR',
  startDate: '2025-11-10',
  endDate: '2025-12-07',
  weeks: 4,
  weekdays: [1, 4],
  note: 'Coloquei stiff e panturrilha.',
  sentAt: '2025-11-10T12:12:00.000Z',
  respondedAt: null,
  summary: { exercises: 2, sets: 7, minutes: 40 },
  exercises: [
    {
      key: 'c:1',
      exerciseId: 1,
      name: 'Agachamento livre',
      muscleGroup: 'Pernas',
      targetSets: 4,
      targetReps: '8',
      restSeconds: 90,
      isNew: false,
      changes: [],
    },
    {
      key: 'c:2',
      exerciseId: 2,
      name: 'Stiff',
      muscleGroup: 'Pernas',
      targetSets: 3,
      targetReps: '10-12',
      restSeconds: null,
      isNew: false,
      changes: [],
    },
  ],
  removed: [],
  ...over,
});

const offer = (over: Partial<PlanOffer> = {}): PlanOffer => ({
  id: 'o1',
  author: { name: 'Helena Personal' },
  group: { id: 'g1', name: 'Academia Demo' },
  kind: 'new',
  shown: version(),
  accepted: null,
  diff: null,
  planId: null,
  ...over,
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <OfferPage />
    </QueryClientProvider>,
  );
}

describe('Plano recebido (Al-T2, Al-T2b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mostra quem mandou, o quando, os números, o recado e os exercícios', async () => {
    api.get.mockResolvedValue(offer());
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Inferior' })).toBeInTheDocument();
    expect(screen.getByText('Helena Personal')).toBeInTheDocument();
    expect(screen.getByText('4 semanas · 10 nov – 07 dez')).toBeInTheDocument();
    expect(screen.getByText('as sessões entram na sua agenda')).toBeInTheDocument();
    expect(screen.getByText('~40′')).toBeInTheDocument();
    expect(screen.getByText('Coloquei stiff e panturrilha.')).toBeInTheDocument();
    expect(screen.getByText('3 × 10–12')).toBeInTheDocument();
    expect(screen.getByText('personal')).toBeInTheDocument();
  });

  it('flexível: sem datas', async () => {
    api.get.mockResolvedValue(
      offer({
        shown: version({ schedule: 'FLEXIBLE', startDate: null, endDate: null, weeks: null }),
      }),
    );
    renderPage();
    expect(await screen.findByText('Flexível')).toBeInTheDocument();
    expect(screen.getByText('sem datas · siga no seu ritmo')).toBeInTheDocument();
  });

  it('aceitar pergunta antes e manda a versão que está na tela', async () => {
    api.get.mockResolvedValue(offer());
    api.accept.mockResolvedValue(
      offer({
        shown: version({ status: 'ACCEPTED' }),
        planId: 'p9',
        accepted: { id: 'v1', version: 1, planId: 'p9' },
      }),
    );
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Aceitar plano' }));
    expect(api.accept).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Aceitar' }));
    await waitFor(() => expect(api.accept).toHaveBeenCalledWith('o1', 'v1'));
    expect(await screen.findByText('Plano aceito')).toBeInTheDocument();
    expect(screen.getByText('Avisamos Helena. Ele entrou nos seus planos.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Começar agora/ })).toBeInTheDocument();
  });

  it('"Começar agora" abre o treino do plano aceito', async () => {
    api.get.mockResolvedValue(offer({ shown: version({ status: 'ACCEPTED' }), planId: 'p9' }));
    vi.mocked(workoutApi.startSession).mockResolvedValue({ id: 's1' } as never);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Começar agora/ }));
    await waitFor(() =>
      expect(workoutApi.startSession).toHaveBeenCalledWith(
        expect.objectContaining({ planId: 'p9' }),
      ),
    );
    await waitFor(() => expect(ctx.push).toHaveBeenCalledWith('/workout'));
  });

  it('recusar avisa e oferece desfazer', async () => {
    api.get.mockResolvedValue(offer());
    api.decline.mockResolvedValue(offer({ shown: version({ status: 'DECLINED' }) }));
    api.undoDecline.mockResolvedValue(offer());
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Recusar' }));
    await waitFor(() => expect(api.decline).toHaveBeenCalledWith('o1', 'v1'));
    expect(await screen.findByText('Recusado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute('href', '/workout');
    await userEvent.click(screen.getByRole('button', { name: 'Desfazer' }));
    await waitFor(() => expect(api.undoDecline).toHaveBeenCalledWith('o1', 'v1'));
    expect(await screen.findByRole('button', { name: 'Aceitar plano' })).toBeInTheDocument();
  });

  it('atualização: diz o que mudou, marca o novo e lista o que saiu', async () => {
    api.get.mockResolvedValue(
      offer({
        kind: 'update',
        accepted: { id: 'v1', version: 1, planId: 'p9' },
        planId: 'p9',
        diff: {
          added: ['c:3'],
          removed: ['c:2'],
          changed: [{ key: 'c:1', fields: [{ field: 'sets', before: '4', after: '5' }] }],
          hasChanges: true,
        },
        shown: version({
          id: 'v2',
          version: 2,
          exercises: [
            {
              ...version().exercises[0]!,
              targetSets: 5,
              changes: [{ field: 'sets', before: '4', after: '5' }],
            },
            {
              key: 'c:3',
              exerciseId: 3,
              name: 'Panturrilha em pé',
              muscleGroup: 'Pernas',
              targetSets: 4,
              targetReps: '15',
              restSeconds: 45,
              isNew: true,
              changes: [],
            },
          ],
          removed: [{ key: 'c:2', name: 'Stiff' }],
        }),
      }),
    );
    api.decline.mockResolvedValue(
      offer({ kind: 'update', shown: version({ id: 'v2', version: 2, status: 'DECLINED' }) }),
    );
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Inferior v2' })).toBeInTheDocument();
    expect(screen.getByText('1 novo · 1 alterado · 1 removido')).toBeInTheDocument();
    expect(screen.getByText('novo')).toBeInTheDocument();
    expect(screen.getByText('séries 4 → 5')).toBeInTheDocument();
    expect(screen.getByText('Stiff')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aceitar troca' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Manter a atual' }));
    await waitFor(() => expect(api.decline).toHaveBeenCalledWith('o1', 'v2'));
    expect(await screen.findByText('Você manteve a versão atual')).toBeInTheDocument();
  });
});
