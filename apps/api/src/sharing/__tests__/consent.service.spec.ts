import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { GroupRole, MembershipStatus, ShareScope } from '@fatia/db';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ConsentService } from '../consent.service';
import { GrantConsentDto } from '../dto/consent.dto';
import type { ProfessionalLinkService } from '../professional-link.service';
import type { PrismaService } from '../../common/prisma.service';

const SUBJECT = 'aluno-1';
const PRO = 'pro-1';
const GROUP = 'grupo-1';
const PRO_MEMBERSHIP = 'membership-pro';

const makePrisma = () => ({
  groupMembership: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
  group: { findUnique: jest.fn().mockResolvedValue({ name: 'Academia' }), findMany: jest.fn() },
  user: { findUnique: jest.fn().mockResolvedValue({ name: 'Personal' }), findMany: jest.fn() },
  professionalAccessLog: { findMany: jest.fn().mockResolvedValue([]) },
});

const makeLinks = () => ({
  grant: jest.fn().mockResolvedValue({
    id: 'link-1',
    groupId: GROUP,
    scopes: [ShareScope.WORKOUT],
    grantedAt: new Date('2026-03-01'),
  }),
  revokeAsSubject: jest.fn(),
  revokeLiveGrant: jest.fn().mockResolvedValue(null),
  listActiveGrantedBy: jest.fn().mockResolvedValue([]),
});

/** A associação do profissional, no estado que autoriza receber consentimento. */
const membershipDoPro = (over: Record<string, unknown> = {}) => ({
  id: PRO_MEMBERSHIP,
  userId: PRO,
  groupId: GROUP,
  role: GroupRole.PROFESSIONAL,
  status: MembershipStatus.ACTIVE,
  ...over,
});

