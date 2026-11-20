import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient, resetApiClient } from '../http';
import {
  circuitProblem,
  circuitSummary,
  documentProblems,
  documentWeekdays,
  exerciseLine,
  lastSetHint,
  moveItem,
  newCircuitBlock,
  normalizeTags,
  paceText,
  planCopyApi,
  sessionLabel,
  sessionLetter,
  toDocumentInput,
  type DocumentExerciseView,
  type PlanDocumentView,
} from '../plan-editor';
import { diffSummary, exerciseChangeText } from '../plan-offers';

const ex = (over: Partial<DocumentExerciseView> = {}): DocumentExerciseView => ({
  type: 'exercise',
  exerciseId: 10,
  name: 'Agachamento livre',
  muscleGroup: 'pernas',
  equipment: 'barra',
  isCardio: false,
  hasGuide: false,
  targetSets: 4,
  targetReps: '6-8',
  ...over,
});

const doc = (): PlanDocumentView => ({
  sessions: [
    { name: 'Pernas', weekday: 1, items: [ex(), ex({ exerciseId: 11, name: 'Leg press' })] },
    {
      name: 'Posterior',
      weekday: 4,
      items: [newCircuitBlock('AMRAP', [ex({ exerciseId: 12, name: 'Burpee' })])],
    },
  ],
});

