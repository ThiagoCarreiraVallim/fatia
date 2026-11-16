import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AgendaService } from '../agenda.service';
import { addDaysIso, dayBoundsInTz, todayInTz } from '../../progress/helpers/date-tz';

/**
 * A agenda de treinos do aluno (#379, Al-T24, ADR 042), no Postgres real:
 * informativa, sem reserva nem presença. "Feito" sai do treino concluído,
 * "não feito" do dia que passou sem treino, e "Remarcar" vai de hoje ao fim do
 * plano.
 */
describe('agenda de treinos (integração)', () => {
  const prisma = new PrismaService();
  const agenda = new AgendaService(prisma);
  const TZ = 'America/Sao_Paulo';
  const today = todayInTz(TZ);
  const stamp = `agenda-${Date.now()}`;
  const criados: string[] = [];
  let n = 0;

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: {
        logtoSub: `${stamp}-${n}`,
        email: `${stamp}-${n}@test.local`,
        name: nome,
        timezone: TZ,
      },
    });
    criados.push(user.id);
    return user.id;
  }

  /** Uma oferta aceita de calendário, como o aceite grava (sem passar pelo aceite). */
  async function planoDeCalendario(
    userId: string,
    nome: string,
    startDate: string,
    weeks: number,
    datas: string[],
  ) {
    const offer = await prisma.planOffer.create({
      data: {
        userId,
        versions: {
          create: {
            version: 1,
            status: 'ACCEPTED',
            title: nome,
            snapshot: {},
            snapshotVersion: 1,
            schedule: 'CALENDAR',
            startDate,
            weeks,
            weekdays: [1, 2, 3, 4, 5, 6, 7],
          },
        },
      },
      include: { versions: true },
    });
    const plan = await prisma.workoutPlan.create({
      data: { userId, name: nome, fromOfferId: offer.id },
    });
    await prisma.plannedSession.createMany({
      data: datas.map((date, i) => ({
        userId,
        planId: plan.id,
        date,
        order: i + 1,
        offerVersionId: offer.versions[0]!.id,
      })),
    });
    return plan.id;
  }

  async function treinoFeito(userId: string, planId: string, date: string) {
    const { start } = dayBoundsInTz(date, TZ);
    const startedAt = new Date(start.getTime() + 18 * 3600_000);
    await prisma.workoutSession.create({
      data: {
        userId,
        planId,
        startedAt,
        completedAt: new Date(startedAt.getTime() + 45 * 60_000),
      },
    });
  }

  const ids = { ana: '', bia: '', vazia: '', terminou: '' };
  let planAna = '';
  let planBia = '';

  beforeAll(async () => {
    await prisma.$connect();
    ids.ana = await pessoa('Ana');
    ids.bia = await pessoa('Bia');
    ids.vazia = await pessoa('Vazia');
    ids.terminou = await pessoa('Terminou');
    const start = addDaysIso(today, -3);
    planAna = await planoDeCalendario(ids.ana, 'Inferior', start, 2, [
      addDaysIso(today, -2),
      addDaysIso(today, -1),
      today,
      addDaysIso(today, 2),
    ]);
    await treinoFeito(ids.ana, planAna, addDaysIso(today, -2));
    planBia = await planoDeCalendario(ids.bia, 'Superior', start, 2, [addDaysIso(today, -1)]);

    const longe = addDaysIso(today, -40);
    const fim = await planoDeCalendario(ids.terminou, 'Hipertrofia A/B', longe, 4, [
      addDaysIso(longe, 1),
      addDaysIso(longe, 3),
    ]);
    await treinoFeito(ids.terminou, fim, addDaysIso(longe, 1));
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('os dias trazem feito, não feito, hoje e planejado, só da própria pessoa', async () => {
    const view = await agenda.range(ids.ana, TZ, addDaysIso(today, -3), addDaysIso(today, 3));
    const estados = view.days.flatMap((d) => d.items.map((i) => [d.date, i.state]));
    expect(estados).toEqual([
      [addDaysIso(today, -2), 'done'],
      [addDaysIso(today, -1), 'missed'],
      [today, 'today'],
      [addDaysIso(today, 2), 'planned'],
    ]);
    expect(view.days).toHaveLength(7);
    expect(view.calendarPlan).toMatchObject({
      planId: planAna,
      planName: 'Inferior',
      weeksTotal: 2,
    });
    expect(view.empty).toBe(false);
    // Só quem não fez pode remarcar; e o feito não oferece nada.
    const missed = view.days.flatMap((d) => d.items).find((i) => i.state === 'missed')!;
    expect(missed.canReschedule).toBe(true);
  });

  it('sem plano de calendário: estado vazio', async () => {
    const view = await agenda.range(ids.vazia, TZ);
    expect(view).toMatchObject({ empty: true, calendarPlan: null, ended: null });
    expect(view.days).toHaveLength(7);
    expect(view.from <= today && today <= view.to).toBe(true);
  });

  it('plano que terminou: quantas sessões de quantas, em quantas semanas', async () => {
    const view = await agenda.range(ids.terminou, TZ);
    expect(view.ended).toMatchObject({ planName: 'Hipertrofia A/B', done: 1, total: 2, weeks: 4 });
    expect(view.empty).toBe(false);
  });

  it('plano flexível: só a próxima sessão, hoje', async () => {
    const offer = await prisma.planOffer.create({
      data: {
        userId: ids.vazia,
        versions: {
          create: {
            version: 1,
            status: 'ACCEPTED',
            title: 'Push',
            snapshot: {},
            snapshotVersion: 1,
            schedule: 'FLEXIBLE',
          },
        },
      },
    });
    const plan = await prisma.workoutPlan.create({
      data: { userId: ids.vazia, name: 'Push', fromOfferId: offer.id },
    });
    const view = await agenda.range(ids.vazia, TZ);
    const hoje = view.days.find((d) => d.date === today)!;
    expect(hoje.items).toEqual([
      expect.objectContaining({ kind: 'next', planId: plan.id, planName: 'Push', state: 'today' }),
    ]);
    expect(view.flexible).toEqual([{ planId: plan.id, planName: 'Push' }]);
    expect(view.empty).toBe(false);
  });

  describe('Remarcar', () => {
    it('move para qualquer dia de hoje ao fim do plano e guarda o dia de antes', async () => {
      const view = await agenda.range(ids.ana, TZ, addDaysIso(today, -3), addDaysIso(today, 3));
      const missed = view.days.flatMap((d) => d.items).find((i) => i.state === 'missed')!;
      const fim = addDaysIso(addDaysIso(today, -3), 13);
      const moved = await agenda.reschedule(ids.ana, TZ, missed.id, fim);
      expect(moved).toMatchObject({ date: fim, rescheduledFrom: addDaysIso(today, -1) });
      const row = await prisma.plannedSession.findUniqueOrThrow({ where: { id: missed.id } });
      expect(row).toMatchObject({ status: 'RESCHEDULED', originalDate: addDaysIso(today, -1) });
    });

    it('nunca depois do fim do plano, nem antes de hoje', async () => {
      const row = await prisma.plannedSession.findFirstOrThrow({
        where: { planId: planAna, date: addDaysIso(today, 2) },
      });
      await expect(
        agenda.reschedule(ids.ana, TZ, row.id, addDaysIso(addDaysIso(today, -3), 14)),
      ).rejects.toThrow(BadRequestException);
      await expect(agenda.reschedule(ids.ana, TZ, row.id, addDaysIso(today, -1))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('o fim é o da versão aceita agora, não o da versão que gerou a sessão', async () => {
      // A v1 (2 semanas) gerou a sessão de ontem; a v2 aceita depois vai a 4 semanas.
      const userId = await pessoa('Troca');
      const start = addDaysIso(today, -3);
      const planId = await planoDeCalendario(userId, 'Força', start, 2, [addDaysIso(today, -1)]);
      const offer = await prisma.planOffer.findFirstOrThrow({ where: { userId } });
      await prisma.planOfferVersion.updateMany({
        where: { offerId: offer.id },
        data: { status: 'SUPERSEDED' },
      });
      await prisma.planOfferVersion.create({
        data: {
          offerId: offer.id,
          version: 2,
          status: 'ACCEPTED',
          title: 'Força',
          snapshot: {},
          snapshotVersion: 1,
          schedule: 'CALENDAR',
          startDate: start,
          weeks: 4,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
        },
      });
      const row = await prisma.plannedSession.findFirstOrThrow({ where: { planId } });
      const depoisDaV1 = addDaysIso(start, 20);
      const moved = await agenda.reschedule(userId, TZ, row.id, depoisDaV1);
      expect(moved).toMatchObject({ date: depoisDaV1, endDate: addDaysIso(start, 27) });
      await expect(agenda.reschedule(userId, TZ, row.id, addDaysIso(start, 28))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('plano que virou flexível, ou sem versão aceita, não remarca', async () => {
      const userId = await pessoa('Flex');
      const start = addDaysIso(today, -3);
      const planId = await planoDeCalendario(userId, 'Solto', start, 2, [addDaysIso(today, 1)]);
      const offer = await prisma.planOffer.findFirstOrThrow({ where: { userId } });
      await prisma.planOfferVersion.updateMany({
        where: { offerId: offer.id },
        data: { status: 'SUPERSEDED' },
      });
      const row = await prisma.plannedSession.findFirstOrThrow({ where: { planId } });
      // Sem versão aceita.
      await expect(agenda.reschedule(userId, TZ, row.id, today)).rejects.toThrow(ConflictException);
      await prisma.planOfferVersion.create({
        data: {
          offerId: offer.id,
          version: 2,
          status: 'ACCEPTED',
          title: 'Solto',
          snapshot: {},
          snapshotVersion: 1,
          schedule: 'FLEXIBLE',
        },
      });
      await expect(agenda.reschedule(userId, TZ, row.id, today)).rejects.toThrow(ConflictException);
      const view = await agenda.range(userId, TZ, today, addDaysIso(today, 3));
      const item = view.days.flatMap((d) => d.items).find((i) => i.id === row.id)!;
      expect(item).toMatchObject({ state: 'planned', canReschedule: false });
    });

    it('com duas versões aceitas, vale o fim da de maior número', async () => {
      const userId = await pessoa('Duas');
      const start = addDaysIso(today, -3);
      const planId = await planoDeCalendario(userId, 'Dupla', start, 2, [addDaysIso(today, 1)]);
      const offer = await prisma.planOffer.findFirstOrThrow({ where: { userId } });
      await prisma.planOfferVersion.create({
        data: {
          offerId: offer.id,
          version: 2,
          status: 'ACCEPTED',
          title: 'Dupla',
          snapshot: {},
          snapshotVersion: 1,
          schedule: 'CALENDAR',
          startDate: start,
          weeks: 3,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
        },
      });
      const view = await agenda.range(userId, TZ, today, addDaysIso(today, 3));
      expect(view.calendarPlan).toMatchObject({ planId, weeksTotal: 3 });
    });

    it('sessão já feita não remarca (409)', async () => {
      const feita = await prisma.plannedSession.findFirstOrThrow({
        where: { planId: planAna, date: addDaysIso(today, -2) },
      });
      await expect(agenda.reschedule(ids.ana, TZ, feita.id, today)).rejects.toThrow(
        ConflictException,
      );
      const row = await prisma.plannedSession.findUniqueOrThrow({ where: { id: feita.id } });
      expect(row).toMatchObject({ date: addDaysIso(today, -2), status: 'PLANNED' });
    });

    it('sessão de outra pessoa responde como inexistente', async () => {
      const daBia = await prisma.plannedSession.findFirstOrThrow({ where: { planId: planBia } });
      await expect(agenda.reschedule(ids.ana, TZ, daBia.id, today)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  it('recusa intervalo invertido ou maior que seis semanas', async () => {
    await expect(agenda.range(ids.ana, TZ, today, addDaysIso(today, -1))).rejects.toThrow(
      BadRequestException,
    );
    await expect(agenda.range(ids.ana, TZ, today, addDaysIso(today, 42))).rejects.toThrow(
      BadRequestException,
    );
  });
});
