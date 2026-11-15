import { describe, expect, it } from 'vitest';
import {
  dailyGoalTarget,
  dailyGoalVisual,
  personalGoalProgress,
  dayShareCard,
  dayShareMessage,
  dailyGoalValue,
  goalsChipLabel,
  nextWorkoutDetail,
  signedKg,
  stepsTargetShort,
  waterAddedToast,
  waterLeftLabel,
  weightChange30dLabel,
  weightDeltaSinceLabel,
  weightSparkPath,
  WATER_GLASS_ML,
} from '../today-copy';
import type { DailyGoal } from '../progress';

const goal = (over: Partial<DailyGoal>): DailyGoal => ({
  key: 'kcal',
  label: 'Calorias',
  unit: 'kcal',
  current: 0,
  min: null,
  max: null,
  met: false,
  percent: 0,
  ...over,
});

describe('Hoje (Al-H1/H3/H4/H5)', () => {
  it('chip de metas: "Metas 2/5"', () => {
    expect(goalsChipLabel(2, 5)).toBe('Metas 2/5');
  });

  it('valor de cada meta como a prancha escreve', () => {
    expect(dailyGoalValue(goal({ current: 934.4, min: 1800, max: 2200 }))).toBe(
      '934 / 1.800–2.200',
    );
    expect(
      dailyGoalValue(goal({ key: 'protein', unit: 'g', current: 71.2, min: 120, max: 160 })),
    ).toBe('71 / 120–160 g');
    expect(dailyGoalValue(goal({ key: 'water', unit: 'mL', current: 800, min: 2500 }))).toBe(
      '0,8 / 2,5 L',
    );
    expect(dailyGoalValue(goal({ key: 'steps', unit: 'passos', current: 4231, min: 8000 }))).toBe(
      '4.231 / 8.000',
    );
    expect(
      dailyGoalValue(
        goal({ key: 'workout', unit: '', current: 1, min: 1, met: true, planName: 'Legs' }),
      ),
    ).toBe('Legs · feito');
    expect(
      dailyGoalValue(goal({ key: 'workout', unit: '', current: 0, min: 1, planName: null })),
    ).toBe('a fazer');
    expect(dailyGoalValue(goal({ key: 'nutrient:fiber_g', unit: 'g', current: 14, min: 25 }))).toBe(
      '14 / mín 25 g',
    );
    expect(
      dailyGoalValue(goal({ key: 'nutrient:sodium_mg', unit: 'mg', current: 1240, max: 2000 })),
    ).toBe('1.240 / máx 2.000 mg');
  });

  it('ícone e tom de cada meta, como na prancha', () => {
    expect(dailyGoalVisual(goal({ key: 'kcal' }))).toEqual({ icon: 'flame', tone: 'lime' });
    expect(dailyGoalVisual(goal({ key: 'protein' }))).toEqual({ icon: 'apple', tone: 'blue' });
    expect(dailyGoalVisual(goal({ key: 'water' }))).toEqual({ icon: 'drop', tone: 'water' });
    expect(dailyGoalVisual(goal({ key: 'steps' }))).toEqual({ icon: 'steps', tone: 'amber' });
    expect(dailyGoalVisual(goal({ key: 'workout' }))).toEqual({ icon: 'dumbbell', tone: 'lime' });
    // Nutriente: verde quando batida, azul enquanto não.
    expect(dailyGoalVisual(goal({ key: 'nutrient:fiber_g' }))).toEqual({
      icon: 'sliders',
      tone: 'blue',
    });
    expect(dailyGoalVisual(goal({ key: 'nutrient:sodium_mg', met: true }))).toEqual({
      icon: 'sliders',
      tone: 'lime',
    });
  });

  it('meta pessoal no cartão do Hoje: quanto falta ou a contagem', () => {
    expect(
      personalGoalProgress({
        kind: 'weight',
        unit: 'kg',
        targetValue: 68,
        currentValue: 70.2,
        progressPercent: 53,
      }),
    ).toEqual({ text: '70,2 kg · faltam 2,2', percent: 53 });
    expect(
      personalGoalProgress({
        kind: 'workout_frequency',
        unit: 'treinos',
        targetValue: 4,
        currentValue: 3,
        progressPercent: 75,
      }),
    ).toEqual({ text: '3/4 na semana', percent: 75 });
    expect(
      personalGoalProgress({
        kind: 'custom',
        unit: 'livros',
        targetValue: 12,
        currentValue: null,
        progressPercent: null,
      }),
    ).toEqual({ text: 'meta 12 livros', percent: 0 });
    expect(
      personalGoalProgress({
        kind: 'weight',
        unit: 'kg',
        targetValue: 68,
        currentValue: 68,
        progressPercent: 100,
      }),
    ).toEqual({ text: '68,0 kg · meta batida', percent: 100 });
  });

  it('cada meta leva à tela dela; a água abre a folha de água', () => {
    expect(dailyGoalTarget('kcal')).toEqual({ kind: 'route', href: '/nutrition' });
    expect(dailyGoalTarget('protein')).toEqual({ kind: 'route', href: '/nutrition' });
    expect(dailyGoalTarget('water')).toEqual({ kind: 'water' });
    expect(dailyGoalTarget('steps')).toEqual({ kind: 'steps' });
    expect(dailyGoalTarget('workout')).toEqual({ kind: 'route', href: '/workout/history' });
    expect(dailyGoalTarget('nutrient:fiber_g')).toEqual({
      kind: 'route',
      href: '/nutrition/nutrient-targets',
    });
  });

  it('água: quanto falta em copos de 250 mL, ou meta batida', () => {
    expect(WATER_GLASS_ML).toBe(250);
    expect(waterLeftLabel(800, 2500)).toBe('faltam 7 copos');
    expect(waterLeftLabel(2300, 2500)).toBe('falta 1 copo');
    expect(waterLeftLabel(2500, 2500)).toBe('meta batida');
    expect(waterAddedToast(250, 1050)).toBe('+250 mL · 1.050 mL hoje');
  });

  it('passos: "/8 mil"', () => {
    expect(stepsTargetShort(8000)).toBe('/8 mil');
    expect(stepsTargetShort(7500)).toBe('/7,5 mil');
    expect(stepsTargetShort(900)).toBe('/900');
  });

  it('peso: sinal tipográfico, variação de 30 dias e desde o último registro', () => {
    expect(signedKg(-2.5)).toBe('−2,5');
    expect(signedKg(0.3)).toBe('+0,3');
    expect(signedKg(0)).toBe('0,0');
    expect(weightChange30dLabel(-2.5)).toBe('−2,5 em 30 dias');
    expect(weightChange30dLabel(null)).toBeNull();
    // 2026-11-13 é sexta; hoje é sábado, 14.
    expect(weightDeltaSinceLabel(-0.2, '2026-11-13', '2026-11-14')).toBe('−0,2 desde ontem');
    expect(weightDeltaSinceLabel(-0.2, '2026-11-11', '2026-11-14')).toBe('−0,2 desde quarta');
    expect(weightDeltaSinceLabel(0.4, '2026-10-30', '2026-11-14')).toBe('+0,4 desde 30 out');
    expect(weightDeltaSinceLabel(0.1, '2026-11-14', '2026-11-14')).toBe('+0,1 desde hoje cedo');
  });

  it('próximo treino: "6 exercícios"', () => {
    expect(nextWorkoutDetail(6)).toBe('6 exercícios');
    expect(nextWorkoutDetail(1)).toBe('1 exercício');
    expect(nextWorkoutDetail(null)).toBeNull();
  });

  it('mini-gráfico de 30 dias: caminho que cabe na caixa, mais alto = mais pesado', () => {
    expect(weightSparkPath([], 300, 60)).toBe('');
    const path = weightSparkPath([72.7, 71, 70.2], 300, 60);
    expect(path).toBe('M0 6 L150 38.6 L300 54');
    // Um ponto só vira uma linha reta no meio.
    expect(weightSparkPath([70], 300, 60)).toBe('M0 30 L300 30');
  });

  it('"Compartilhar meu dia": metas batidas e hábitos, nunca peso nem comida', () => {
    const card = dayShareCard({
      dailyGoals: { met: 2, total: 5 },
      water: { todayMl: 1250 },
      steps: { today: 4231 },
      streakDays: 12,
    });
    expect(card).toEqual({
      kind: 'day',
      headline: '2 de 5',
      caption: 'Metas de hoje batidas',
      stats: [
        { label: 'Água', value: '1,3 L' },
        { label: 'Passos', value: '4.231' },
        { label: 'Sequência', value: '12 dias' },
      ],
    });
    expect(JSON.stringify(card)).not.toMatch(/kg|kcal/);
    expect(dayShareMessage(card, 'Ana')).toBe(
      'Ana · Metas de hoje batidas: 2 de 5 · Água 1,3 L · Passos 4.231 · Sequência 12 dias — fatia',
    );
    expect(dayShareMessage(card, null)).toMatch(/^Metas de hoje batidas: 2 de 5/);
  });
});
