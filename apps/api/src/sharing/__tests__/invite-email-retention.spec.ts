import type { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import type { EmailService } from '../../notifications/email.service';
import { INVITE_EMAIL_PURGE_INTERVAL_MS, InviteService } from '../invite.service';
import { MembershipService } from '../membership.service';
import { ProfessionalLinkService } from '../professional-link.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';

/**
 * O e-mail de quem foi convidado é dado de terceiro: a Privacidade promete que
 * ele some 30 dias depois de o convite ser usado, vencer ou ser revogado
 * (`DATA_RETENTION.md`). A promessa não pode depender de alguém criar outro
 * convite na mesma comunidade.
 */
const DIA = 86_400_000;

describe('retenção do e-mail do convite', () => {
  const prisma = new PrismaService();
  const memberships = new MembershipService(
    prisma,
    new ProfessionalLinkService(prisma),
    silentNotifications,
  );
  const config = { get: () => undefined } as unknown as ConfigService;
  const invites = new InviteService(
    prisma,
    memberships,
    {} as EmailService,
    config,
    silentNotifications,
  );
  const stamp = `retencao-${Date.now()}`;
  let groupId: string;
  let dona: string;

  beforeAll(async () => {
    dona = (
      await prisma.user.create({
        data: { logtoSub: stamp, email: `${stamp}@test.local`, name: 'dona' },
      })
    ).id;
    groupId = (
      await prisma.group.create({
        data: { type: 'SOCIAL', name: 'Retenção', slug: stamp, ownerId: dona },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: groupId } });
    await prisma.user.deleteMany({ where: { id: dona } });
    await prisma.$disconnect();
  });

  it('apaga o e-mail de convite vencido, revogado ou usado há mais de 30 dias, e só deles', async () => {
    const agora = new Date('2026-10-17T12:00:00Z');
    const antigo = new Date(agora.getTime() - 31 * DIA);
    const recente = new Date(agora.getTime() - 2 * DIA);
    const convite = (sufixo: string, extra: object) =>
      prisma.groupInvite.create({
        data: {
          groupId,
          tokenHash: `${stamp}-${sufixo}`,
          role: 'MEMBER',
          email: `${sufixo}@test.local`,
          maxUses: 1,
          expiresAt: new Date(agora.getTime() + DIA),
          ...extra,
        },
      });
    await convite('vencido', { expiresAt: antigo });
    await convite('revogado', { revokedAt: antigo });
    await convite('usado', { uses: 1, createdAt: antigo });
    await convite('vencido-agora', { expiresAt: recente });
    await convite('pendente', {});

    await invites.purgeOldEmails(agora);

    const restantes = await prisma.groupInvite.findMany({
      where: { groupId, email: { not: null } },
      select: { email: true },
      orderBy: { email: 'asc' },
    });
    expect(restantes.map((i) => i.email)).toEqual([
      'pendente@test.local',
      'vencido-agora@test.local',
    ]);
  });

  it('roda sozinho ao subir e de tempos em tempos, sem segurar o processo', () => {
    jest.useFakeTimers();
    const purge = jest.spyOn(invites, 'purgeOldEmails').mockResolvedValue();
    try {
      invites.onModuleInit();
      expect(purge).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(INVITE_EMAIL_PURGE_INTERVAL_MS);
      expect(purge).toHaveBeenCalledTimes(2);
      invites.onModuleDestroy();
      jest.advanceTimersByTime(INVITE_EMAIL_PURGE_INTERVAL_MS);
      expect(purge).toHaveBeenCalledTimes(2);
    } finally {
      purge.mockRestore();
      jest.useRealTimers();
    }
  });
});
