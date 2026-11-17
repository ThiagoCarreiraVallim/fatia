import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { silentNotifications } from '../../notifications/__tests__/silent-notifications';
import { addDaysIso, todayInTz } from '../../progress/helpers/date-tz';
import { MediaService } from '../../storage/media.service';
import { MemoryObjectStore } from '../../storage/memory-object-store';
import { BenefitService } from '../benefit.service';
import { GroupService } from '../group.service';
import { MembershipService } from '../membership.service';
import { ProfessionalLinkService } from '../professional-link.service';

/**
 * Benefícios de parceiros (#393, Cm-22/Pn-28): o dono cadastra cupom ou link
 * com validade; o membro ativo vê os que valem, e o vencido ainda aparece
 * apagado no dia seguinte, sem o cupom. Tudo amarrado ao `groupId` da URL.
 */
describe('benefícios de parceiros (integração)', () => {
  const prisma = new PrismaService();
  const store = new MemoryObjectStore();
  const media = new MediaService(prisma, store);
  const links = new ProfessionalLinkService(prisma);
  const memberships = new MembershipService(prisma, links, silentNotifications);
  const groups = new GroupService(prisma, links, [], media);
  const benefits = new BenefitService(prisma, media);

  const TZ = 'America/Cuiaba';
  const hoje = todayInTz(TZ);
  const stamp = `beneficio-${Date.now()}`;
  const criados: string[] = [];
  const grupos: string[] = [];
  let n = 0;

  async function pessoa(nome: string) {
    n += 1;
    const user = await prisma.user.create({
      data: { logtoSub: `${stamp}-${n}`, email: `${stamp}-${n}@test.local`, name: nome },
    });
    criados.push(user.id);
    return user.id;
  }

  async function comunidade() {
    const dono = await pessoa('Dona');
    const grupo = await groups.create(dono, {
      type: 'SPONSORED',
      name: 'Academia',
      joinPolicy: 'OPEN',
      timezone: TZ,
    });
    grupos.push(grupo.id);
    const aluna = await pessoa('Aluna');
    await memberships.requestJoin(aluna, grupo.slug, { scopes: [], statsOptIn: false });
    const pro = await pessoa('Pro');
    await prisma.groupMembership.create({
      data: { groupId: grupo.id, userId: pro, role: 'PROFESSIONAL', status: 'ACTIVE' },
    });
    return { dono, aluna, pro, grupo };
  }

  const cupom = (validUntil = addDaysIso(hoje, 30)) => ({
    partnerName: 'Suplementa',
    discountText: '15% em suplementos',
    kind: 'COUPON' as const,
    couponCode: 'DEMO15',
    validUntil,
  });

  afterAll(async () => {
    await prisma.group.deleteMany({ where: { id: { in: grupos } } });
    await prisma.user.deleteMany({ where: { id: { in: criados } } });
    await prisma.$disconnect();
  });

  it('o dono cadastra cupom e link; o membro vê os dois, com o cupom à mão', async () => {
    const { dono, aluna, grupo } = await comunidade();
    await benefits.create(dono, grupo.id, cupom());
    await benefits.create(dono, grupo.id, {
      partnerName: 'Fisio Movimento',
      discountText: '1ª avaliação grátis',
      kind: 'LINK',
      url: 'https://fisio.example/academia',
      validUntil: hoje,
    });

    const lista = await benefits.listForMember(aluna, grupo.id);
    expect(lista).toEqual([
      expect.objectContaining({
        partnerName: 'Fisio Movimento',
        kind: 'LINK',
        url: 'https://fisio.example/academia',
        couponCode: null,
        validUntil: hoje,
        expired: false,
      }),
      expect.objectContaining({
        partnerName: 'Suplementa',
        couponCode: 'DEMO15',
        url: null,
        expired: false,
      }),
    ]);
    // Nada de quem cadastrou nem de quem usou sai para o membro.
    expect(JSON.stringify(lista)).not.toMatch(/createdBy|Dona/);
  });

  it('vencido ontem aparece apagado e sem o cupom; antes de ontem, some', async () => {
    const { dono, aluna, grupo } = await comunidade();
    const ontem = await benefits.create(dono, grupo.id, cupom(addDaysIso(hoje, 5)));
    const velho = await benefits.create(dono, grupo.id, cupom(addDaysIso(hoje, 5)));
    // Validade no passado só pelo banco: a API recusa criar assim.
    await prisma.groupPartnerBenefit.update({
      where: { id: ontem.id },
      data: { validUntil: new Date(`${addDaysIso(hoje, -1)}T00:00:00Z`) },
    });
    await prisma.groupPartnerBenefit.update({
      where: { id: velho.id },
      data: { validUntil: new Date(`${addDaysIso(hoje, -2)}T00:00:00Z`) },
    });

    const lista = await benefits.listForMember(aluna, grupo.id);
    expect(lista).toEqual([
      expect.objectContaining({ id: ontem.id, expired: true, couponCode: null, url: null }),
    ]);

    // A equipe vê todos, com o estado.
    const painel = await benefits.listForTeam(dono, grupo.id);
    expect(painel.map((b) => [b.id, b.status])).toEqual(
      expect.arrayContaining([
        [ontem.id, 'expired'],
        [velho.id, 'expired'],
      ]),
    );
  });

  it('o dono edita e remove; o membro deixa de ver', async () => {
    const { dono, aluna, grupo } = await comunidade();
    const b = await benefits.create(dono, grupo.id, cupom());
    const editado = await benefits.update(dono, grupo.id, b.id, {
      discountText: '20% em tudo',
      couponCode: 'DEMO20',
    });
    expect(editado).toMatchObject({ discountText: '20% em tudo', couponCode: 'DEMO20' });
    await benefits.remove(dono, grupo.id, b.id);
    expect(await benefits.listForMember(aluna, grupo.id)).toEqual([]);
  });

  it('só o dono administra; membro e profissional recebem 403, quem é de fora 404', async () => {
    const { aluna, pro, grupo } = await comunidade();
    await expect(benefits.create(aluna, grupo.id, cupom())).rejects.toThrow(ForbiddenException);
    await expect(benefits.create(pro, grupo.id, cupom())).rejects.toThrow(ForbiddenException);
    await expect(benefits.listForTeam(aluna, grupo.id)).rejects.toThrow(ForbiddenException);
    const estranha = await pessoa('Estranha');
    await expect(benefits.listForMember(estranha, grupo.id)).rejects.toThrow(NotFoundException);
  });

  it('pedido de entrada pendente ainda não vê os benefícios', async () => {
    const { dono, grupo } = await comunidade();
    await prisma.group.update({ where: { id: grupo.id }, data: { joinPolicy: 'APPROVAL' } });
    const esperando = await pessoa('Esperando');
    await memberships.requestJoin(esperando, grupo.slug, { scopes: [], statsOptIn: false });
    await benefits.create(dono, grupo.id, cupom());
    await expect(benefits.listForMember(esperando, grupo.id)).rejects.toThrow(NotFoundException);
  });

  it('benefício de outra comunidade não se edita nem se apaga pela minha URL', async () => {
    const a = await comunidade();
    const b = await comunidade();
    const deles = await benefits.create(b.dono, b.grupo.id, cupom());
    await expect(
      benefits.update(a.dono, a.grupo.id, deles.id, { discountText: 'x' }),
    ).rejects.toThrow(NotFoundException);
    await expect(benefits.remove(a.dono, a.grupo.id, deles.id)).rejects.toThrow(NotFoundException);
    expect(await benefits.listForMember(b.aluna, b.grupo.id)).toHaveLength(1);
  });

  it('logo enviado para outra comunidade não vira logo aqui', async () => {
    const a = await comunidade();
    const b = await comunidade();
    const arquivo = await prisma.mediaFile.create({
      data: {
        groupId: b.grupo.id,
        uploaderId: b.dono,
        purpose: 'benefit_logo',
        kind: 'IMAGE',
        status: 'READY',
        key: `${stamp}/logo.png`,
        mime: 'image/png',
        bytes: 10,
      },
    });
    await expect(
      benefits.create(a.dono, a.grupo.id, { ...cupom(), logoFileId: arquivo.id }),
    ).rejects.toThrow(NotFoundException);
    const proprio = await benefits.create(b.dono, b.grupo.id, {
      ...cupom(),
      logoFileId: arquivo.id,
    });
    expect(proprio.logoUrl).toEqual(expect.any(String));
  });

  it('recusa cupom sem código, link sem https e validade no passado', async () => {
    const { dono, grupo } = await comunidade();
    await expect(
      benefits.create(dono, grupo.id, { ...cupom(), couponCode: undefined }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      benefits.create(dono, grupo.id, {
        partnerName: 'P',
        discountText: 'd',
        kind: 'LINK',
        url: 'http://inseguro.example',
        validUntil: hoje,
      }),
    ).rejects.toThrow(BadRequestException);
    await expect(benefits.create(dono, grupo.id, cupom(addDaysIso(hoje, -1)))).rejects.toThrow(
      BadRequestException,
    );
  });
});
