import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Goal } from '../goals';
import type { Achievement, ConsistencyDay, ConsistencyReport } from '../progress';
import type { PersonalRecordEntry, RecordsOverview } from '../workout';
import {
  achievementDetail,
  achievementTally,
  consistencyAreaRows,
  consistencyCells,
  consistencyGridCaption,
  consistencyGridTitle,
  consistencyStats,
  consistencyTip,
  consistencyYearMonths,
  goalBadge,
  goalCreateInput,
  goalDeadlineIso,
  goalProgress,
  goalSubtitle,
  goalTab,
  averagePace,
  cardioSummary,
  formatPace,
  linePath,
  newBestCount,
  recordHighlight,
  stepSourceBadge,
  strengthRecordRows,
  trendPercent,
} from '../progress-screens';

/** Telas de Progresso (#382): a mesma regra de apresentação na web e no app. */

function dia(date: string, count: number): ConsistencyDay {
  return { date, meal: count > 0, workout: count > 1, water: count > 2, steps: count > 3, count };
}

function datas(from: string, to: string): string[] {
  const out: string[] = [];
  const d = new Date(`${from}T12:00:00Z`);
  while (d.toISOString().slice(0, 10) <= to) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

function report(
  parcial: Partial<ConsistencyReport> & { from: string; to: string },
): ConsistencyReport {
  const days = datas(parcial.from, parcial.to).map((d) => dia(d, 0));
  return {
    range: 'month',
    days,
    activeDays: 0,
    totalDays: days.length,
    streak: {
      periodos: 0,
      faltasUsadas: 0,
      faltasPermitidas: 0,
      periodoCorrenteEmAberto: false,
      janelaEsgotada: false,
    },
    record: 0,
    byArea: {
      meal: { days: 0, of: days.length },
      workout: { days: 0, of: null },
      water: { days: 0, of: null },
      steps: { days: 0, of: null },
    },
    ...parcial,
  };
}

describe('constância (Al-G12)', () => {
  // 2026-10-18 é domingo; 2026-11-16 é segunda.
  const mes = report({ from: '2026-10-18', to: '2026-11-16' });

  it('a grade começa na segunda e termina no domingo da semana de hoje', () => {
    const cells = consistencyCells(mes);

    expect(cells[0]).toMatchObject({ date: '2026-10-12', kind: 'outside' });
    expect(cells.find((c) => c.date === '2026-10-18')).toMatchObject({ kind: 'past', day: 18 });
    expect(cells.at(-1)).toMatchObject({ date: '2026-11-22', kind: 'future' });
    expect(cells.length % 7).toBe(0);
  });

  it('a cor é o número de áreas cumpridas no dia, de 0 a 4', () => {
    const r = { ...mes, days: mes.days.map((d, i) => (i === 3 ? dia(d.date, 4) : d)) };

    const cell = consistencyCells(r).find((c) => c.date === r.days[3].date);

    expect(cell?.level).toBe(4);
  });

  it('o ano vira 12 barras, uma por mês, terminando no mês de hoje', () => {
    const ano = report({ range: 'year', from: '2025-11-17', to: '2026-11-16' });
    ano.days = ano.days.map((d) =>
      d.date.startsWith('2026-09') && d.date <= '2026-09-20' ? dia(d.date, 1) : d,
    );

    const meses = consistencyYearMonths(ano);

    expect(meses).toHaveLength(12);
    expect(meses[0].label).toBe('d');
    expect(meses.at(-1)).toMatchObject({ label: 'n', current: true });
    expect(meses.find((m) => m.key === '2026-09')?.percent).toBe(67);
  });

  it('números do topo: dias ativos, dias seguidos e recorde', () => {
    const r = {
      ...mes,
      activeDays: 16,
      record: 21,
      streak: { ...mes.streak, periodos: 12 },
    };

    expect(consistencyStats(r)).toEqual([
      { value: '16/30', label: 'dias ativos', fire: false },
      { value: '12', label: 'dias seguidos', fire: true },
      { value: '21', label: 'recorde', fire: false },
    ]);
  });

  it('título e legenda da grade por período', () => {
    expect(consistencyGridTitle(mes)).toBe('Outubro e novembro');
    expect(consistencyGridCaption(mes)).toBe('18 out – 16 nov · cor = áreas cumpridas no dia');
    expect(consistencyGridTitle({ ...mes, range: 'quarter' })).toBe('Últimas 13 semanas');
    expect(consistencyGridCaption({ ...mes, range: 'year' })).toBe('% de dias ativos');
  });

  it('por área: dias na meta, com o treino contra a meta semanal', () => {
    const r = {
      ...mes,
      byArea: {
        meal: { days: 24, of: 30 },
        workout: { days: 12, of: 16 },
        water: { days: 18, of: 30 },
        steps: { days: 3, of: null },
      },
    };

    const rows = consistencyAreaRows(r);

    expect(rows.map((x) => x.label)).toEqual(['Alimentação', 'Treinos', 'Água', 'Passos']);
    expect(rows[1]).toMatchObject({ text: '12/16', percent: 75 });
    expect(rows[3]).toMatchObject({ text: 'sem meta', percent: 0 });
  });

  it('a dica aponta os dias mais fortes, sem culpa', () => {
    // Segundas e quartas ativas; sábados nunca.
    const r = {
      ...mes,
      days: mes.days.map((d) => {
        const wd = new Date(`${d.date}T12:00:00Z`).getUTCDay();
        return wd === 1 || wd === 3
          ? dia(d.date, 2)
          : wd === 6
            ? dia(d.date, 0)
            : d.date.endsWith('5')
              ? dia(d.date, 1)
              : d;
      }),
    };

    const tip = consistencyTip(r);

    expect(tip).toMatch(/^Seg e qua são seus dias mais fortes\./);
    expect(tip).not.toMatch(/falh|perdeu|culpa/i);
  });

  it('no trimestre a dica olha as últimas 4 semanas; no ano, o melhor mês', () => {
    const tri = report({ range: 'quarter', from: '2026-08-19', to: '2026-11-16' });
    tri.days = tri.days.map((d, i) =>
      i >= tri.days.length - 28 && i % 2 === 0 ? dia(d.date, 1) : d,
    );
    expect(consistencyTip(tri)).toBe('Subiu nas últimas 4 semanas.');

    const ano = report({ range: 'year', from: '2025-11-17', to: '2026-11-16' });
    ano.days = ano.days.map((d) =>
      d.date.startsWith('2026-09') && d.date <= '2026-09-20' ? dia(d.date, 1) : d,
    );
    expect(consistencyTip(ano)).toBe('Seu melhor mês foi setembro, com 67% de dias ativos.');
  });

  it('sem nenhum dia ativo, a dica explica a regra em vez de cobrar', () => {
    expect(consistencyTip(mes)).toBe(
      'Um registro já conta o dia: refeição, treino, água ou passos.',
    );
  });
});

describe('conquistas (Al-G11)', () => {
  const base: Achievement = {
    key: 'first_workout',
    title: 'Primeiro treino',
    description: '',
    condition: 'Conclua um treino',
    unlockedAt: null,
    context: null,
    progress: null,
  };

  beforeEach(() => vi.stubEnv('TZ', 'America/Sao_Paulo'));
  afterEach(() => vi.unstubAllEnvs());

  it('desbloqueada: data e contexto ("29 set · Push")', () => {
    const a = { ...base, unlockedAt: '2026-09-29T21:00:00.000Z', context: { planName: 'Push' } };

    expect(achievementDetail(a)).toEqual({ unlocked: true, text: 'Desbloqueada em 29 set · Push' });
  });

  it('bloqueada de contagem: quanto falta', () => {
    const a = { ...base, key: 'workouts_100', progress: { current: 42, target: 100 } };

    expect(achievementDetail(a)).toEqual({ unlocked: false, text: 'Bloqueada · faltam 58' });
  });

  it('bloqueada sem contagem: a condição', () => {
    const a = {
      ...base,
      key: 'challenge_podium',
      condition: 'Fique entre os 3 primeiros de um desafio',
    };

    expect(achievementDetail(a).text).toBe('Bloqueada · fique entre os 3 primeiros de um desafio');
  });

  it('o primeiro recorde conta o exercício e a carga', () => {
    const a = {
      ...base,
      key: 'first_pr',
      unlockedAt: '2026-10-31T15:00:00.000Z',
      context: { exerciseName: 'Stiff', weightKg: 40 },
    };

    expect(achievementDetail(a).text).toBe('Desbloqueada em 31 out · Stiff 40 kg');
  });

  it('a contagem é N de 10', () => {
    const lista = Array.from({ length: 10 }, (_, i) => ({
      ...base,
      key: `k${i}`,
      unlockedAt: i < 7 ? '2026-10-01T12:00:00.000Z' : null,
    }));

    expect(achievementTally(lista)).toEqual({ got: 7, total: 10 });
  });
});

describe('recordes (Al-G5)', () => {
  const rec = (p: Partial<PersonalRecordEntry>): PersonalRecordEntry => ({
    exerciseId: 1,
    exerciseName: 'Agachamento livre',
    muscleGroup: 'pernas',
    type: 'strength',
    maxWeightKg: 75,
    repsAtMax: 11,
    estimated1RM: 102.5,
    maxDistanceMeters: null,
    bestDurationSeconds: null,
    achievedAt: '2026-10-30T12:00:00.000Z',
    lastPerformedAt: '2026-10-30T12:00:00.000Z',
    totalSets: 20,
    monthEvolution: { startE1RM: 89, endE1RM: 102.5, percent: 15.2 },
    ...p,
  });

  it('o destaque em % de 1RM estimado, com a barra do começo ao fim', () => {
    const overview: RecordsOverview = { records: [rec({})], highlight: rec({}) };

    expect(recordHighlight(overview, 'KG')).toEqual({
      title: 'Agachamento livre',
      percent: '+15%',
      scale: '1RM 89 → 103 kg',
      barPercent: 87,
    });
  });

  it('sem destaque, nada', () => {
    expect(recordHighlight({ records: [], highlight: null }, 'KG')).toBeNull();
  });

  it('lista só de força, filtrada por grupo e da maior carga para a menor', () => {
    const overview: RecordsOverview = {
      records: [
        rec({
          exerciseId: 1,
          exerciseName: 'Rosca direta',
          muscleGroup: 'braço',
          maxWeightKg: 22.5,
          repsAtMax: 10,
          estimated1RM: 30,
        }),
        rec({
          exerciseId: 2,
          exerciseName: 'Leg press 45°',
          maxWeightKg: 152,
          repsAtMax: 10,
          estimated1RM: 203,
        }),
        rec({ exerciseId: 3, exerciseName: 'Esteira', type: 'cardio', muscleGroup: 'cardio' }),
      ],
      highlight: null,
    };

    expect(strengthRecordRows(overview, 'all', 'KG').map((r) => r.title)).toEqual([
      'Leg press 45°',
      'Rosca direta',
    ]);
    expect(strengthRecordRows(overview, 'braço', 'KG')).toEqual([
      {
        id: 1,
        title: 'Rosca direta',
        subtitle: '10 reps · 1RM ~30 · 30 out',
        value: '22,5',
        unit: 'kg',
      },
    ]);
  });
});

describe('metas pessoais (Al-G9, Al-G10)', () => {
  const goal = (p: Partial<Goal>): Goal => ({
    id: 'g',
    userId: 'u',
    kind: 'weight',
    title: 'Chegar a 68 kg',
    description: null,
    startValue: 75,
    targetValue: 68,
    unit: 'kg',
    lastReportedValue: null,
    deadline: '2026-12-31T23:59:59.000-03:00',
    status: 'active',
    createdAt: '2026-10-01T12:00:00.000Z',
    completedAt: null,
    currentValue: 70.2,
    progressPercent: 69,
    ...p,
  });

  beforeEach(() => vi.stubEnv('TZ', 'America/Sao_Paulo'));
  afterEach(() => vi.unstubAllEnvs());

  it('vencida fica nas ativas, com o selo "prazo passou"', () => {
    const g = goal({ status: 'expired' });

    expect(goalTab(g)).toBe('active');
    expect(goalBadge(g)).toEqual({ label: 'prazo passou', tone: 'warn' });
    expect(goalTab(goal({ status: 'archived' }))).toBe('archived');
  });

  it('linha de baixo de cada tipo, como na prancha', () => {
    expect(goalSubtitle(goal({}))).toBe('70,2 kg · alvo 68 · até 31 dez');
    expect(
      goalSubtitle(
        goal({
          kind: 'workout_frequency',
          unit: 'treinos',
          currentValue: 3,
          targetValue: 4,
          deadline: null,
        }),
      ),
    ).toBe('3,0 de 4 · sem prazo');
    expect(
      goalSubtitle(
        goal({
          kind: 'step_count',
          unit: 'passos',
          currentValue: 8884,
          targetValue: 10000,
          status: 'expired',
          deadline: '2026-10-31T23:59:59.000-03:00',
        }),
      ),
    ).toBe('média 8.884 · prazo era 31 out');
    expect(
      goalSubtitle(
        goal({
          kind: 'body_fat',
          unit: '%',
          currentValue: 22,
          status: 'completed',
          completedAt: '2026-10-12T15:00:00.000Z',
        }),
      ),
    ).toBe('22% · concluída em 12 out');
  });

  it('concluída é 100%; sem valor, 0', () => {
    expect(goalProgress(goal({ status: 'completed', progressPercent: 80 }))).toBe(100);
    expect(goalProgress(goal({ progressPercent: null }))).toBe(0);
  });

  it('o prazo é o fim do dia escolhido, no fuso de quem cria', () => {
    expect(goalDeadlineIso('2026-12-31')).toBe('2027-01-01T02:59:59.000Z');
  });

  it('"Outra" leva a unidade que a pessoa escreveu; os outros tipos ignoram', () => {
    expect(
      goalCreateInput({
        kind: 'custom',
        title: 'Ler',
        target: 12,
        deadline: null,
        unit: ' livros ',
      }).unit,
    ).toBe('livros');
    expect(
      goalCreateInput({ kind: 'custom', title: 'Ler', target: 12, deadline: null, unit: '' }).unit,
    ).toBe('vezes');
    expect(
      goalCreateInput({ kind: 'weight', title: 'x', target: 68, deadline: null, unit: 'lb' }).unit,
    ).toBe('kg');
  });

  it('monta a meta com a unidade do tipo', () => {
    expect(
      goalCreateInput({ kind: 'step_count', title: '', target: 10000, deadline: null }),
    ).toEqual({
      kind: 'step_count',
      title: '10 mil passos por dia',
      targetValue: 10000,
      unit: 'passos',
    });
    expect(
      goalCreateInput({
        kind: 'weight',
        title: 'Chegar a 68 kg',
        target: 68,
        deadline: '2026-12-31',
      }),
    ).toMatchObject({ unit: 'kg', deadline: '2027-01-01T02:59:59.000Z' });
  });
});

describe('gráficos', () => {
  it('variação em % do primeiro para o último', () => {
    expect(trendPercent([100, 90, 104])).toBe(4);
    expect(trendPercent([5])).toBeNull();
    expect(trendPercent([0, 10])).toBeNull();
  });

  it('linha cabe na caixa e sobe quando o valor sobe', () => {
    const d = linePath([1, 2, 3], 90, 22);

    expect(d.startsWith('M0 ')).toBe(true);
    expect(d).toContain('90 ');
    // O último ponto (maior) fica no alto da caixa (y pequeno).
    expect(Number(d.trim().split(' ').at(-1))).toBeLessThan(5);
  });
});

describe('resumos dos gráficos', () => {
  it('recordes no período: sessões que passaram a melhor marca até então', () => {
    expect(newBestCount([50, 52, 51, 55, 55])).toBe(2);
  });

  it('cardio: ritmo médio pela soma de tempo e distância, e a maior distância', () => {
    const c = {
      exercise: null,
      metric: 'duration',
      bestSession: null,
      points: [
        {
          sessionDate: '2026-11-01',
          sessionId: 'a',
          durationSeconds: 1800,
          distanceMeters: 4000,
          paceSecondsPerKm: 450,
          kcalBurned: null,
          value: 1800,
        },
        {
          sessionDate: '2026-11-03',
          sessionId: 'b',
          durationSeconds: 1200,
          distanceMeters: null,
          paceSecondsPerKm: null,
          kcalBurned: null,
          value: 1200,
        },
        {
          sessionDate: '2026-11-05',
          sessionId: 'c',
          durationSeconds: 2640,
          distanceMeters: 6000,
          paceSecondsPerKm: 440,
          kcalBurned: null,
          value: 2640,
        },
      ],
    };

    expect(formatPace(averagePace(c))).toBe('7:24');
    expect(cardioSummary(c)).toEqual([
      { label: 'sessões', value: '3' },
      { label: 'média', value: '7:24 /km' },
      { label: 'maior distância', value: '6,0 km' },
    ]);
  });
});

describe('origem do registro (Al-G7)', () => {
  it('manual é mudo e editável; o que vem do celular é verde e só se vê', () => {
    expect(stepSourceBadge('MANUAL')).toEqual({ label: 'manual', tone: 'mute', manual: true });
    expect(stepSourceBadge('APPLE_HEALTH')).toEqual({
      label: 'Apple Saúde',
      tone: 'ok',
      manual: false,
    });
    expect(stepSourceBadge('HEALTH_CONNECT')).toEqual({
      label: 'Health Connect',
      tone: 'ok',
      manual: false,
    });
    expect(stepSourceBadge('WEBHOOK').manual).toBe(false);
  });
});
