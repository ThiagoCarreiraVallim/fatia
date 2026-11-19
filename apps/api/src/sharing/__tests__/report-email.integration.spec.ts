import type { ConfigService } from '@nestjs/config';
import { GroupRole, GroupType, MembershipStatus } from '@fatia/db';
import { PrismaService } from '../../common/prisma.service';
import {
  AnnouncementEmailService,
  announcementUnsubscribeToken,
  reportUnsubscribeToken,
} from '../../notifications/announcement-email.service';
import type { EmailMessage, EmailService } from '../../notifications/email.service';
import { ReportEmailService, reportEmail } from '../report-email.service';
import { ReportService } from '../report.service';
import type { MonthReport } from '../report.types';

/**
 * O e-mail mensal do relatório (#400, Ex-02): sai no 1º dia útil, no fuso da
 * comunidade, para o dono e para quem ele marcou, uma vez por mês e
 * comunidade, mesmo com duas instâncias rodando ao mesmo tempo.
 */
describe('e-mail mensal do relatório (integração, #400)', () => {
  const prisma = new PrismaService();
  const SEGREDO = 'segredo-de-teste-do-relatorio-400-abcdef';
  const config = {
    get: (k: string) =>
      k === 'EMAIL_UNSUBSCRIBE_SECRET'
        ? SEGREDO
        : k === 'WEB_ORIGIN'
          ? 'https://app.fatia.test'
          : undefined,
  } as unknown as ConfigService;
  const enviados: EmailMessage[] = [];
  const email = {
    enabled: true,
    send: async (m: EmailMessage) => {
      // Um envio lento abre a janela da corrida entre duas instâncias.
      await new Promise((r) => setTimeout(r, 20));
      enviados.push(m);
      return true;
    },
  } as unknown as EmailService;
  const reports = new ReportService(prisma);
  const job = new ReportEmailService(prisma, reports, email, config);
  const announcements = new AnnouncementEmailService(prisma, email, config);

  const stamp = `t400mail-${Date.now()}`;
  const usuarios: string[] = [];
  const g = { id: '', dono: '', marcada: '', desmarcada: '', descadastrada: '' };
  const emails: Record<string, string> = {};
  let n = 0;

  async function pessoa(nome: string, extra: Record<string, unknown> = {}) {
    n += 1;
    const u = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome, ...extra },
    });
    usuarios.push(u.id);
    emails[u.id] = u.email;
    return u.id;
  }

  const meus = () => enviados.filter((m) => Object.values(emails).includes(m.to));
  const para = (userId: string) => meus().filter((m) => m.to === emails[userId]);

  beforeAll(async () => {
    g.dono = await pessoa('Dona Report');
    g.marcada = await pessoa('Prof Marcada');
    g.desmarcada = await pessoa('Prof Desmarcada');
    g.descadastrada = await pessoa('Prof Descadastrada', { reportEmailOptOutAt: new Date() });
    const grupo = await prisma.group.create({
      data: {
        type: GroupType.SPONSORED,
        name: 'Academia <Demo>',
        slug: stamp,
        ownerId: g.dono,
        createdAt: new Date('2026-01-01T12:00:00Z'),
        memberships: {
          create: [
            { userId: g.dono, role: GroupRole.OWNER, status: MembershipStatus.ACTIVE },
            {
              userId: g.marcada,
              role: GroupRole.PROFESSIONAL,
              status: MembershipStatus.ACTIVE,
              reportEmail: true,
            },
            {
              userId: g.desmarcada,
              role: GroupRole.PROFESSIONAL,
              status: MembershipStatus.ACTIVE,
            },
            {
              userId: g.descadastrada,
              role: GroupRole.PROFESSIONAL,
              status: MembershipStatus.ACTIVE,
              reportEmail: true,
            },
          ],
        },
      },
    });
    g.id = grupo.id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: g.id } });
    await prisma.user.deleteMany({ where: { id: { in: usuarios } } });
    await prisma.$disconnect();
  });

  it('não sai no feriado nem antes das 8 h do 1º dia útil', async () => {
    // 2/11/2026 é segunda, Finados.
    await job.sendMonthlyReports(new Date('2026-11-02T15:00:00Z'));
    // 3/11, 7 h em São Paulo.
    await job.sendMonthlyReports(new Date('2026-11-03T10:00:00Z'));
    expect(meus()).toHaveLength(0);
  });

  it('no 1º dia útil sai o relatório de outubro para o dono e para quem ele marcou', async () => {
    await job.sendMonthlyReports(new Date('2026-11-03T15:00:00Z'));
    expect(para(g.dono)).toHaveLength(1);
    expect(para(g.marcada)).toHaveLength(1);
    expect(para(g.desmarcada)).toHaveLength(0);
    expect(para(g.descadastrada)).toHaveLength(0);
    const m = para(g.dono)[0]!;
    expect(m.subject).toContain('outubro');
    expect(m.html).toContain(`https://app.fatia.test/org/${g.id}/report?month=2026-10`);
    expect(m.html).toContain('Academia &#60;Demo&#62;');
    expect(m.headers?.['List-Unsubscribe']).toContain('https://app.fatia.test/api/descadastro?t=');
    const grupo = await prisma.group.findUniqueOrThrow({ where: { id: g.id } });
    expect(grupo.reportEmailMonth).toBe('2026-10');
  });

  it('o mesmo mês não sai duas vezes, nem com duas instâncias ao mesmo tempo', async () => {
    await job.sendMonthlyReports(new Date('2026-11-04T15:00:00Z'));
    expect(para(g.dono)).toHaveLength(1);

    await prisma.group.update({ where: { id: g.id }, data: { reportEmailMonth: null } });
    const antes = para(g.dono).length;
    await Promise.all([
      job.sendMonthlyReports(new Date('2026-11-05T15:00:00Z')),
      job.sendMonthlyReports(new Date('2026-11-05T15:00:00Z')),
      job.sendMonthlyReports(new Date('2026-11-05T15:00:00Z')),
    ]);
    expect(para(g.dono).length - antes).toBe(1);
  });

  it('desligado pelo dono, não sai', async () => {
    await prisma.group.update({
      where: { id: g.id },
      data: { reportEmailEnabled: false, reportEmailMonth: null },
    });
    const antes = meus().length;
    await job.sendMonthlyReports(new Date('2026-11-06T15:00:00Z'));
    expect(meus().length).toBe(antes);
    await prisma.group.update({ where: { id: g.id }, data: { reportEmailEnabled: true } });
  });

  it('o link do e-mail descadastra só do relatório, não dos comunicados', async () => {
    const t = reportUnsubscribeToken(g.marcada, SEGREDO);
    expect(await announcements.status(t)).toEqual({ subscribed: true, kind: 'report' });
    await announcements.setSubscribed(t, false);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: g.marcada } });
    expect(u.reportEmailOptOutAt).not.toBeNull();
    expect(u.announcementEmailOptOutAt).toBeNull();
    // O token do comunicado continua mexendo só no comunicado.
    expect(await announcements.status(announcementUnsubscribeToken(g.marcada, SEGREDO))).toEqual({
      subscribed: true,
      kind: 'announcements',
    });
    // A assinatura de um propósito não vale para o outro.
    const [id64, sig] = t.split('.');
    const trocado = `${Buffer.from(g.marcada).toString('base64url')}.${sig}`;
    expect(id64).not.toBe(Buffer.from(g.marcada).toString('base64url'));
    await expect(announcements.status(trocado)).rejects.toThrow('inválido');
  });
});

