import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MyGroup, ReviewSessionView } from '@fatia/api-client';
import { grupo, renderWithClient } from '../../../../__tests__/helpers';

const ctx = vi.hoisted(() => ({ group: null as MyGroup | null }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ sessionId: 's1' }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/org/g1/review/sessions/s1',
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/org/org-shell', () => ({ useOrgGroup: () => ctx.group }));
vi.mock('sonner', () => ({ toast: vi.fn() }));
vi.mock('@fatia/api-client', async () => {
  const actual = await vi.importActual<typeof import('@fatia/api-client')>('@fatia/api-client');
  return {
    ...actual,
    reviewApi: {
      queue: vi.fn(),
      markSeen: vi.fn(),
      atRisk: vi.fn(),
      setRiskDays: vi.fn(),
      setDigest: vi.fn(),
      session: vi.fn(),
      sendFeedback: vi.fn(),
    },
  };
});

import { reviewApi } from '@fatia/api-client';
import ReviewSessionPage from '../page';

const detalhe: ReviewSessionView = {
  shared: true,
  membershipId: 'm-ana',
  name: 'Ana Dias',
  whatsapp: '5565998123456',
  seenAt: null,
  feedback: [],
  checkin: {
    id: 'c1',
    sessionId: 's1',
    skipped: false,
    difficulty: null,
    fatigue: 3,
    pain: false,
    painLocation: null,
    motivation: null,
    note: 'Panturrilha queimou demais na última série.',
    answeredAt: '2026-11-18T22:00:00.000Z',
    updatedAt: '2026-11-18T22:00:00.000Z',
  },
  summary: {
    sessionId: 's1',
    kind: 'plan',
    planId: 'p1',
    planName: 'Inferior v2',
    startedAt: '2026-11-18T21:02:00.000Z',
    completedAt: '2026-11-18T21:54:00.000Z',
    durationMinutes: 52,
    sets: 19,
    volumeKg: 6200,
    feeling: 3,
    notes: null,
    overallFeeling: 3,
    comparison: {
      sessionId: 's0',
      startedAt: '2026-11-15T21:00:00.000Z',
      volumeDeltaPct: 6,
      setsDelta: 0,
      durationDeltaMinutes: 2,
    },
    records: [
      {
        exerciseId: 1,
        exerciseName: 'Agachamento livre',
        weightKg: 62.5,
        reps: 8,
        distanceMeters: null,
        durationSeconds: null,
      },
    ],
    muscles: { groups: [], primary: [], secondary: [] },
    exercises: [
      {
        exerciseId: 1,
        exerciseName: 'Agachamento livre',
        muscleGroup: 'pernas',
        isCardio: false,
        sets: 4,
        best: {
          weightKg: 62.5,
          reps: 8,
          distanceMeters: null,
          durationSeconds: null,
          avgHeartRate: null,
        },
        feeling: 3,
        isRecord: true,
      },
    ],
  },
};

beforeEach(() => {
  ctx.group = grupo({ id: 'g1', role: 'PROFESSIONAL' });
  vi.mocked(reviewApi.session).mockResolvedValue(detalhe);
});
afterEach(() => vi.clearAllMocks());

describe('Sessão feita no painel (#399, Pn-35)', () => {
  it('duração, séries, volume com a comparação, como foi, exercícios, nota e ficha', async () => {
    renderWithClient(<ReviewSessionPage />);
    expect(await screen.findByRole('heading', { name: 'Inferior v2' })).toBeInTheDocument();
    expect(screen.getByText(/Ana Dias/)).toBeInTheDocument();
    const fatos = screen.getByRole('region', { name: 'Resumo da sessão' });
    expect(within(fatos).getByText('52 min')).toBeInTheDocument();
    expect(within(fatos).getByText('19')).toBeInTheDocument();
    expect(within(fatos).getByText('+6% vs sessão anterior')).toBeInTheDocument();
    expect(within(fatos).getByText('cansaço 3 de 5 · sem dor')).toBeInTheDocument();
    const tabela = screen.getByRole('table');
    const agachamento = within(tabela).getByRole('row', { name: /Agachamento livre/ });
    expect(within(agachamento).getByText(/62,5 kg × 8 · recorde/)).toBeInTheDocument();
    expect(screen.getByText('“Panturrilha queimou demais na última série.”')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ficha da Ana' })).toHaveAttribute(
      'href',
      '/org/g1/members/m-ana',
    );
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/5565998123456'),
    );
  });

  it('reação e comentário: "Enviar ao aluno" manda e mostra "enviado à Ana"', async () => {
    const user = userEvent.setup();
    vi.mocked(reviewApi.sendFeedback).mockResolvedValue({
      id: 'f1',
      authorName: 'Helena Prado',
      reaction: 'STRONG',
      body: 'Recorde no agachamento!',
      createdAt: '2026-11-18T22:05:00.000Z',
      updatedAt: '2026-11-18T22:05:00.000Z',
      isMine: true,
    });
    renderWithClient(<ReviewSessionPage />);
    await screen.findByRole('heading', { name: 'Inferior v2' });
    await user.click(screen.getByRole('button', { name: /💪/ }));
    await user.type(screen.getByLabelText('Comentário para a Ana'), 'Recorde no agachamento!');
    vi.mocked(reviewApi.session).mockResolvedValue({
      ...detalhe,
      seenAt: '2026-11-18T22:05:00.000Z',
      feedback: [
        {
          id: 'f1',
          authorName: 'Helena Prado',
          reaction: 'STRONG',
          body: 'Recorde no agachamento!',
          createdAt: '2026-11-18T22:05:00.000Z',
          updatedAt: '2026-11-18T22:05:00.000Z',
          isMine: true,
        },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Enviar ao aluno' }));
    expect(reviewApi.sendFeedback).toHaveBeenCalledWith('g1', 's1', {
      reaction: 'STRONG',
      body: 'Recorde no agachamento!',
    });
    await waitFor(() => expect(screen.getByText(/enviado à Ana/)).toBeInTheDocument());
    expect(screen.getByText('depois de comentar, sai da fila')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volta para Para revisar/ })).toHaveAttribute(
      'href',
      '/org/g1/review',
    );
  });

  it('sem Treino liberado (Pn-35b): só o aviso, sem detalhe nem ficha', async () => {
    vi.mocked(reviewApi.session).mockResolvedValue({ shared: false, name: 'Ana Dias' });
    renderWithClient(<ReviewSessionPage />);
    expect(await screen.findByText('Ana não compartilha Treino')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Só a pessoa pode ligar em Comunidade → Sobre. A equipe vê só que a sessão aconteceu, sem detalhes.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Ficha/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enviar ao aluno' })).not.toBeInTheDocument();
  });

  it('F10: tocar na reação atual tira a reação', async () => {
    const user = userEvent.setup();
    const minha = {
      id: 'f1',
      authorName: 'Helena Prado',
      reaction: 'STRONG' as const,
      body: 'Recorde!',
      createdAt: '2026-11-18T22:05:00.000Z',
      updatedAt: '2026-11-18T22:05:00.000Z',
      isMine: true,
    };
    vi.mocked(reviewApi.session).mockResolvedValue({ ...detalhe, feedback: [minha] });
    vi.mocked(reviewApi.sendFeedback).mockResolvedValue({ ...minha, reaction: null });
    renderWithClient(<ReviewSessionPage />);
    const forca = await screen.findByRole('button', { name: /💪/ });
    expect(forca).toHaveAttribute('aria-pressed', 'true');
    await user.click(forca);
    expect(forca).toHaveAttribute('aria-pressed', 'false');
    await user.click(screen.getByRole('button', { name: 'Enviar ao aluno' }));
    expect(reviewApi.sendFeedback).toHaveBeenCalledWith('g1', 's1', { reaction: null });
  });

  it('F8: o contador e o limite contam emoji como um caractere, como a API', async () => {
    renderWithClient(<ReviewSessionPage />);
    const caixa = await screen.findByLabelText('Comentário para a Ana');
    fireEvent.change(caixa, { target: { value: '💪'.repeat(500) } });
    expect(screen.getByText('500/500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar ao aluno' })).toBeEnabled();
    fireEvent.change(caixa, { target: { value: '💪'.repeat(501) } });
    expect(screen.getByText('501/500')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar ao aluno' })).toBeDisabled();
  });
});
