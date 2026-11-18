import {
  currentStreak,
  dayPoints,
  parsePointsTable,
  stepDays,
  waterDays,
  type StepEntry,
  type WaterEntry,
} from '../challenge-days';

const SP = 'America/Sao_Paulo';
/** Meia-noite de SP em UTC é 03:00Z; prazo do dia = virada + 3 h. */
const at = (iso: string) => new Date(iso);

describe('dias e pontos dos desafios do redesign (#395)', () => {
  describe('dayPoints', () => {
    it('foto, água, passos e nutrição valem 1 por dia; pontos somam a tabela com teto', () => {
      expect(dayPoints('PHOTO', new Set(['workout']), {}, 6, 'WORKOUT_SESSIONS')).toBe(1);
      expect(dayPoints('PHOTO', new Set(['water']), {}, 6, 'WORKOUT_SESSIONS')).toBe(0);
      expect(dayPoints('WATER', new Set(['water']), {}, 6, 'WATER_ML')).toBe(1);
      expect(dayPoints('STEPS', new Set(['steps']), {}, 6, 'STEPS')).toBe(1);
      expect(dayPoints('NUTRITION', new Set(['protein']), {}, 6, 'PROTEIN_TARGET_DAYS')).toBe(1);
      expect(dayPoints('NUTRITION', new Set(['protein']), {}, 6, 'KCAL_IN_RANGE_DAYS')).toBe(0);
      expect(dayPoints('NUTRITION', new Set(['kcal']), {}, 6, 'KCAL_IN_RANGE_DAYS')).toBe(1);
      const tabela = { workout: 3, water: 1, steps: 1, protein: 1 };
      expect(dayPoints('POINTS', new Set(['water', 'steps']), tabela, 6, 'ACTIVE_DAYS')).toBe(2);
      expect(
        dayPoints(
          'POINTS',
          new Set(['workout', 'water', 'steps', 'protein', 'kcal']),
          { ...tabela, kcal: 2 },
          6,
          'ACTIVE_DAYS',
        ),
      ).toBe(6);
    });
  });

  describe('parsePointsTable', () => {
    it('aceita só os itens conhecidos, inteiros de 0 a 5', () => {
      expect(
        parsePointsTable({ workout: 3, water: 1, steps: 9, protein: -1, kcal: 1.5, peso: 2 }),
      ).toEqual({ workout: 3, water: 1 });
      expect(parsePointsTable(null)).toEqual({});
      expect(parsePointsTable('x')).toEqual({});
    });
  });

  describe('currentStreak', () => {
    const dias = new Set(['2026-11-02', '2026-11-03', '2026-11-04']);
    it('conta até hoje, ou até ontem se hoje ainda não pontuou', () => {
      expect(currentStreak(dias, '2026-11-01', '2026-11-30', '2026-11-04')).toBe(3);
      expect(currentStreak(dias, '2026-11-01', '2026-11-30', '2026-11-05')).toBe(3);
      expect(currentStreak(dias, '2026-11-01', '2026-11-30', '2026-11-06')).toBe(0);
    });
    it('desafio encerrado conta a partir do último dia', () => {
      expect(currentStreak(dias, '2026-11-01', '2026-11-04', '2026-12-10')).toBe(3);
    });
  });

  describe('waterDays', () => {
    const base = { goal: 2500, cap: 4000, timezone: SP };
    it('o dia bate a meta pela soma; registro depois das 3 h do dia seguinte não entra', () => {
      const logs: WaterEntry[] = [
        { date: '2026-11-02', ml: 1500, loggedAt: at('2026-11-02T15:00:00Z') },
        { date: '2026-11-02', ml: 1000, loggedAt: at('2026-11-02T20:00:00Z') },
        { date: '2026-11-03', ml: 2000, loggedAt: at('2026-11-03T15:00:00Z') },
        // Lançado no dia 03 às 07:00 de SP, depois do prazo (03 às 03:00 de SP).
        { date: '2026-11-02', ml: 800, loggedAt: at('2026-11-03T10:00:00Z') },
        { date: '2026-11-03', ml: 500, loggedAt: at('2026-11-04T05:59:00Z') },
      ];
      expect([...waterDays(logs, base).met].sort()).toEqual(['2026-11-02', '2026-11-03']);
    });

    it('a meta de uma vez perto da meia-noite em 3 dias ou mais vai para revisão', () => {
      const tarde = (d: string): WaterEntry => ({
        date: d,
        ml: 2500,
        // 23:40 de SP = 02:40Z do dia seguinte.
        loggedAt: new Date(new Date(`${d}T02:40:00Z`).getTime() + 86_400_000),
      });
      const dois = waterDays([tarde('2026-11-02'), tarde('2026-11-03')], base);
      expect(dois.suspicious.size).toBe(0);
      const tres = waterDays([tarde('2026-11-02'), tarde('2026-11-03'), tarde('2026-11-04')], base);
      expect([...tres.suspicious.keys()].sort()).toEqual([
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
      ]);
      // O motivo não leva o volume de ninguém.
      for (const motivo of tres.suspicious.values()) expect(motivo).not.toMatch(/\d/);
    });
  });

  describe('stepDays', () => {
    const base = { goal: 10_000, allowed: [] as StepEntry['source'][], timezone: SP };
    it('vale o maior do dia, só de fonte aceita; digitado à mão nunca conta', () => {
      const logs: StepEntry[] = [
        { date: '2026-11-02', steps: 12_000, source: 'MANUAL', loggedAt: at('2026-11-02T20:00Z') },
        {
          date: '2026-11-03',
          steps: 10_500,
          source: 'APPLE_HEALTH',
          loggedAt: at('2026-11-03T20:00Z'),
        },
        { date: '2026-11-04', steps: 11_000, source: 'GARMIN', loggedAt: at('2026-11-04T20:00Z') },
      ];
      expect([...stepDays(logs, base).met].sort()).toEqual(['2026-11-03', '2026-11-04']);
      expect(
        [...stepDays(logs, { ...base, allowed: ['APPLE_HEALTH', 'MANUAL'] }).met].sort(),
      ).toEqual(['2026-11-03']);
    });

    it('salto de 10 mil passos em até 15 minutos vai para revisão', () => {
      const logs: StepEntry[] = [
        {
          date: '2026-11-03',
          steps: 2_000,
          source: 'HEALTH_CONNECT',
          loggedAt: at('2026-11-03T13:00Z'),
        },
        {
          date: '2026-11-03',
          steps: 15_200,
          source: 'HEALTH_CONNECT',
          loggedAt: at('2026-11-03T13:12Z'),
        },
      ];
      const r = stepDays(logs, base);
      expect([...r.met]).toEqual(['2026-11-03']);
      expect([...r.suspicious.keys()]).toEqual(['2026-11-03']);
      for (const motivo of r.suspicious.values()) expect(motivo).not.toMatch(/\d/);
    });
  });
});