describe('texto do e-mail mensal (#400, Ex-02)', () => {
  const base: MonthReport = {
    month: '2026-10',
    months: ['2026-10'],
    partial: false,
    groupName: 'Academia Demo',
    optIn: 97,
    riskDays: 7,
    weeklySessionsGoal: null,
    activeMembers: { value: 76, percent: 78, deltaPts: 4, delta: 3 },
    sessions: { total: 1284, perActive: 16.9, deltaPct: 9 },
    trainingDays: { perActive: 10.3, deltaPct: null },
    returned: 14,
    atRisk: null,
    plans: { sent: null, acceptedPercent: null, declined: null, noResponse: null },
    reviews: { reviewed: null, withinDayPercent: null, medianHours: null },
    weeks: [],
    weeksAverage: null,
    weeksOnGoal: null,
    activeByDay: [],
    challenges: [],
    challengeLift: null,
  };

  it('os números do Ex-02, com o que não sai como amostra pequena e sem nome de ninguém', () => {
    const m = reportEmail({
      to: 'dona@x.test',
      report: base,
      panelUrl: 'https://app.fatia.test/org/g1/report?month=2026-10',
      unsubscribeUrl: 'https://app.fatia.test/descadastro?t=a.b',
      oneClickUrl: 'https://app.fatia.test/api/descadastro?t=a.b',
    });
    expect(m.subject).toBe('Academia Demo: relatório de outubro');
    expect(m.text).toContain('78%');
    expect(m.text).toContain('+4 pts');
    expect(m.text).toContain('1.284');
    expect(m.text).toContain('voltaram após 14 dias');
    expect(m.text).toContain('sem treino há 7+ dias: amostra pequena demais para mostrar');
    expect(m.text).toContain('Grupos com menos de 5 pessoas não aparecem');
    expect(m.html).toContain('Abrir no painel');
    expect(m.headers).toEqual({
      'List-Unsubscribe': '<https://app.fatia.test/api/descadastro?t=a.b>',
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    });
  });
});
