import { BadRequestException } from '@nestjs/common';
import { MuscleSummaryService } from '../muscle-summary.service';

/**
 * `GET /workout/week?date=` (#479): o regex do DTO deixa passar dia que não
 * existe (mês 13, mês 00) e ano que estoura o calendário (`9999-12-31` termina
 * a semana no ano 10000). Isso virava `RangeError` e 500; tem de ser 400.
 */
const prisma = {
  workoutSession: { findMany: jest.fn(async () => []) },
  userGoals: { findUnique: jest.fn(async () => null) },
};
const service = new MuscleSummaryService(prisma as never);
const TZ = 'America/Sao_Paulo';

describe('a semana de um dia qualquer: a data pedida (#479)', () => {
  it.each(['2026-13-01', '2026-00-10', '2026-02-30', '9999-12-31', '0001-01-01', '1899-12-31'])(
    '%s é recusada com 400, sem consultar o banco',
    async (date) => {
      await expect(service.trainingWeek('user-a', TZ, date)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.workoutSession.findMany).not.toHaveBeenCalled();
    },
  );

  it('um dia comum responde a semana dele', async () => {
    const week = await service.trainingWeek('user-a', TZ, '2026-11-25');
    expect(week.start).toBe('2026-11-23');
    expect(week.days).toHaveLength(7);
  });
});