describe('editor de plano (#406)', () => {
  it('letra e rótulo da sessão', () => {
    expect(sessionLetter(0)).toBe('A');
    expect(sessionLetter(3)).toBe('D');
    expect(sessionLabel(1, 'Posterior')).toBe('B · Posterior');
    expect(sessionLabel(2, '  ')).toBe('C');
  });

  it('bloco novo nasce com os padrões do formato', () => {
    expect(newCircuitBlock('AMRAP')).toMatchObject({ format: 'AMRAP', durationSeconds: 720 });
    expect(newCircuitBlock('TABATA')).toMatchObject({
      workSeconds: 20,
      restSeconds: 10,
      intervals: 8,
    });
    expect(newCircuitBlock('ROUNDS')).toMatchObject({ rounds: 3 });
  });

  it('resumo do circuito', () => {
    expect(circuitSummary({ type: 'circuit', format: 'AMRAP', durationSeconds: 720 })).toBe(
      'AMRAP · 12 min',
    );
    expect(
      circuitSummary({
        type: 'circuit',
        format: 'TABATA',
        workSeconds: 20,
        restSeconds: 10,
        intervals: 8,
      }),
    ).toBe('Tabata · 8 × 20 s / 10 s');
    expect(
      circuitSummary({
        type: 'circuit',
        format: 'ROUNDS',
        rounds: 3,
        restBetweenRoundsSeconds: 60,
      }),
    ).toBe('3 rounds · descanso 60 s');
    expect(
      circuitSummary({ type: 'circuit', format: 'FOR_TIME', rounds: 5, timeCapSeconds: 900 }),
    ).toBe('For Time · 5 rounds · limite 15 min');
  });

  it('o que falta no circuito', () => {
    expect(circuitProblem(newCircuitBlock('AMRAP'))).toBe('Adicione um exercício ao circuito.');
    const semDuracao = { ...newCircuitBlock('AMRAP', [ex()]), durationSeconds: undefined };
    expect(circuitProblem(semDuracao)).toMatch(/duração/);
    const emomQuebrado = { ...newCircuitBlock('EMOM', [ex()]), durationSeconds: 90 };
    expect(circuitProblem(emomQuebrado)).toMatch(/minutos inteiros/);
    expect(circuitProblem(newCircuitBlock('TABATA', [ex()]))).toBeNull();
  });

  it('linha do exercício: força e cardio', () => {
    expect(
      exerciseLine({
        targetSets: 4,
        targetReps: '6-8',
        loadMode: 'PERCENT_1RM',
        loadPercent: 75,
        restSeconds: 90,
      }),
    ).toBe('4 × 6-8 · 75% 1RM · 90 s');
    expect(exerciseLine({ targetSets: 3, targetReps: '12', startLoadKg: 40 })).toBe(
      '3 × 12 · 40 kg',
    );
    expect(exerciseLine({ targetSets: 3, targetReps: 'MAX', repUnit: 'MAX' })).toBe('3 × máx.');
    expect(exerciseLine({ targetSets: 2, targetReps: '45', repUnit: 'SECONDS' })).toBe('2 × 45 s');
    expect(
      exerciseLine({ targetSets: 3, targetReps: '10', loadMode: 'BAND', warmupBefore: true }),
    ).toBe('aquec. + 3 × 10 · elástico');
    expect(
      exerciseLine({
        isCardio: true,
        targetSets: 1,
        targetReps: '',
        cardioTarget: 'TIME',
        cardioDurationSeconds: 1800,
        cardioZone: 2,
        cardioInclinePercent: 6,
      }),
    ).toBe('30 min · zona 2 · 6%');
    expect(
      exerciseLine({
        isCardio: true,
        targetSets: 1,
        targetReps: '',
        cardioTarget: 'CALORIES',
        cardioCalories: 300,
        cardioPaceSecondsPerKm: 330,
      }),
    ).toBe('300 kcal · 5:30/km');
    expect(paceText(305)).toBe('5:05/km');
  });

  it('o que impede salvar', () => {
    expect(documentProblems(doc())).toEqual([]);
    const vazia = doc();
    vazia.sessions[1]!.items = [];
    expect(documentProblems(vazia)).toEqual(['A sessão B (Posterior) está vazia.']);
    const diaRepetido = doc();
    diaRepetido.sessions[1]!.weekday = 1;
    expect(documentProblems(diaRepetido)).toEqual(['Duas sessões no mesmo dia da semana.']);
    const repetido = doc();
    repetido.sessions[0]!.items.push(ex());
    expect(documentProblems(repetido)).toEqual([
      'Agachamento livre aparece duas vezes na sessão A.',
    ]);
  });

  it('dias das sessões só quando todas têm dia', () => {
    expect(documentWeekdays(doc())).toEqual([1, 4]);
    const rodizio = doc();
    rodizio.sessions[1]!.weekday = null;
    expect(documentWeekdays(rodizio)).toBeNull();
  });

  it('mover não mexe na lista original', () => {
    const lista = ['a', 'b', 'c'];
    expect(moveItem(lista, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(lista, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(lista, 1, 9)).toEqual(['a', 'b', 'c']);
    expect(lista).toEqual(['a', 'b', 'c']);
  });

  it('documento para a API sem os campos da tela', () => {
    const input = toDocumentInput(doc());
    const primeiro = input.sessions[0]!.items[0]!;
    expect(primeiro).toEqual({
      type: 'exercise',
      exerciseId: 10,
      targetSets: 4,
      targetReps: '6-8',
    });
    const bloco = input.sessions[1]!.items[0]!;
    expect(bloco.type).toBe('circuit');
    expect(JSON.stringify(input)).not.toContain('Burpee');
  });

  it('dica da última série e etiquetas', () => {
    expect(lastSetHint('Ana Lima', { weightKg: 62.5, reps: 8 })).toBe('última da Ana: 62,5 kg × 8');
    expect(lastSetHint('Ana', { weightKg: null, reps: 8 })).toBeNull();
    expect(lastSetHint('Ana', undefined)).toBeNull();
    expect(normalizeTags(['Hipertrofia', ' força ', 'hipertrofia', ''])).toEqual([
      'hipertrofia',
      'força',
    ]);
  });
});

describe('o que mudou com os campos do editor (#406)', () => {
  it('diz cada campo novo em português', () => {
    expect(
      exerciseChangeText([
        { field: 'loadPercent', before: '70', after: '75' },
        { field: 'warmup', before: 'false', after: 'true' },
        { field: 'cardioZone', before: '2', after: '3' },
        { field: 'cardioPace', before: null, after: '330' },
      ]),
    ).toBe('% de 1RM 70% → 75% · aquecimento não → sim · zona 2 → 3 · ritmo — → 5:30/km');
    expect(
      exerciseChangeText([{ field: 'loadMode', before: 'WEIGHT', after: 'PERCENT_1RM' }]),
    ).toBe('carga com peso → % de 1RM');
  });

  it('sessões e circuitos no resumo da versão', () => {
    expect(
      diffSummary({
        added: [],
        removed: [],
        changed: [],
        version: [
          { field: 'sessions', before: '4', after: '3' },
          { field: 'circuits', before: null, after: null },
        ],
      }),
    ).toBe('sessões alteradas · circuito alterado');
  });
});

describe('planCopyApi (#406)', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({}), { status: 200 }));
    configureApiClient({
      resolveUrl: (path) => `http://api${path}`,
      fetch: fetchMock as unknown as typeof globalThis.fetch,
    });
  });
  afterEach(() => resetApiClient());

  it('lê e salva pela ficha da pessoa', async () => {
    await planCopyApi.get('g1', 'm1', 'o1');
    expect(fetchMock.mock.calls[0]![0]).toBe(
      'http://api/api/groups/g1/members/m1/plan-offers/o1/copy',
    );
    await planCopyApi.save('g1', 'm1', 'o1', { document: { sessions: [] }, notify: false });
    const [url, init] = fetchMock.mock.calls[1]!;
    expect(url).toBe('http://api/api/groups/g1/members/m1/plan-offers/o1/copy');
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      document: { sessions: [] },
      notify: false,
    });
  });
});
