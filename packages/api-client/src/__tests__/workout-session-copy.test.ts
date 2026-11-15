import { describe, expect, it } from 'vitest';
import { ApiError } from '../http';
import {
  activeSessionIdFromError,
  appendNoteShortcut,
  howItWentBody,
  checkinDoneMessage,
  comparisonFacts,
  feelingOf,
  feelingToRpe,
  FEELINGS,
  formatBestSet,
  formatTrainingVolume,
  musclesByRestTone,
  newSetClientKey,
  noteShortcutsFor,
  blockRow,
  planCardInfo,
  planExercisePreview,
  planMuscleBars,
  questionsAudience,
  questionsTitle,
  recordsTitle,
  rpeToFeeling,
  summaryFacts,
  trainingWeekLabel,
  youtubeThumbnail,
} from '../workout-session-copy';
import type {
  TrainingBlock,
  TrainingBlockWeek,
  WorkoutPlan,
  WorkoutSessionSummary,
} from '../workout';

const summary = (over: Partial<WorkoutSessionSummary> = {}): WorkoutSessionSummary => ({
  sessionId: 's1',
  planId: 'p1',
  planName: 'Push',
  startedAt: '2026-11-14T21:02:00Z',
  completedAt: '2026-11-14T21:54:00Z',
  durationMinutes: 52,
  sets: 19,
  volumeKg: 6230,
  feeling: null,
  notes: null,
  overallFeeling: 2,
  comparison: null,
  records: [],
  muscles: { groups: [], primary: [], secondary: [] },
  exercises: [],
  checkin: null,
  questions: null,
  ...over,
});

describe('sensação do treino (escala de 5 do canvas)', () => {
  it('cinco níveis, do Leve ao No limite, com o RPE de cada um', () => {
    expect(FEELINGS.map((f) => f.label)).toEqual([
      'Leve',
      'Firme',
      'Puxado',
      'Muito puxado',
      'No limite',
    ]);
    expect(FEELINGS.map((f) => feelingToRpe(f.level))).toEqual([6, 7, 8, 9, 10]);
    expect(rpeToFeeling(8)).toBe(3);
    expect(rpeToFeeling(null)).toBeNull();
    expect(feelingOf(5)?.emoji).toBe('🥵');
    expect(feelingOf(null)).toBeNull();
  });
});

describe('semana do Treino', () => {
  it('"3 de 4 treinos" com meta; sem meta, só o total', () => {
    expect(trainingWeekLabel({ start: '', days: [], done: 3, target: 4 })).toBe('3 de 4 treinos');
    expect(trainingWeekLabel({ start: '', days: [], done: 1, target: null })).toBe('1 treino');
    expect(trainingWeekLabel({ start: '', days: [], done: 0, target: null })).toBe(
      'nenhum treino ainda',
    );
  });
});

describe('músculos de hoje no diagrama', () => {
  it('cada músculo do diagrama no tom do descanso do grupo', () => {
    const tones = musclesByRestTone([
      { group: 'costas', daysSince: 5 },
      { group: 'peito', daysSince: 2 },
    ]);
    expect(tones.lats).toBe('rested');
    expect(tones.chest).toBe('recovering');
    // Grupo fora da lista de descansados foi treinado ontem ou hoje.
    expect(tones.quadriceps).toBe('recent');
  });
});

