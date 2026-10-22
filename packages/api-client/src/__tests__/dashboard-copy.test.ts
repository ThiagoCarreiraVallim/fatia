import { describe, expect, it } from 'vitest';
import { greetingLine, nextWorkoutCopy } from '../dashboard-copy';
import type { TodaySummary } from '../progress';

const hora = (h: number) => new Date(2026, 6, 29, h);

describe('greetingLine', () => {
  it('greets by first name', () => {
    expect(greetingLine('Ana Demo', hora(15))).toBe('Boa tarde, Ana.');
    expect(greetingLine('joão silva', hora(9))).toBe('Bom dia, João.');
  });

  it('greets without a name when the stored one is not a real name', () => {
    // Fallbacks do provisionamento: parte local do e-mail, `sub` do Logto, "User".
    expect(greetingLine('a1b2c3d4e5', hora(21))).toBe('Boa noite.');
    expect(greetingLine('User', hora(3))).toBe('Boa madrugada.');
    expect(greetingLine(undefined, hora(15))).toBe('Boa tarde.');
    expect(greetingLine('', hora(15))).toBe('Boa tarde.');
  });
});

type Workout = TodaySummary['workout'];
const base: Workout = {
  plannedToday: null,
  nextPlan: null,
  sessionInProgress: null,
  completedToday: false,
};
const hhmm = () => '07:30';

describe('nextWorkoutCopy', () => {
  it('offers the next plan of the rotation instead of "no plan"', () => {
    const copy = nextWorkoutCopy(
      { ...base, nextPlan: { planId: 'p3', name: 'Legs', source: 'ROTATION' } },
      hhmm,
    );
    expect(copy).toEqual({
      badge: 'Próximo treino',
      title: 'Legs',
      subtitle: 'Próximo da sua rotação',
      href: '/workout/plans/p3',
    });
  });

  it('names the block when the plan comes from it', () => {
    const copy = nextWorkoutCopy(
      { ...base, nextPlan: { planId: 'p9', name: 'Força', source: 'BLOCK' } },
      hhmm,
    );
    expect(copy.subtitle).toBe('Plano do seu bloco');
  });

  it('invites to create a plan when there is none', () => {
    expect(nextWorkoutCopy(base, hhmm)).toEqual({
      badge: 'Próximo treino',
      title: 'Treino livre',
      subtitle: 'Ou crie um plano para seguir',
      href: '/workout',
    });
  });

  it('resumes a session in progress', () => {
    const copy = nextWorkoutCopy(
      { ...base, sessionInProgress: { id: 's1', startedAt: '2026-07-29T10:30:00Z' } },
      hhmm,
    );
    expect(copy).toEqual({
      badge: 'Em andamento',
      title: 'Retomar sessão',
      subtitle: 'Iniciado às 07:30',
      href: '/workout',
    });
  });

  it('celebrates a completed workout', () => {
    const copy = nextWorkoutCopy({ ...base, completedToday: true }, hhmm);
    expect(copy).toMatchObject({ badge: 'Treino concluído', href: '/workout/history' });
  });
});
