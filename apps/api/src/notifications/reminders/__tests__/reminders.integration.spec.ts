import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MealType, ReminderKind, ReminderMode } from '@fatia/db';
import { PrismaService } from '../../../common/prisma.service';
import type { Notice, NotificationService } from '../../notification.service';
import { ReminderJob } from '../reminder-job.service';
import { ReminderService, type ReminderInput } from '../reminder.service';

/**
 * Lembretes pessoais (#389) no Postgres real: o CRUD amarrado ao dono, as
 * regras de cada modo e o envio pelo servidor — só do que ainda não foi feito,
 * fora do silêncio noturno, no fuso da pessoa e com teto por dia.
 */
describe('lembretes pessoais (integração)', () => {
  const prisma = new PrismaService();
  const enviados: { userId: string; notice: Notice }[] = [];
  const notifications = {
    notify: (ids: string[], notice: Notice) => {
      for (const userId of ids) enviados.push({ userId, notice });
    },
  } as unknown as NotificationService;
  const reminders = new ReminderService(prisma);
  const job = new ReminderJob(prisma, notifications);

  const stamp = `lembrete${Date.now()}`;
  const criados: string[] = [];
  let n = 0;

  /** Segunda-feira, 2026-11-16, no horário de São Paulo (UTC−3). */
  const segunda = (hhmm: string, seg = 20) => {
    const [h, m] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(2026, 10, 16, h! + 3, m!, seg));
  };

  async function pessoa() {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: `P ${n}` },
    });
    criados.push(user.id);
    return user.id;
  }

  const almoco: ReminderInput = {
    kind: ReminderKind.MEAL,
    mode: ReminderMode.TIMES,
    times: ['12:30'],
    weekdays: [1, 2, 3, 4, 5],
  };
  const agua: ReminderInput = {
    kind: ReminderKind.WATER,
    mode: ReminderMode.INTERVAL,
    everyHours: 2,
    from: '08:00',
    to: '20:00',
  };

  /** O que a rodada mandou para estas pessoas (a base pode ter lembretes de outros testes). */
  async function rodada(now: Date, ...ids: string[]) {
    enviados.splice(0);
    await job.run(now);
    return enviados.filter((e) => ids.includes(e.userId));
  }

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  describe('cadastro', () => {
    it('cria, lista com o nome da prancha, altera e apaga', async () => {
      const id = await pessoa();
      const a = await reminders.create(id, agua);
      expect(a).toMatchObject({
        kind: 'WATER',
        title: 'Água',
        mode: 'INTERVAL',
        everyHours: 2,
        from: '08:00',
        to: '20:00',
        times: [],
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        enabled: true,
      });
      const l = await reminders.create(id, almoco);
      expect(l.title).toBe('Almoço');
      expect((await reminders.list(id)).map((r) => r.id)).toEqual([a.id, l.id]);

      // Trocar de modo apaga o que era do outro modo.
      const mudou = await reminders.update(id, a.id, {
        mode: ReminderMode.TIMES,
        times: ['19:00', '08:00'],
      });
      expect(mudou).toMatchObject({
        mode: 'TIMES',
        times: ['08:00', '19:00'],
        everyHours: null,
        from: null,
        to: null,
      });
      expect((await reminders.update(id, l.id, { enabled: false })).enabled).toBe(false);
      expect(await reminders.remove(id, l.id)).toEqual({ deleted: true });
      expect(await reminders.list(id)).toHaveLength(1);
    });

    it.each<[string, Partial<ReminderInput>]>([
      ['hábito antes dos hábitos (#390)', { kind: ReminderKind.HABIT }],
      ['a cada 7 h', { everyHours: 7 }],
      ['último aviso antes do primeiro', { from: '20:00', to: '08:00' }],
      ['horário fora da grade de 5 min', { from: '08:03' }],
      ['nenhum dia', { weekdays: [] }],
      ['dia 8', { weekdays: [8] }],
      ['"se abaixo de" fora dos passos', { stepsBelow: 6000 }],
    ])('recusa %s', async (_nome, patch) => {
      const id = await pessoa();
      await expect(reminders.create(id, { ...agua, ...patch })).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('recusa horários fixos sem horário e aceita passos com "se abaixo de"', async () => {
      const id = await pessoa();
      await expect(
        reminders.create(id, { kind: ReminderKind.MEAL, mode: ReminderMode.TIMES, times: [] }),
      ).rejects.toBeInstanceOf(BadRequestException);
      const passos = await reminders.create(id, {
        kind: ReminderKind.STEPS,
        mode: ReminderMode.TIMES,
        times: ['19:00'],
        stepsBelow: 6000,
      });
      expect(passos).toMatchObject({ title: 'Passos', stepsBelow: 6000 });
    });

    it('o lembrete de outra pessoa não é lido, alterado nem apagado', async () => {
      const dona = await pessoa();
      const outra = await pessoa();
      const r = await reminders.create(dona, almoco);
      expect(await reminders.list(outra)).toEqual([]);
      await expect(reminders.update(outra, r.id, { enabled: false })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(reminders.remove(outra, r.id)).rejects.toBeInstanceOf(NotFoundException);
      expect((await reminders.list(dona))[0]).toMatchObject({ id: r.id, enabled: true });
    });

    it('apagar a conta leva os lembretes', async () => {
      const id = await pessoa();
      await reminders.create(id, almoco);
      await prisma.user.delete({ where: { id } });
      expect(await prisma.reminder.count({ where: { userId: id } })).toBe(0);
    });
  });

  describe('envio pelo servidor', () => {
    it('o almoço de seg a sex sai às 12:30 de segunda, uma vez só, sem número no texto', async () => {
      const id = await pessoa();
      await reminders.create(id, almoco);
      const r = await rodada(segunda('12:30'), id);
      expect(r).toHaveLength(1);
      expect(r[0]!.notice).toMatchObject({
        kind: 'REMINDERS',
        title: 'Hora do almoço',
        url: '/nutrition',
      });
      expect(`${r[0]!.notice.title}${r[0]!.notice.body}`).not.toMatch(/\d/);
      // Mesmo minuto, ou o seguinte: já saiu.
      expect(await rodada(segunda('12:31'), id)).toEqual([]);
    });

    it('não sai no sábado nem desligado', async () => {
      const id = await pessoa();
      const r = await reminders.create(id, almoco);
      expect(await rodada(new Date('2026-11-21T15:30:20Z'), id)).toEqual([]);
      await reminders.update(id, r.id, { enabled: false });
      expect(await rodada(segunda('12:30'), id)).toEqual([]);
    });

    it('almoço já registrado cala o lembrete do almoço', async () => {
      const id = await pessoa();
      await reminders.create(id, almoco);
      await prisma.meal.create({
        data: { userId: id, mealType: MealType.LUNCH, eatenAt: segunda('12:10') },
      });
      expect(await rodada(segunda('12:30'), id)).toEqual([]);
    });

    it('água: sai com o copo por beber, cala com a meta batida ou com um copo há pouco', async () => {
      const sede = await pessoa();
      const bateu = await pessoa();
      const recente = await pessoa();
      for (const id of [sede, bateu, recente]) await reminders.create(id, agua);
      await prisma.waterLog.create({
        data: { userId: bateu, date: '2026-11-16', ml: 2500, loggedAt: segunda('09:00') },
      });
      await prisma.waterLog.create({
        data: { userId: recente, date: '2026-11-16', ml: 250, loggedAt: segunda('11:00') },
      });
      const r = await rodada(segunda('12:00'), sede, bateu, recente);
      expect(r.map((e) => e.userId)).toEqual([sede]);
      expect(r[0]!.notice.title).toBe('Hora da água');
    });

    it('passos: só se o dia estiver abaixo do "se abaixo de"', async () => {
      const parado = await pessoa();
      const andou = await pessoa();
      for (const id of [parado, andou]) {
        await reminders.create(id, {
          kind: ReminderKind.STEPS,
          mode: ReminderMode.TIMES,
          times: ['19:00'],
          stepsBelow: 6000,
        });
      }
      await prisma.stepLog.create({ data: { userId: parado, date: '2026-11-16', steps: 4000 } });
      await prisma.stepLog.create({ data: { userId: andou, date: '2026-11-16', steps: 7000 } });
      const r = await rodada(segunda('19:00'), parado, andou);
      expect(r.map((e) => e.userId)).toEqual([parado]);
    });

    it('treino começado e pesagem do dia calam os lembretes deles', async () => {
      const id = await pessoa();
      await reminders.create(id, {
        kind: ReminderKind.WORKOUT,
        mode: ReminderMode.TIMES,
        times: ['18:00'],
      });
      await reminders.create(id, {
        kind: ReminderKind.WEIGHT,
        mode: ReminderMode.TIMES,
        times: ['18:00'],
      });
      await prisma.workoutSession.create({ data: { userId: id, startedAt: segunda('07:00') } });
      await prisma.weightLog.create({
        data: { userId: id, weightKg: 70, loggedAt: segunda('07:05') },
      });
      expect(await rodada(segunda('18:00'), id)).toEqual([]);
    });

    it('dois lembretes no mesmo minuto viram um aviso', async () => {
      const id = await pessoa();
      await reminders.create(id, agua);
      await reminders.create(id, { ...almoco, times: ['12:00'] });
      const r = await rodada(segunda('12:00'), id);
      expect(r).toHaveLength(1);
      expect(r[0]!.notice).toMatchObject({ title: '2 lembretes agora', body: 'Água e almoço' });
    });

    it('silêncio noturno cala; desligado, o lembrete das 23:00 sai', async () => {
      const id = await pessoa();
      await reminders.create(id, {
        kind: ReminderKind.WORKOUT,
        mode: ReminderMode.TIMES,
        times: ['23:00'],
      });
      expect(await rodada(segunda('23:00'), id)).toEqual([]);
      await prisma.user.update({ where: { id }, data: { quietHoursEnabled: false } });
      expect(await rodada(segunda('23:01'), id)).toHaveLength(1);
    });

    it('o horário vale no fuso da pessoa', async () => {
      const id = await pessoa();
      await prisma.user.update({ where: { id }, data: { timezone: 'America/Manaus' } });
      await reminders.create(id, almoco);
      // 12:30 em São Paulo são 11:30 em Manaus: ainda não.
      expect(await rodada(segunda('12:30'), id)).toEqual([]);
      expect(await rodada(segunda('13:30'), id)).toHaveLength(1);
    });

    it('teto do dia: quem já recebeu 12 não recebe o 13º', async () => {
      const id = await pessoa();
      const r = await reminders.create(id, almoco);
      await prisma.reminder.update({
        where: { id: r.id },
        data: { sentDate: '2026-11-16', sentCount: 12 },
      });
      expect(await rodada(segunda('12:30'), id)).toEqual([]);
    });

    it('conta o envio do dia e recomeça no dia seguinte', async () => {
      const id = await pessoa();
      const r = await reminders.create(id, almoco);
      await prisma.reminder.update({
        where: { id: r.id },
        data: { sentDate: '2026-11-13', sentCount: 12 },
      });
      expect(await rodada(segunda('12:30'), id)).toHaveLength(1);
      expect(await prisma.reminder.findUnique({ where: { id: r.id } })).toMatchObject({
        sentDate: '2026-11-16',
        sentCount: 1,
      });
    });
  });
});
