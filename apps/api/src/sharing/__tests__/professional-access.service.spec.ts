import { NotFoundException } from '@nestjs/common';
import { GroupRole, MembershipStatus, ShareScope } from '@fatia/db';
import { ProfessionalAccessService } from '../professional-access.service';
import type { AccessAuditService } from '../access-audit.service';
import type { PrismaService } from '../../common/prisma.service';

type MockPrisma = {
  groupMembership: { findUnique: jest.Mock };
  professionalLink: { findFirst: jest.Mock };
};

const makePrisma = (): MockPrisma => ({
  groupMembership: { findUnique: jest.fn() },
  professionalLink: { findFirst: jest.fn() },
});

const PRO = 'pro-1';
const SUBJECT = 'aluno-1';
const GROUP = 'grupo-1';
const MEMBERSHIP = 'membership-1';

describe('ProfessionalAccessService.assertReadable', () => {
  let prisma: MockPrisma;
  let audit: { record: jest.Mock };
  let service: ProfessionalAccessService;

  beforeEach(() => {
    prisma = makePrisma();
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ProfessionalAccessService(
      prisma as unknown as PrismaService,
      audit as unknown as AccessAuditService,
    );
  });

  type MembershipDoAluno = { userId: string; groupId: string; status: MembershipStatus } | null;
  type MembershipDoPro = { role: GroupRole; status: MembershipStatus } | null;

  /**
   * Instala o mock das DUAS leituras de `GroupMembership`: a do aluno (por
   * `id`) e a do profissional (pelo par único `groupId_userId`). O despacho é
   * pelo `where` de propósito — um mock que devolvesse a mesma linha para as
   * duas esconderia exatamente o furo que a checagem do lado do profissional
   * fecha. Por padrão os dois lados estão ativos e no papel certo.
   */
  const activeMembership = (
    overrides: { aluno?: MembershipDoAluno; profissional?: MembershipDoPro } = {},
  ) => {
    const aluno =
      overrides.aluno === undefined
        ? { userId: SUBJECT, groupId: GROUP, status: MembershipStatus.ACTIVE }
        : overrides.aluno;
    const profissional =
      overrides.profissional === undefined
        ? { role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE }
        : overrides.profissional;

    return prisma.groupMembership.findUnique.mockImplementation(
      (args: { where: { id?: string; groupId_userId?: { groupId: string; userId: string } } }) =>
        Promise.resolve(args.where.id === undefined ? profissional : aluno),
    );
  };

  it('devolve o userId do titular quando há vínculo ativo no escopo', async () => {
    activeMembership();
    prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await expect(
      service.assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'list_workout_sessions'),
    ).resolves.toBe(SUBJECT);
  });

  it('procura o vínculo pelo trio (profissional, titular DA LINHA, grupo DA LINHA)', async () => {
    // O `membershipId` de input não pode aparecer no `where` do vínculo: ele
    // serve para achar a linha, não para autorizar. Titular e grupo saem da
    // membership já lida — é o amarre que faltava no #204.
    activeMembership();
    prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await service.assertReadable(PRO, MEMBERSHIP, ShareScope.BODY, 'list_weight_logs');

    const where = prisma.professionalLink.findFirst.mock.calls[0][0].where;
    expect(where.professionalId).toBe(PRO);
    expect(where.subjectUserId).toBe(SUBJECT);
    expect(where.groupId).toBe(GROUP);
  });

  it('filtra por revokedAt: null — revogação não pode virar enfeite', async () => {
    activeMembership();
    prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await service.assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x');

    expect(prisma.professionalLink.findFirst.mock.calls[0][0].where.revokedAt).toBeNull();
  });

  it('exige o escopo com `has`, nunca `hasSome`', async () => {
    // `hasSome: []` casa com tudo. Se isto virar `hasSome` numa refatoração,
    // consentir treino passa a abrir o diário alimentar.
    activeMembership();
    prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await service.assertReadable(PRO, MEMBERSHIP, ShareScope.NUTRITION, 'x');

    const scopes = prisma.professionalLink.findFirst.mock.calls[0][0].where.scopes;
    expect(scopes).toEqual({ has: ShareScope.NUTRITION });
    expect(scopes).not.toHaveProperty('hasSome');
  });

  it('registra a trilha antes de devolver, no caminho feliz', async () => {
    activeMembership();
    prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await service.assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'get_strength_progress');

    expect(audit.record).toHaveBeenCalledWith({
      linkId: 'link-1',
      professionalId: PRO,
      subjectUserId: SUBJECT,
      scope: ShareScope.WORKOUT,
      action: 'get_strength_progress',
      denied: false,
    });
  });

  it('registra a trilha na NEGATIVA, com denied: true e linkId nulo', async () => {
    // "Tentou ver o que não podia" é o registro que denuncia profissional
    // malicioso — se só o sucesso for gravado, ele nunca aparece.
    activeMembership();
    prisma.professionalLink.findFirst.mockResolvedValue(null);

    await expect(
      service.assertReadable(PRO, MEMBERSHIP, ShareScope.NUTRITION, 'get_nutrition_summary'),
    ).rejects.toThrow(NotFoundException);

    expect(audit.record).toHaveBeenCalledWith({
      linkId: null,
      professionalId: PRO,
      subjectUserId: SUBJECT,
      scope: ShareScope.NUTRITION,
      action: 'get_nutrition_summary',
      denied: true,
    });
  });

  it('recusa sem sequer consultar vínculo quando a membership não está ACTIVE', async () => {
    // Aluno que saiu do grupo para de ser lido no mesmo instante, mesmo que a
    // revogação em massa do vínculo tenha falhado.
    prisma.groupMembership.findUnique.mockResolvedValue({
      userId: SUBJECT,
      groupId: GROUP,
      status: MembershipStatus.LEFT,
    });

    await expect(service.assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.professionalLink.findFirst).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ denied: true }));
  });

  it('recusa profissional cuja membership não está ACTIVE, com o vínculo ainda sem revogar', async () => {
    // O personal demitido: a academia marcou a membership dele como REMOVED,
    // mas o `ProfessionalLink` continua com `revokedAt: null` porque a
    // revogação em massa é da #154 e ainda não existe. Sem esta checagem, o
    // ex-funcionário segue lendo o histórico de saúde da aluna.
    activeMembership({
      profissional: { role: GroupRole.PROFESSIONAL, status: MembershipStatus.REMOVED },
    });
    prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await expect(service.assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.professionalLink.findFirst).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ denied: true }));
  });

  it('recusa profissional que nem membership tem no grupo da linha', async () => {
    activeMembership({ profissional: null });
    prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await expect(service.assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x')).rejects.toThrow(
      NotFoundException,
    );

    expect(prisma.professionalLink.findFirst).not.toHaveBeenCalled();
  });

  it('recusa todo papel que não seja PROFESSIONAL, inclusive OWNER', async () => {
    // Dono de grupo gere academia, membros e cobrança — e não lê dado de saúde
    // de aluno (ADR 014). CREATOR e MEMBER, pela mesma razão, também não.
    for (const role of [GroupRole.OWNER, GroupRole.CREATOR, GroupRole.MEMBER]) {
      prisma.professionalLink.findFirst.mockClear();
      activeMembership({ profissional: { role, status: MembershipStatus.ACTIVE } });
      prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

      await expect(
        service.assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.professionalLink.findFirst).not.toHaveBeenCalled();
    }
  });

  it('procura a membership do profissional no grupo DA LINHA, nunca em outro', async () => {
    // Mesmo amarre do #204 aplicado ao outro lado: o grupo sai da membership já
    // lida e o usuário é o do contexto autenticado — nada vem do input.
    activeMembership();
    prisma.professionalLink.findFirst.mockResolvedValue({ id: 'link-1' });

    await service.assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x');

    const chamadaDoPro = prisma.groupMembership.findUnique.mock.calls[1][0];
    expect(chamadaDoPro.where).toEqual({ groupId_userId: { groupId: GROUP, userId: PRO } });
  });

  it('recusa membership inexistente sem inventar titular na trilha', async () => {
    prisma.groupMembership.findUnique.mockResolvedValue(null);

    await expect(
      service.assertReadable(PRO, 'nao-existe', ShareScope.WORKOUT, 'x'),
    ).rejects.toThrow(NotFoundException);

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('usa a MESMA mensagem em todas as recusas', async () => {
    // Mensagens diferentes viram oráculo: "existe aluno, mas você não tem
    // vínculo" já é informação que o profissional não deveria obter.
    const messages: string[] = [];

    prisma.groupMembership.findUnique.mockResolvedValue(null);
    messages.push(
      await service
        .assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x')
        .catch((err: Error) => err.message),
    );

    activeMembership();
    prisma.professionalLink.findFirst.mockResolvedValue(null);
    messages.push(
      await service
        .assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x')
        .catch((err: Error) => err.message),
    );

    activeMembership({
      aluno: { userId: SUBJECT, groupId: GROUP, status: MembershipStatus.REMOVED },
    });
    messages.push(
      await service
        .assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x')
        .catch((err: Error) => err.message),
    );

    // Profissional demitido também: "você foi removido do grupo" já denunciaria
    // que a aluna existe e que o vínculo um dia valeu.
    activeMembership({
      profissional: { role: GroupRole.PROFESSIONAL, status: MembershipStatus.REMOVED },
    });
    messages.push(
      await service
        .assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'x')
        .catch((err: Error) => err.message),
    );

    expect(new Set(messages).size).toBe(1);
    expect(messages).toHaveLength(4);
  });
});