describe('Treino feito', () => {
  it('melhor série: força, peso do corpo e cardio', () => {
    expect(
      formatBestSet({
        weightKg: 52.5,
        reps: 10,
        distanceMeters: null,
        durationSeconds: null,
        avgHeartRate: null,
      }),
    ).toBe('52,5 × 10');
    // Carga redonda sem ",0", como no canvas ("35 × 8").
    expect(
      formatBestSet({
        weightKg: 80,
        reps: 5,
        distanceMeters: null,
        durationSeconds: null,
        avgHeartRate: null,
      }),
    ).toBe('80 × 5');
    expect(
      formatBestSet({
        weightKg: null,
        reps: 15,
        distanceMeters: null,
        durationSeconds: null,
        avgHeartRate: null,
      }),
    ).toBe('15 reps');
    expect(
      formatBestSet({
        weightKg: null,
        reps: null,
        distanceMeters: 2400,
        durationSeconds: 900,
        avgHeartRate: 138,
      }),
    ).toBe('2,4 km · 15 min · 138 bpm');
  });

  it('em libras, a carga e o volume saem na unidade da pessoa', () => {
    const best = {
      weightKg: 100,
      reps: 5,
      distanceMeters: null,
      durationSeconds: null,
      avgHeartRate: null,
    };
    expect(formatBestSet(best, 'LB')).toBe('220,5 × 5');
    expect(formatBestSet(best, 'KG')).toBe('100 × 5');
    // Carga 0 é peso do corpo, não "0 × 12".
    expect(formatBestSet({ ...best, weightKg: 0, reps: 12 }, 'LB')).toBe('12 reps');
    expect(formatTrainingVolume(400, 'LB')).toBe('882 lb');
    expect(formatTrainingVolume(6200, 'LB')).toBe('13,7 mil lb');
    expect(summaryFacts(summary({ volumeKg: 400 }), 'LB')[2]).toEqual({
      value: '882 lb',
      label: 'volume',
    });
  });

  it('os quatro números do topo', () => {
    expect(summaryFacts(summary())).toEqual([
      { value: '52′', label: 'duração' },
      { value: '19', label: 'séries' },
      { value: '6,2 t', label: 'volume' },
      { value: '🙂', label: 'no geral' },
    ]);
    // Volume abaixo de uma tonelada fica em kg.
    expect(summaryFacts(summary({ volumeKg: 640, overallFeeling: null }))[2]).toEqual({
      value: '640 kg',
      label: 'volume',
    });
    expect(summaryFacts(summary({ overallFeeling: null }))[3]).toEqual({
      value: '—',
      label: 'no geral',
    });
  });

  it('comparação com sinal e seta, e o menos tipográfico', () => {
    expect(
      comparisonFacts({
        sessionId: 'x',
        startedAt: '',
        volumeDeltaPct: 6,
        setsDelta: 1,
        durationDeltaMinutes: -3,
      }),
    ).toEqual([
      { label: 'volume', value: '+6% ▲', tone: 'up' },
      { label: 'séries', value: '+1', tone: 'up' },
      { label: 'duração', value: '−3 min', tone: 'down' },
    ]);
  });

  it('recordes no singular e no plural', () => {
    expect(recordsTitle(1)).toBe('1 recorde novo');
    expect(recordsTitle(2)).toBe('2 recordes novos');
  });

  it('atalhos da observação somem quando já estão no texto', () => {
    expect(noteShortcutsFor('')).toContain('Dor no joelho');
    expect(noteShortcutsFor('dor no joelho')).not.toContain('Dor no joelho');
    expect(appendNoteShortcut('', 'Leve')).toBe('leve');
  });

  it('"Como foi o treino?" só manda o que mudou, e desmarcar ou apagar também grava', () => {
    const saved = { feeling: 3, notes: 'leve' };
    expect(howItWentBody(saved, { feeling: 3, notes: ' leve ' })).toEqual({});
    expect(howItWentBody(saved, { feeling: null, notes: 'leve' })).toEqual({ feeling: null });
    expect(howItWentBody(saved, { feeling: 3, notes: '  ' })).toEqual({ notes: '' });
    expect(howItWentBody({ feeling: null, notes: null }, { feeling: 2, notes: 'ok' })).toEqual({
      feeling: 2,
      notes: 'ok',
    });
    expect(appendNoteShortcut('leve', 'Subir carga')).toBe('leve, subir carga');
  });

  it('as perguntas dizem quem lê as respostas', () => {
    expect(questionsTitle(['Helena Prado'])).toBe('Perguntas da Helena');
    expect(questionsTitle(['Helena Prado', 'Rui Lima'])).toBe('Perguntas da equipe');
    expect(questionsAudience(['Helena Prado'])).toBe('Só a Helena vê as respostas');
    expect(questionsAudience(['Helena Prado', 'Rui Lima'])).toBe(
      'Só Helena e Rui veem as respostas',
    );
    expect(checkinDoneMessage(true, ['Helena Prado'])).toBe(
      'Perguntas puladas · a Helena vê só que você pulou',
    );
    expect(checkinDoneMessage(false, ['Helena Prado'])).toBe('Respostas enviadas para a Helena');
  });
});

