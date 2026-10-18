import { describe, expect, it } from 'vitest';
import {
  addDaysToIso,
  CHALLENGE_METRICS,
  challengePeriod,
  challengeProblem,
  challengeStatusLabel,
  displayNameProblem,
  METRIC_INFO,
  participantsLabel,
  rankLabel,
  scoreLabel,
} from '../community-challenges';
import { routeInfo } from '../navigation';

const base = {
  title: 'Outubro ativo',
  metric: 'ACTIVE_DAYS' as const,
  startDate: '2026-10-18',
  endDate: '2026-10-24',
};

describe('desafios: textos', () => {
  it('pontuação no singular e no plural, com milhar', () => {
    expect(scoreLabel('STEPS', 12345)).toBe('12.345 passos');
    expect(scoreLabel('KCAL_IN_RANGE_DAYS', 1)).toBe('1 dia na meta');
    expect(scoreLabel('STREAK_DAYS', 4)).toBe('4 dias seguidos');
    expect(scoreLabel('WATER_ML', 1500)).toBe('1.500 ml');
  });

  it('período, estado, posição e participantes', () => {
    expect(challengePeriod(base)).toBe('18 out a 24 out');
    expect(challengePeriod({ startDate: '2026-12-31', endDate: '2026-12-31' })).toBe('31 dez');
    expect(challengeStatusLabel({ status: 'upcoming', startDate: '2026-11-02' })).toBe(
      'Começa 2 nov',
    );
    expect(challengeStatusLabel({ status: 'running', startDate: '2026-11-02' })).toBe(
      'Em andamento',
    );
    expect(rankLabel(null)).toBeNull();
    expect(rankLabel(3)).toBe('3º lugar');
    expect(participantsLabel(1)).toBe('1 participante');
    expect(participantsLabel(0)).toBe('0 participantes');
  });

  it('só as métricas de nutrição avisam que contam pela meta da pessoa', () => {
    expect(CHALLENGE_METRICS.filter((m) => METRIC_INFO[m].usesOwnGoal)).toEqual([
      'KCAL_IN_RANGE_DAYS',
      'PROTEIN_TARGET_DAYS',
    ]);
    // O texto que a equipe e o membro leem diz que ninguém vê quanto o outro comeu.
    expect(METRIC_INFO.KCAL_IN_RANGE_DAYS.explain).toMatch(/Ninguém vê quanto o outro comeu/);
  });

  it('soma dias na data, atravessando mês e ano', () => {
    expect(addDaysToIso('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDaysToIso('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('desafios: o que impede salvar', () => {
  it('mesmas regras da API', () => {
    const hoje = '2026-10-18';
    expect(challengeProblem(base, hoje)).toBeNull();
    expect(challengeProblem({ ...base, title: 'Oi' }, hoje)).toBe('Dê um título ao desafio.');
    expect(challengeProblem({ ...base, startDate: '2026-10-17' }, hoje)).toBe(
      'O desafio não pode começar no passado.',
    );
    expect(challengeProblem({ ...base, endDate: '2026-10-17' }, hoje)).toBe(
      'O fim tem de ser no dia do início ou depois.',
    );
    expect(
      challengeProblem({ ...base, endDate: addDaysToIso(base.startDate, 89) }, hoje),
    ).toBeNull();
    expect(challengeProblem({ ...base, endDate: addDaysToIso(base.startDate, 90) }, hoje)).toBe(
      'Um desafio dura no máximo 90 dias.',
    );
    expect(challengeProblem({ ...base, endDate: '' }, hoje)).toBe('Escolha o início e o fim.');
  });

  it('apelido: tamanho e uma linha só', () => {
    expect(displayNameProblem('Ana')).toBeNull();
    expect(displayNameProblem(' A ')).toBe('Escolha um apelido.');
    expect(displayNameProblem('x'.repeat(31))).toBe('O apelido tem até 30 caracteres.');
    expect(displayNameProblem('Ana\nAdmin')).toBe(
      'O apelido não pode ter quebra de linha nem < ou >.',
    );
    expect(displayNameProblem('<b>Ana</b>')).toBe(
      'O apelido não pode ter quebra de linha nem < ou >.',
    );
  });
});

describe('desafios: navegação', () => {
  it('voltar sobe da tela do desafio para a lista, e dela para a comunidade', () => {
    expect(routeInfo('/community/g1/challenges/c1')).toMatchObject({
      title: 'Desafio',
      parent: '/community/g1/challenges',
    });
    expect(routeInfo('/community/g1/challenges')).toMatchObject({
      title: 'Desafios',
      parent: '/community/g1',
    });
    expect(routeInfo('/org/g1/challenges')).toMatchObject({ title: 'Desafios', parent: '/org/g1' });
  });
});