describe('ConsentService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let links: ReturnType<typeof makeLinks>;
  let service: ConsentService;

  beforeEach(() => {
    prisma = makePrisma();
    links = makeLinks();
    service = new ConsentService(
      prisma as unknown as PrismaService,
      links as unknown as ProfessionalLinkService,
    );
  });

  /** Alvo encontrado + titular ativo no mesmo grupo. */
  const cenarioFeliz = (alvo = membershipDoPro()) => {
    prisma.groupMembership.findUnique
      .mockResolvedValueOnce(alvo)
      .mockResolvedValueOnce({ status: MembershipStatus.ACTIVE });
  };

  describe('grant', () => {
    it('normaliza escopos repetidos sem duplicar, na ordem do enum', async () => {
      cenarioFeliz();

      await service.grant(SUBJECT, PRO_MEMBERSHIP, [
        ShareScope.NUTRITION,
        ShareScope.WORKOUT,
        ShareScope.NUTRITION,
      ]);

      // `scopes: { has: scope }` casa igual com repetição, então duplicata não
      // abriria acesso nenhum — mas gravaria um array que a UI mostraria como
      // "alimentação, treino, alimentação" e que nenhuma comparação de "mudou?"
      // acertaria.
      expect(links.grant).toHaveBeenCalledWith(
        expect.objectContaining({ scopes: [ShareScope.WORKOUT, ShareScope.NUTRITION] }),
      );
    });

    it('lista vazia revoga o vínculo vigente e não cria concessão nenhuma', async () => {
      cenarioFeliz();
      links.revokeLiveGrant.mockResolvedValue({
        id: 'link-1',
        groupId: GROUP,
        scopes: [ShareScope.WORKOUT],
        grantedAt: new Date('2026-03-01'),
      });

      const view = await service.grant(SUBJECT, PRO_MEMBERSHIP, []);

      // "Equivale a revogar" é o que as duas tools prometem. Gravar concessão de
      // zero escopos deixaria uma linha VIVA que `list_data_sharing` devolveria
      // para sempre — um profissional na lista de "quem tem acesso" sem acesso a
      // nada, e o titular revogando o que já zerou.
      expect(links.revokeLiveGrant).toHaveBeenCalledWith({
        subjectUserId: SUBJECT,
        professionalId: PRO,
        groupId: GROUP,
      });
      expect(links.grant).not.toHaveBeenCalled();
      // O vínculo revogado não volta na resposta como se estivesse valendo: sem
      // `linkId` não há o que revogar de novo, e sem `grantedAt` não há vigência.
      expect(view).toMatchObject({ linkId: null, grantedAt: null, scopes: [] });
    });

    it('lista vazia de quem nunca concedeu nada é no-op, não erro', async () => {
      cenarioFeliz();
      links.revokeLiveGrant.mockResolvedValue(null);

      await expect(service.grant(SUBJECT, PRO_MEMBERSHIP, [])).resolves.toMatchObject({
        linkId: null,
        scopes: [],
        professionalMembershipId: PRO_MEMBERSHIP,
      });
    });

    it('tira grupo e profissional da associação lida, nunca do input', async () => {
      cenarioFeliz();

      await service.grant(SUBJECT, PRO_MEMBERSHIP, [ShareScope.WORKOUT]);

      expect(links.grant).toHaveBeenCalledWith(
        expect.objectContaining({ subjectUserId: SUBJECT, professionalId: PRO, groupId: GROUP }),
      );
      // O titular é conferido no MESMO grupo da linha lida: sem isto, um id de
      // associação de outro contexto criaria vínculo onde o titular não está.
      expect(prisma.groupMembership.findUnique).toHaveBeenNthCalledWith(2, {
        where: { groupId_userId: { groupId: GROUP, userId: SUBJECT } },
        select: { status: true },
      });
    });

    it('recusa quando o titular não está no grupo do alvo, sem dizer que ele existe', async () => {
      prisma.groupMembership.findUnique
        .mockResolvedValueOnce(membershipDoPro())
        .mockResolvedValueOnce(null);

      const deForaDoGrupo = await service.grant(SUBJECT, PRO_MEMBERSHIP, []).catch((e: Error) => e);

      prisma.groupMembership.findUnique.mockReset();
      prisma.groupMembership.findUnique.mockResolvedValueOnce(null);
      const inexistente = await service.grant(SUBJECT, 'nao-existe', []).catch((e: Error) => e);

      // Byte a byte: a recusa não pode denunciar que a associação existe, senão
      // a rota vira oráculo de composição de grupo alheio.
      expect(deForaDoGrupo).toBeInstanceOf(NotFoundException);
      expect((deForaDoGrupo as Error).message).toBe((inexistente as Error).message);
      expect(links.grant).not.toHaveBeenCalled();
    });

    it.each([GroupRole.OWNER, GroupRole.CREATOR, GroupRole.MEMBER])(
      'recusa consentimento para %s — papel não elegível a vínculo',
      async (role) => {
        cenarioFeliz(membershipDoPro({ role }));

        await expect(service.grant(SUBJECT, PRO_MEMBERSHIP, [ShareScope.WORKOUT])).rejects.toThrow(
          ConflictException,
        );
        expect(links.grant).not.toHaveBeenCalled();
      },
    );

    it('recusa profissional que já não está ativo no grupo', async () => {
      cenarioFeliz(membershipDoPro({ status: MembershipStatus.REMOVED }));

      await expect(service.grant(SUBJECT, PRO_MEMBERSHIP, [ShareScope.WORKOUT])).rejects.toThrow(
        ConflictException,
      );
      expect(links.grant).not.toHaveBeenCalled();
    });

    it('recusa consentir para si mesmo', async () => {
      cenarioFeliz(membershipDoPro({ userId: SUBJECT }));

      await expect(service.grant(SUBJECT, PRO_MEMBERSHIP, [ShareScope.WORKOUT])).rejects.toThrow(
        ConflictException,
      );
      expect(links.grant).not.toHaveBeenCalled();
    });
  });

  describe('listAccessLog', () => {
    it('escopa a trilha pelo titular e limita a página', async () => {
      await service.listAccessLog(SUBJECT, 5000);

      const [{ where, take, orderBy }] = prisma.professionalAccessLog.findMany.mock.calls[0];
      expect(where).toEqual({ subjectUserId: SUBJECT });
      expect(orderBy).toEqual({ at: 'desc' });
      // Teto aplicado no service, e não só no DTO: a tool MCP e o controller são
      // duas bordas, e um `take` sem teto num modelo que cresce por requisição
      // atendida é o jeito mais fácil de derrubar o painel do aluno.
      expect(take).toBe(200);
    });

    it('devolve o nome de quem tentou, e null quando a conta sumiu', async () => {
      prisma.professionalAccessLog.findMany.mockResolvedValue([
        {
          at: new Date(),
          action: 'probe',
          scope: ShareScope.WORKOUT,
          denied: true,
          professionalId: PRO,
        },
        {
          at: new Date(),
          action: 'probe',
          scope: ShareScope.WORKOUT,
          denied: false,
          professionalId: 'apagado',
        },
      ]);
      prisma.user.findMany.mockResolvedValue([{ id: PRO, name: 'Personal' }]);

      const trilha = await service.listAccessLog(SUBJECT);

      // `professionalId` é string sem FK justamente para a trilha sobreviver ao
      // profissional apagar a conta. O preço é este `null`, e ele tem de chegar
      // à UI em vez de derrubar a leitura.
      expect(trilha.map((l) => l.professionalName)).toEqual(['Personal', null]);
    });
  });
});

