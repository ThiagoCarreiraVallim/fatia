import { assertGoalsValid } from '../user-goals.service';
import { ageOn, profileProblem, suggestGoals, type SuggestionProfile } from '../goal-suggestion';

const HOJE = '2026-10-15';

const ANA: SuggestionProfile = {
  sex: 'FEMALE',
  birthDate: '1996-03-12', // 30 anos
  heightCm: 168,
  weightKg: 65,
  activityLevel: 'MODERATE',
  objective: 'LOSE',
};

describe('ageOn', () => {
  it.each([
    ['1996-10-15', 30],
    ['1996-10-16', 29],
    ['1996-03-12', 30],
    ['2000-02-29', 26],
  ])('nascido em %s tem %i anos em 2026-10-15', (nascimento, idade) => {
    expect(ageOn(nascimento, HOJE)).toBe(idade);
  });
});

describe('suggestGoals', () => {
  it('mulher de 30 anos, 168 cm, 65 kg, moderada, perdendo peso', () => {
    const s = suggestGoals(ANA, HOJE);
    // 10·65 + 6,25·168 − 5·30 − 161 = 1389; × 1,55 = 2153; −20% = 1722 → 1720.
    expect(s).toMatchObject({ age: 30, bmr: 1389, tdee: 2153, targetKcal: 1720 });
    expect(s.goals).toEqual({
      kcalMin: 1650,
      kcalMax: 1800,
      proteinMinG: 117,
      proteinMaxG: 143,
      carbsMinG: 119,
      carbsMaxG: 225,
      fatMinG: 48,
      fatMaxG: 67,
      weeklyWorkouts: 4,
      dailyStepsTarget: 9000,
      dailyWaterTargetMl: 2250,
    });
  });

  it('homem mantendo o peso usa +5 na fórmula e não ajusta as kcal', () => {
    const s = suggestGoals(
      { ...ANA, sex: 'MALE', weightKg: 80, heightCm: 180, objective: 'MAINTAIN' },
      HOJE,
    );
    // 800 + 1125 − 150 + 5 = 1780; × 1,55 = 2759 → 2760.
    expect(s).toMatchObject({ bmr: 1780, tdee: 2759, targetKcal: 2760 });
    expect(s.goals.proteinMinG).toBe(112); // 1,4 g/kg
  });

  it('ganho soma 10%, no máximo 400 kcal', () => {
    const pouco = suggestGoals({ ...ANA, objective: 'GAIN' }, HOJE);
    expect(pouco.targetKcal).toBe(2370); // 2153 + 215
    const muito = suggestGoals(
      {
        ...ANA,
        sex: 'MALE',
        weightKg: 120,
        heightCm: 195,
        activityLevel: 'VERY_ACTIVE',
        objective: 'GAIN',
      },
      HOJE,
    );
    expect(muito.targetKcal).toBe(round10(muito.tdee + 400));
  });

  it('déficit tem teto de 750 kcal', () => {
    const s = suggestGoals(
      { ...ANA, sex: 'MALE', weightKg: 150, heightCm: 190, activityLevel: 'ACTIVE' },
      HOJE,
    );
    expect(s.targetKcal).toBe(round10(s.tdee - 750));
  });

  it('nunca sugere abaixo do piso (1.200 kcal para mulher)', () => {
    const s = suggestGoals(
      { ...ANA, weightKg: 42, heightCm: 150, birthDate: '1946-01-01', activityLevel: 'SEDENTARY' },
      HOJE,
    );
    expect(s.targetKcal).toBe(1200);
    expect(s.goals.kcalMin).toBe(1200);
  });

  it('a sugestão sempre passa na validação de metas', () => {
    const perfis: SuggestionProfile[] = [];
    for (const sex of ['FEMALE', 'MALE'] as const)
      for (const activityLevel of [
        'SEDENTARY',
        'LIGHT',
        'MODERATE',
        'ACTIVE',
        'VERY_ACTIVE',
      ] as const)
        for (const objective of ['LOSE', 'MAINTAIN', 'GAIN'] as const)
          for (const weightKg of [30, 70, 300])
            perfis.push({
              ...ANA,
              sex,
              activityLevel,
              objective,
              weightKg,
              heightCm: weightKg === 30 ? 100 : 250,
            });
    for (const p of perfis) {
      const { goals } = suggestGoals(p, HOJE);
      expect(() => assertGoalsValid(goals)).not.toThrow();
    }
  });
});

describe('profileProblem', () => {
  it('aceita o perfil completo', () => {
    expect(profileProblem(ANA, HOJE)).toBeNull();
  });

  it.each<[string, Partial<SuggestionProfile>, RegExp]>([
    ['nascimento inexistente', { birthDate: '2000-02-30' }, /nascimento/],
    ['nascimento no futuro', { birthDate: '2026-10-16' }, /nascimento/],
    ['menor de 16', { birthDate: '2011-01-01' }, /16 a 100 anos/],
    ['altura fora', { heightCm: 99 }, /altura/],
    ['peso fora', { weightKg: 301 }, /peso/],
  ])('recusa %s', (_caso, campos, mensagem) => {
    expect(profileProblem({ ...ANA, ...campos }, HOJE)).toMatch(mensagem);
  });
});

function round10(n: number) {
  return Math.round(n / 10) * 10;
}
