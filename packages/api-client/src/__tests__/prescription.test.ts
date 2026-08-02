import { describe, expect, it } from 'vitest';
import { describePrescription } from '../workout/prescription';
import type { PrescribedSet } from '../workout';

const make = (partial: Partial<PrescribedSet> = {}): PrescribedSet => ({
  status: 'ok',
  weightKg: 62.5,
  reps: 8,
  restSeconds: 90,
  basis: 'rpe',
  action: 'increase_load',
  capped: false,
  ...partial,
});

describe('describePrescription', () => {
  it('mostra carga, repetições e descanso', () => {
    expect(describePrescription(make()).label).toBe('Sugestão: 62.5 kg × 8 · 90s');
  });

  it('escreve carga inteira sem casa decimal', () => {
    expect(describePrescription(make({ weightKg: 60 })).label).toBe('Sugestão: 60 kg × 8 · 90s');
  });

  it('diz que a regra do RPE rodou quando o RPE existia', () => {
    expect(describePrescription(make({ basis: 'rpe', action: 'increase_load' })).reason).toBe(
      'RPE baixo com as reps no topo da faixa',
    );
  });

  it('não credita o RPE quando nenhuma série tinha RPE', () => {
    // O caso que este teste protege: mesma carga sugerida pelos dois caminhos.
    // Sem a distinção no texto, a pessoa passa a confiar num sinal que ela nunca
    // registrou — e o número certo por acaso vira o número certo por engano.
    const semRpe = describePrescription(make({ basis: 'reps', action: 'increase_load' }));
    const comRpe = describePrescription(make({ basis: 'rpe', action: 'increase_load' }));

    expect(semRpe.label).toBe(comRpe.label);
    expect(semRpe.reason).toBe('sem RPE — todas as séries fecharam a faixa');
    expect(semRpe.reason).not.toContain('RPE baixo');
  });

  it('distingue as três ações dentro do mesmo sinal', () => {
    const reasons = (['increase_load', 'increase_reps', 'hold'] as const).map(
      (action) => describePrescription(make({ basis: 'rpe', action })).reason,
    );
    expect(new Set(reasons).size).toBe(3);
  });

  it('não credita RPE alto quando o teto travou um salto pedido por RPE baixo', () => {
    // O caso concreto: 100 / 95 / 92 kg, os três com RPE 6. A regra decidiu
    // subir carga, o teto semanal comeu o salto inteiro e só então a ação virou
    // `hold` — o `basis` continua `rpe` e o RPE registrado foi baixo. Dizer
    // "RPE alto na última sessão" credita à pessoa o sinal oposto ao que ela
    // registrou, que é exatamente o que o `basis` existe para impedir.
    const travado = describePrescription(make({ basis: 'rpe', action: 'hold', capped: true }));

    expect(travado.reason).toBe(
      'RPE baixo com as reps no topo da faixa · no teto — repete a carga',
    );
    expect(travado.reason).not.toContain('RPE alto');

    // E o `hold` que veio mesmo do RPE alto continua dizendo isso: `capped` é o
    // que separa os dois (ver `prescribe-load.ts`).
    expect(describePrescription(make({ basis: 'rpe', action: 'hold', capped: false })).reason).toBe(
      'RPE alto na última sessão',
    );
  });

  it('não credita RPE nenhum ao teto quando não houve RPE', () => {
    expect(describePrescription(make({ basis: 'reps', action: 'hold', capped: true })).reason).toBe(
      'sem RPE — todas as séries fecharam a faixa · no teto — repete a carga',
    );
  });

  it('avisa quando o teto de progressão cortou o salto', () => {
    expect(describePrescription(make({ capped: true })).reason).toContain('no teto');
    expect(describePrescription(make({ capped: false })).reason).not.toContain('no teto');
  });
});