describe('superfície de escrita do vínculo', () => {
  const API_SRC = resolve(__dirname, '../..');

  it('só um arquivo cria ProfessionalLink', () => {
    // Critério de pronto da #155, virado teste: "não existe caminho que crie
    // `ProfessionalLink` sem `ctx.userId === subjectUserId`". Isso é verificável
    // porque a criação mora num lugar só — se aparecer um segundo `create`, a
    // afirmação passa a depender de auditar dois caminhos, e o segundo é sempre
    // o que alguém esquece.
    const criadores = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
      .filter((entry) => entry.endsWith('.ts') && !entry.includes('__tests__'))
      .filter((entry) =>
        /professionalLink\.create\(/.test(readFileSync(join(API_SRC, entry), 'utf8')),
      )
      .sort();

    expect(criadores).toEqual(['sharing/professional-link.service.ts']);
  });

  it('nenhum service de domínio conhece ProfessionalLink', () => {
    // A ADR 014 em uma linha: os services de domínio ignoram que grupo existe.
    // Uma leitura nova que consultasse o vínculo por conta própria tornaria o
    // consentimento decoração, e nenhum teste de comportamento reprovaria.
    const DOMINIOS = ['nutrition', 'workout', 'progress', 'goals', 'users'];

    const vazados = readdirSync(API_SRC, { recursive: true, encoding: 'utf8' })
      .filter((entry) => entry.endsWith('.ts') && !entry.includes('__tests__'))
      .filter((entry) => DOMINIOS.some((dominio) => entry.startsWith(`${dominio}/`)))
      .filter((entry) => /professionalLink\./.test(readFileSync(join(API_SRC, entry), 'utf8')))
      .sort();

    // `users/account.service.ts` é a exceção declarada: o export da LGPD devolve
    // o consentimento do titular, escopado por `subjectUserId`. Não é leitura de
    // dado de terceiro — é o próprio ato do titular voltando para ele.
    expect(vazados).toEqual(['users/account.service.ts']);
  });
});

describe('a política pública promete só a superfície que existe', () => {
  const REPO_ROOT = resolve(__dirname, '../../../../..');
  const PRIVACY = resolve(REPO_ROOT, 'apps/web/src/app/(public)/privacy/page.tsx');
  const ROTAS_DO_APP = resolve(REPO_ROOT, 'apps/web/src/app/(app)');

  it('não manda o usuário exercer o direito "pelo app" enquanto não houver tela', () => {
    // `/privacy` é documento legal, e a LGPD art. 18 é sobre o direito ser
    // **exercível**. Apontar para uma tela que não existe manda o titular
    // procurar no PWA um lugar que ninguém construiu — e a promessa não
    // apodrece sozinha: quando a #157 criar a tela, este caso deixa a frase
    // voltar, em vez de depender de alguém lembrar.
    const pagina = readFileSync(PRIVACY, 'utf8');
    expect(pagina).toContain('pedindo ao Claude');

    const telas = readdirSync(ROTAS_DO_APP, { recursive: true, encoding: 'utf8' }).filter((entry) =>
      /(consent|sharing|grupo|group)/i.test(entry),
    );
    const promessa = pagina.includes('pelo app') ? ['/privacy diz "pelo app"'] : [];

    expect(telas.length > 0 ? [] : promessa).toEqual([]);
  });
});

describe('GrantConsentDto', () => {
  const validar = (payload: unknown) =>
    validate(plainToInstance(GrantConsentDto, payload), {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

  it('rejeita escopo fora do enum na borda', async () => {
    const erros = await validar({
      professionalMembershipId: '11111111-2222-4333-8444-555555555555',
      scopes: ['WORKOUT', 'SALARIO'],
    });

    // Sem isto o valor chegaria ao Prisma e viraria 500 — ou, pior, gravaria um
    // array que nenhuma leitura casaria, dando ao titular a impressão de ter
    // consentido algo que não existe.
    expect(erros.map((e) => e.property)).toEqual(['scopes']);
  });

  it('aceita lista vazia e recusa id que não é UUID', async () => {
    expect(
      await validar({
        professionalMembershipId: '11111111-2222-4333-8444-555555555555',
        scopes: [],
      }),
    ).toEqual([]);

    expect(
      (await validar({ professionalMembershipId: 'nao-e-uuid', scopes: [] })).map(
        (e) => e.property,
      ),
    ).toEqual(['professionalMembershipId']);
  });
});