describe('cartões de plano', () => {
  const ex = (muscleGroup: string, targetSets: number) =>
    ({ targetSets, exercise: { muscleGroup } }) as WorkoutPlan['exercises'][number];
  const plan = {
    id: 'p',
    userId: 'u',
    name: 'Push',
    exercises: [ex('peito', 4), ex('ombro', 3), ex('peito', 3), ex('braço', 2)],
  } as WorkoutPlan;

  it('exercícios, séries e minutos estimados', () => {
    expect(planCardInfo(plan)).toBe('4 exercícios · 12 séries · ~31 min');
  });

  it('barra de músculos pela fração das séries', () => {
    expect(planMuscleBars(plan)).toEqual([
      { group: 'peito', share: 7 / 12 },
      { group: 'ombro', share: 3 / 12 },
      { group: 'braço', share: 2 / 12 },
    ]);
  });
});

describe('sessão', () => {
  it('o 409 do início traz a sessão aberta', () => {
    const err = new ApiError('aberta', 409, { activeSessionId: 'abc' });
    expect(activeSessionIdFromError(err)).toBe('abc');
    expect(activeSessionIdFromError(new ApiError('x', 404, {}))).toBeNull();
    expect(activeSessionIdFromError(new Error('x'))).toBeNull();
  });

  it('cada toque em Concluir série ganha uma chave nova', () => {
    const a = newSetClientKey();
    expect(a).toMatch(/^[a-z0-9-]{8,64}$/);
    expect(newSetClientKey()).not.toBe(a);
  });

  it('miniatura do YouTube para o vídeo sem player no app', () => {
    expect(youtubeThumbnail('abc123')).toBe('https://i.ytimg.com/vi/abc123/hqdefault.jpg');
  });
});

describe('prévia do plano (prancha Al-T1)', () => {
  const ex = (name: string, order: number) =>
    ({ order, exercise: { name } }) as WorkoutPlan['exercises'][number];

  it('primeira palavra dos três primeiros, na ordem do plano, com reticências', () => {
    const plan = {
      exercises: [
        ex('Crucifixo no cabo', 3),
        ex('Supino Reto com Barra - Pegada Média', 1),
        ex('Desenvolvimento Militar com Barra', 2),
        ex('Tríceps corda', 4),
      ],
    };
    expect(planExercisePreview(plan)).toBe('Supino, Desenvolvimento, Crucifixo…');
  });

  it('até três exercícios: sem reticências; vazio: texto vazio', () => {
    expect(planExercisePreview({ exercises: [ex('Remada curvada', 1)] })).toBe('Remada');
    expect(planExercisePreview({ exercises: [] })).toBe('');
  });
});

describe('linha do bloco (prancha Al-T1)', () => {
  const week = (weekNumber: number, focus: TrainingBlockWeek['focus'], volumeFactor: number) =>
    ({ weekNumber, focus, volumeFactor, state: 'upcoming' }) as TrainingBlockWeek;
  const weeks = [
    week(1, 'accumulation', 1),
    week(2, 'accumulation', 1.2),
    week(3, 'peak', 0.9),
    week(4, 'deload', 0.6),
  ];
  const block = (over: Partial<TrainingBlock> = {}) =>
    ({
      kindLabel: 'hipertrofia',
      weeksTotal: 4,
      startDate: '2026-11-16',
      currentWeek: null,
      weeks,
      ...over,
    }) as TrainingBlock;

  it('semana atual e o foco dela; barras pelo volume, cheias até a atual', () => {
    const row = blockRow(block({ currentWeek: weeks[1]! }));
    expect(row.title).toBe('Bloco de hipertrofia');
    expect(row.detail).toBe('semana 2 de 4 · acúmulo');
    expect(row.bars).toEqual([
      { ratio: 1 / 1.2, reached: true },
      { ratio: 1, reached: true },
      { ratio: 0.9 / 1.2, reached: false },
      { ratio: 0.6 / 1.2, reached: false },
    ]);
  });

  it('antes de começar: a data de início, nenhuma barra cheia', () => {
    const row = blockRow(block());
    expect(row.detail).toBe('4 semanas · começa 16/11');
    expect(row.bars.every((b) => !b.reached)).toBe(true);
  });
});
