import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_OPTIONS,
  ONBOARDING_STEPS,
  ageFromBirthDate,
  brDateToIso,
  isoToBrDate,
  maskBrDate,
  bodyFromForm,
  goalsFromForm,
  goalsToForm,
  initialBodyForm,
  type BodyForm,
} from '../onboarding';
import type { MeUser } from '../users';

const HOJE = '2026-10-15';

const ME: MeUser = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Ana',
  role: 'USER',
  timezone: 'America/Sao_Paulo',
  heightCm: 168,
  sex: 'FEMALE',
  birthDate: '1996-03-12T00:00:00.000Z',
  activityLevel: null,
  objective: null,
  onboardedAt: null,
};

const CORPO: BodyForm = {
  sex: 'FEMALE',
  birthDate: '1996-03-12',
  heightCm: '168',
  weightKg: '65,4',
};

const METAS = {
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
};

describe('onboarding', () => {
  it('tem quatro passos, terminando nas metas', () => {
    expect(ONBOARDING_STEPS.map((s) => s.key)).toEqual(['objective', 'body', 'activity', 'goals']);
    expect(ACTIVITY_OPTIONS).toHaveLength(5);
  });

  it('preenche com o perfil e a última pesagem, com vírgula decimal', () => {
    expect(initialBodyForm(ME, 64.5)).toEqual({
      sex: 'FEMALE',
      birthDate: '1996-03-12',
      heightCm: '168',
      weightKg: '64,5',
    });
    expect(initialBodyForm(null)).toEqual({ sex: null, birthDate: '', heightCm: '', weightKg: '' });
  });

  it('idade completa conta o aniversário', () => {
    expect(ageFromBirthDate('1996-10-15', HOJE)).toBe(30);
    expect(ageFromBirthDate('1996-10-16', HOJE)).toBe(29);
  });

  it('converte o corpo, aceitando vírgula', () => {
    expect(bodyFromForm(CORPO, HOJE)).toEqual({
      ok: true,
      body: { sex: 'FEMALE', birthDate: '1996-03-12', heightCm: 168, weightKg: 65.4 },
    });
  });

  it('aponta cada campo com problema', () => {
    const r = bodyFromForm(
      { sex: null, birthDate: '2015-01-01', heightCm: '2,5', weightKg: '' },
      HOJE,
    );
    expect(r).toEqual({
      ok: false,
      errors: {
        sex: 'Escolha uma opção.',
        birthDate: 'A sugestão vale de 16 a 100 anos.',
        heightCm: 'Entre 100 e 250 cm.',
        weightKg: 'Informe o peso.',
      },
    });
  });

  it('recusa nascimento inexistente ou futuro', () => {
    expect(bodyFromForm({ ...CORPO, birthDate: '2000-02-30' }, HOJE)).toMatchObject({
      errors: { birthDate: 'Data inválida.' },
    });
    expect(bodyFromForm({ ...CORPO, birthDate: '2026-10-16' }, HOJE)).toMatchObject({
      errors: { birthDate: 'Data inválida.' },
    });
  });

  it('metas: ida e volta pelo formulário', () => {
    expect(goalsFromForm(goalsToForm(METAS))).toEqual({ ok: true, goals: METAS });
  });

  it('metas: mínimo acima do máximo, decimal e teto', () => {
    const r = goalsFromForm({
      ...goalsToForm(METAS),
      kcalMin: '1900',
      proteinMaxG: '1,5',
      dailyStepsTarget: '100001',
    });
    expect(r).toEqual({
      ok: false,
      errors: {
        kcalMin: 'O mínimo passa do máximo.',
        proteinMaxG: 'Número inteiro.',
        dailyStepsTarget: 'Até 100.000.',
      },
    });
  });

  it('máscara de data brasileira, ida e volta', () => {
    expect(maskBrDate('12')).toBe('12');
    expect(maskBrDate('1203')).toBe('12/03');
    expect(maskBrDate('12/03/1996x9')).toBe('12/03/1996');
    expect(brDateToIso('12/03/1996')).toBe('1996-03-12');
    expect(brDateToIso('12/03')).toBe('12/03');
    expect(isoToBrDate('1996-03-12')).toBe('12/03/1996');
  });
});
