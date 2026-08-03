import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { GroupRole, MembershipStatus, ShareScope } from '@fatia/db';
import { AccessAuditService } from '../access-audit.service';
import { ProfessionalAccessService } from '../professional-access.service';
import type { PrismaService } from '../../common/prisma.service';

const PRO = 'pro-1';
const SUBJECT = 'aluno-1';
const GROUP = 'grupo-1';
const MEMBERSHIP = 'membership-1';

/**
 * A trilha de acesso (#155) — o que ela grava, e o que acontece quando ela não
 * consegue gravar.
 *
 * O caso decisivo é o último: a versão que engolia o erro de escrita deixava a
 * leitura passar sem registro nenhum, que é exatamente o resultado que uma
 * trilha existe para impedir. Nenhum teste de comportamento reprovava isso — a
 * resposta ao profissional era idêntica nos dois mundos.
 */
describe('AccessAuditService', () => {
  const makePrisma = () => ({ professionalAccessLog: { create: jest.fn() } });

  afterEach(() => jest.restoreAllMocks());

  it('grava a tentativa e não guarda nada do conteúdo lido', async () => {
    const prisma = makePrisma();
    prisma.professionalAccessLog.create.mockResolvedValue({});
    const audit = new AccessAuditService(prisma as unknown as PrismaService);

    await audit.record({
      linkId: 'link-1',
      professionalId: PRO,
      subjectUserId: SUBJECT,
      scope: ShareScope.NUTRITION,
      action: 'list_meals',
      denied: false,
    });

    // Asserção sobre as CHAVES: a trilha registra que houve leitura, nunca o
    // que foi lido. Guardar o conteúdo criaria uma segunda cópia do dado de
    // saúde dentro da tabela cujo propósito é protegê-lo.
    const { data } = prisma.professionalAccessLog.create.mock.calls[0][0];
    expect(Object.keys(data).sort()).toEqual([
      'action',
      'denied',
      'linkId',
      'professionalId',
      'scope',
      'subjectUserId',
    ]);
  });

  it('propaga a falha de escrita como 503, sem vazar o erro do banco', async () => {
    const prisma = makePrisma();
    prisma.professionalAccessLog.create.mockRejectedValue(
      new Error('relation "ProfessionalAccessLog" does not exist'),
    );
    const audit = new AccessAuditService(prisma as unknown as PrismaService);
    // O erro real vai para o log da aplicação; silenciado aqui só para o
    // relatório do Jest não virar ruído.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    const erro = await audit
      .record({
        linkId: null,
        professionalId: PRO,
        subjectUserId: SUBJECT,
        scope: ShareScope.WORKOUT,
        action: 'x',
        denied: true,
      })
      .catch((err: Error) => err);

    expect(erro).toBeInstanceOf(ServiceUnavailableException);
    // O detalhe do banco fica no log da aplicação, não na resposta.
    expect((erro as Error).message).not.toContain('ProfessionalAccessLog');
  });
});

/**
 * A trilha na porta de leitura. Rodam contra o `ProfessionalAccessService` de
 * verdade, com o `AccessAuditService` de verdade — o que se troca é só o Prisma.
 * Um mock do audit provaria que a porta o chama, e não que o registro chega
 * antes da resposta sair.
 */
describe('AccessAuditService dentro do assertReadable', () => {
  const makePrisma = (linkEncontrado: { id: string } | null) => ({
    groupMembership: {
      findUnique: jest.fn((args: { where: { id?: string } }) =>
        Promise.resolve(
          args.where.id === undefined
            ? { role: GroupRole.PROFESSIONAL, status: MembershipStatus.ACTIVE }
            : { userId: SUBJECT, groupId: GROUP, status: MembershipStatus.ACTIVE },
        ),
      ),
    },
    professionalLink: { findFirst: jest.fn().mockResolvedValue(linkEncontrado) },
    professionalAccessLog: { create: jest.fn().mockResolvedValue({}) },
  });

  afterEach(() => jest.restoreAllMocks());

  const montar = (prisma: ReturnType<typeof makePrisma>) =>
    new ProfessionalAccessService(
      prisma as unknown as PrismaService,
      new AccessAuditService(prisma as unknown as PrismaService),
    );

  it('a linha está gravada ANTES de a leitura ser liberada', async () => {
    const prisma = makePrisma({ id: 'link-1' });
    const ordem: string[] = [];
    prisma.professionalAccessLog.create.mockImplementation(async () => {
      // Um `then` sem `await` do outro lado devolveria o `userId` primeiro e
      // gravaria depois — e num crash entre as duas coisas some justamente o
      // registro que interessa.
      await Promise.resolve();
      ordem.push('gravou');
      return {};
    });

    await montar(prisma).assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'list_meals');
    ordem.push('respondeu');

    expect(ordem).toEqual(['gravou', 'respondeu']);
  });

  it.each([
    ['autorizada', { id: 'link-1' }],
    ['negada', null],
  ])('trilha indisponível barra a leitura %s', async (_caso, link) => {
    const prisma = makePrisma(link);
    prisma.professionalAccessLog.create.mockRejectedValue(new Error('banco fora do ar'));
    const service = montar(prisma);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    // Nos dois ramos: sem registro, não há leitura. É o inverso do que a versão
    // que engolia o erro fazia — ali a leitura autorizada passava e a trilha
    // ficava com um buraco que ninguém veria.
    await expect(
      service.assertReadable(PRO, MEMBERSHIP, ShareScope.WORKOUT, 'list_meals'),
    ).rejects.toThrow(ServiceUnavailableException);
  });
});
