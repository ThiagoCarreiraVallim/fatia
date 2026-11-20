import { z } from 'zod';
import { planExerciseConfigShape } from '../mcp/plan-exercise-config.schema';

/**
 * Paridade com o REST (ADR 006): os campos do editor da equipe (#406) que o
 * plano da pessoa aceita chegam também por `add_exercise_to_plan` e
 * `update_plan_exercise`. Sem eles no schema, o Zod os descartaria calado.
 */
describe('configuração do exercício no MCP (#406)', () => {
  const schema = z.object(planExerciseConfigShape);

  it('aceita % de 1RM, aquecimento e os campos novos de cardio', () => {
    const entrada = {
      loadMode: 'PERCENT_1RM',
      loadPercent: 75,
      warmupBefore: true,
      repUnit: 'MAX',
      cardioTarget: 'CALORIES',
      cardioCalories: 300,
      cardioInclinePercent: 4.5,
      cardioZone: 2,
      cardioPaceSecondsPerKm: 330,
      cardioRpe: 7,
    };
    expect(schema.parse(entrada)).toEqual(entrada);
  });

  it('recusa valores fora da faixa', () => {
    expect(() => schema.parse({ cardioZone: 6 })).toThrow();
    expect(() => schema.parse({ loadPercent: 0 })).toThrow();
    expect(() => schema.parse({ cardioRpe: 11 })).toThrow();
  });
});
