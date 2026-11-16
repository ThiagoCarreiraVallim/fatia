import { BadRequestException } from '@nestjs/common';
import { CreateWorkoutPlanTool } from '../mcp/create-workout-plan.tool';
import { LogCircuitResultTool } from '../mcp/log-circuit-result.tool';
import type { WorkoutPlanService } from '../workout-plan.service';
import type { CircuitSessionService } from '../circuit-session.service';

const ctx = { userId: 'user-1' } as Parameters<CreateWorkoutPlanTool['execute']>[1];

describe('create_workout_plan com circuito (#380)', () => {
  const plans = {
    create: jest.fn().mockResolvedValue({ id: 'p1' }),
    createCircuit: jest.fn().mockResolvedValue({ id: 'c1' }),
  };
  const tool = new CreateWorkoutPlanTool(plans as unknown as WorkoutPlanService);

  beforeEach(() => jest.clearAllMocks());

  it('sem circuit, cria o plano de séries de sempre', async () => {
    await tool.execute({ name: 'Push' }, ctx);
    expect(plans.create).toHaveBeenCalledWith('user-1', { name: 'Push' });
    expect(plans.createCircuit).not.toHaveBeenCalled();
  });

  it('com circuit, converte minutos e reps/seconds para o formato da API', async () => {
    await tool.execute(
      {
        name: 'AMRAP 12',
        circuit: { format: 'AMRAP', durationMinutes: 12 },
        exercises: [
          { exerciseId: 42, reps: 15 },
          { exerciseId: 77, seconds: 30 },
        ],
      },
      ctx,
    );
    expect(plans.createCircuit).toHaveBeenCalledWith('user-1', {
      name: 'AMRAP 12',
      format: 'AMRAP',
      durationSeconds: 720,
      exercises: [
        { exerciseId: 42, unit: 'REPS', target: 15 },
        { exerciseId: 77, unit: 'SECONDS', target: 30 },
      ],
    });
  });

  it('recusa exercício com reps e seconds juntos, circuito sem exercícios e exercises sem circuit', () => {
    expect(() =>
      tool.execute(
        {
          name: 'X',
          circuit: { format: 'FOR_TIME', rounds: 3 },
          exercises: [{ exerciseId: 1, reps: 10, seconds: 30 }],
        },
        ctx,
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      tool.execute({ name: 'X', circuit: { format: 'FOR_TIME', rounds: 3 } }, ctx),
    ).toThrow(/pelo menos um exercício/);
    expect(() => tool.execute({ name: 'X', exercises: [{ exerciseId: 1, reps: 5 }] }, ctx)).toThrow(
      /só vale com circuit/,
    );
  });
});

describe('log_circuit_result (#380)', () => {
  it('registra pelo serviço com o userId do contexto, nunca do input', async () => {
    const circuits = { log: jest.fn().mockResolvedValue({ sessionId: 's1' }) };
    const tool = new LogCircuitResultTool(circuits as unknown as CircuitSessionService);
    const input = { planId: '11111111-2222-4333-8444-555555555555', roundsCompleted: 5 };
    await tool.execute(input, ctx);
    expect(circuits.log).toHaveBeenCalledWith('user-1', input);
    expect(tool.annotations).toMatchObject({ readOnlyHint: false, destructiveHint: false });
  });
});
