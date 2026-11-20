import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, ProfessionalLink, ShareScope } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { TEAM_ROLES, clipScopes, scopesForSpecialty, type Specialty } from './permissions';

/** Os papéis que recebem vínculo (ADR 026/043), como texto para o SQL. */
const LINK_RECEIVER_ROLES: readonly string[] = TEAM_ROLES;

/** Motivos possíveis de revogação. Gravados em `ProfessionalLink.revokedReason`. */
export type RevokeReason =
  'subject' | 'group_owner' | 'left_group' | 'membership_removed' | 'superseded' | 'role_changed';

/**
 * Escrita do consentimento. Separado do `ProfessionalAccessService` de
 * propósito: ali é a porta de leitura, e misturar as duas coisas faria a leitura
 * carregar métodos que mudam permissão.
 *
 * As rotas e tools que chamam isto são #154 (convite) e #155 (consentimento
 * operável). Esta issue entrega só o modelo e as invariantes.
 */
@Injectable()
export class ProfessionalLinkService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Concede (ou substitui) o consentimento do titular para um profissional
   * dentro de um grupo.
   *
   * `subjectUserId` é sempre o usuário autenticado — **só o titular consente**.
   * Nenhum papel de grupo consente em nome de outra pessoa.
   */
  async grant(params: {
    subjectUserId: string;
    professionalId: string;
    groupId: string;
    scopes: ShareScope[];
  }): Promise<ProfessionalLink> {
    const { subjectUserId, professionalId, groupId, scopes } = params;

    // Array e não `$transaction(async (tx) => ...)`: a ADR 010 registra que
    // transação interativa "falha de forma consistente" atrás do pgbouncer em
    // transaction pooling, e `workout-session.service.ts` já carrega a cicatriz.
    const [, link] = await this.prisma.$transaction([
      // Substituir em vez de atualizar mantém a trilha: cada concessão é uma
      // linha nova, e o que valia antes continua legível com sua janela de
      // vigência. É por isso que não existe @@unique no trio.
      this.prisma.professionalLink.updateMany({
        where: { subjectUserId, professionalId, groupId, revokedAt: null },
        data: { revokedAt: new Date(), revokedReason: 'superseded' satisfies RevokeReason },
      }),
      this.prisma.professionalLink.create({
        data: { subjectUserId, professionalId, groupId, scopes },
      }),
    ]);

    return link;
  }

  /**
   * Revoga um vínculo do próprio titular.
   *
   * O `where` inclui `subjectUserId` porque `linkId` chega por input: sem isso,
   * qualquer autenticado revogaria o vínculo de qualquer outro. Vínculo de
   * terceiro responde como inexistente, pelo mesmo motivo de sempre (#92).
   */
  async revokeAsSubject(subjectUserId: string, linkId: string): Promise<ProfessionalLink> {
    const revoked = await this.prisma.professionalLink.updateMany({
      where: { id: linkId, subjectUserId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'subject' satisfies RevokeReason },
    });
    if (revoked.count === 0) throw new NotFoundException('Link not found');

    // `updateMany` não devolve a linha; a releitura é escopada pelo titular.
    const link = await this.prisma.professionalLink.findFirst({
      where: { id: linkId, subjectUserId },
    });
    if (!link) throw new NotFoundException('Link not found');
    return link;
  }

  /**
   * Revoga em massa os vínculos de um grupo que envolvem um usuário — em
   * qualquer das duas pontas —, **sem executar**: devolve a operação para quem
   * precisa dela dentro de um `$transaction([...])`.
   *
   * Existe só nesta forma porque sair do grupo tem de mudar o status da
   * membership e apagar a permissão no mesmo commit (#154). Duas escritas
   * separadas abrem uma janela em que a associação já acabou e o vínculo ainda
   * autoriza leitura de dado de saúde — por isso não há variante que execute
   * sozinha: ela só serviria para reabrir essa janela. `at` entra por parâmetro
   * para que a membership e o vínculo fiquem com o mesmo instante.
   */
  revokeAllForMemberOp(
    groupId: string,
    userId: string,
    reason: Extract<RevokeReason, 'left_group' | 'membership_removed'>,
    at: Date,
  ): Prisma.PrismaPromise<{ count: number }> {
    return this.prisma.professionalLink.updateMany({
      where: {
        groupId,
        revokedAt: null,
        OR: [{ subjectUserId: userId }, { professionalId: userId }],
      },
      data: { revokedAt: at, revokedReason: reason },
    });
  }

  /**
   * Quem sai da equipe deixa de receber: revoga os vínculos vivos em que a
   * pessoa é destinatária naquele grupo, sem executar, para o mesmo
   * `$transaction` da troca de papel. O que ela própria compartilha fica como
   * está — continua membro, e o consentimento dela não mudou.
   */
  revokeAsReceiverOp(
    groupId: string,
    userId: string,
    at: Date,
  ): Prisma.PrismaPromise<{ count: number }> {
    return this.prisma.professionalLink.updateMany({
      where: { groupId, professionalId: userId, revokedAt: null },
      data: { revokedAt: at, revokedReason: 'role_changed' satisfies RevokeReason },
    });
  }

  /**
   * Revoga o vínculo vigente entre este titular e este profissional naquele
   * grupo, se houver. Devolve o vínculo revogado, ou `null` quando não havia
   * nenhum vivo.
   *
   * Existe para o "consentiu lista vazia": zerar as categorias tem de **apagar**
   * a permissão, não criar uma linha viva com zero escopos que ficaria no painel
   * do titular para sempre. Não recebe `linkId` — o alvo sai do par (titular,
   * profissional) já conferido, e nunca de input (#204).
   *
   * Sem vínculo vivo é no-op e não erro: quem nunca concedeu nada e manda `[]`
   * está pedindo o estado em que já está.
   */
  async revokeLiveGrant(params: {
    subjectUserId: string;
    professionalId: string;
    groupId: string;
  }): Promise<ProfessionalLink | null> {
    const { subjectUserId, professionalId, groupId } = params;

    const vigente = await this.prisma.professionalLink.findFirst({
      where: { subjectUserId, professionalId, groupId, revokedAt: null },
    });
    if (!vigente) return null;

    // `updateMany` com o `revokedAt: null` de novo no `where`: se uma revogação
    // concorrente chegou primeiro, esta não sobrescreve o instante nem o motivo
    // dela — e o titular recebe o mesmo resultado dos dois jeitos.
    await this.prisma.professionalLink.updateMany({
      where: { id: vigente.id, subjectUserId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'subject' satisfies RevokeReason },
    });

    return this.prisma.professionalLink.findFirst({ where: { id: vigente.id, subjectUserId } });
  }

  /**
   * O consentimento da comunidade (ADR 026), **sem executar**: substitui todos
   * os vínculos vivos do titular naquele grupo por um vínculo com `scopes` para
   * cada pessoa da equipe em `receivers`. Lista vazia de escopos só revoga.
   *
   * Operações para um `$transaction([...])` junto com a escrita da membership,
   * pelo mesmo motivo de `revokeAllForMemberOp`: aceite e autorização no mesmo
   * commit.
   */
  groupConsentOps(params: {
    subjectUserId: string;
    groupId: string;
    scopes: ShareScope[];
    receivers: string[];
    /**
     * A especialidade de cada destinatário (#404): a de nutrição recorta o que
     * o vínculo carrega. Ausente = sem recorte.
     */
    receiverSpecialty?: ReadonlyMap<string, Specialty | null>;
    at: Date;
  }): Prisma.PrismaPromise<unknown>[] {
    const { subjectUserId, groupId, scopes, at } = params;
    const receivers = params.receivers.filter((id) => id !== subjectUserId);
    const ops: Prisma.PrismaPromise<unknown>[] = [
      this.prisma.professionalLink.updateMany({
        where: { subjectUserId, groupId, revokedAt: null },
        data: { revokedAt: at, revokedReason: 'superseded' satisfies RevokeReason },
      }),
    ];
    const data = receivers
      .map((professionalId) => {
        const sp = params.receiverSpecialty?.get(professionalId) ?? null;
        return { u: professionalId, sp, c: clipScopes(scopes, sp) };
      })
      .filter((d) => d.c.length > 0);
    // O vínculo só nasce para quem, no instante do commit, ainda é da equipe
    // que recebe e tem a especialidade que foi lida (#404): a lista veio de
    // uma leitura anterior, e quem saiu ou virou nutricionista no meio não
    // pode ganhar o recorte de antes.
    if (data.length > 0) {
      ops.push(this.prisma.$executeRaw`
        INSERT INTO "ProfessionalLink"
          ("id", "subjectUserId", "professionalId", "groupId", "scopes", "grantedAt", "createdAt", "updatedAt")
        SELECT gen_random_uuid()::text, ${subjectUserId}, x.u, ${groupId},
          ARRAY(SELECT jsonb_array_elements_text(x.c))::"ShareScope"[], ${at}, ${at}, ${at}
        FROM jsonb_to_recordset(${JSON.stringify(data)}::jsonb) AS x(u text, sp text, c jsonb)
        JOIN "GroupMembership" gm ON gm."groupId" = ${groupId} AND gm."userId" = x.u
        WHERE gm."status" = 'ACTIVE'
          AND gm."role"::text = ANY(${[...LINK_RECEIVER_ROLES]}::text[])
          AND gm."specialty"::text IS NOT DISTINCT FROM x.sp`);
    }
    return ops;
  }

  /**
   * O leque inverso (ADR 026): quem acaba de entrar na equipe recebe o vínculo
   * de cada membro que já consentiu à comunidade, com os escopos que ele
   * escolheu. Sem executar, para o mesmo `$transaction` da entrada.
   */
  teamMemberLinksOps(params: {
    groupId: string;
    teamUserId: string;
    subjects: { userId: string; scopes: ShareScope[] }[];
    /** A especialidade de quem entra na equipe (#404); nutrição recorta. */
    specialty?: Specialty | null;
    at: Date;
  }): Prisma.PrismaPromise<unknown>[] {
    const { groupId, teamUserId, at } = params;
    const subjects = params.subjects
      .map((s) => ({ u: s.userId, s: s.scopes, c: clipScopes(s.scopes, params.specialty) }))
      .filter((s) => s.u !== teamUserId && s.c.length > 0);
    if (subjects.length === 0) return [];
    return [
      this.prisma.professionalLink.updateMany({
        where: {
          groupId,
          professionalId: teamUserId,
          subjectUserId: { in: subjects.map((s) => s.u) },
          revokedAt: null,
        },
        data: { revokedAt: at, revokedReason: 'superseded' satisfies RevokeReason },
      }),
      // O consentimento de cada membro foi lido antes do commit (#404): o
      // vínculo só nasce se, no commit, ele continua ativo e com o mesmo
      // consentimento. Quem revogou ou mudou no meio não é ressuscitado.
      this.prisma.$executeRaw`
        INSERT INTO "ProfessionalLink"
          ("id", "subjectUserId", "professionalId", "groupId", "scopes", "grantedAt", "createdAt", "updatedAt")
        SELECT gen_random_uuid()::text, x.u, ${teamUserId}, ${groupId},
          ARRAY(SELECT jsonb_array_elements_text(x.c))::"ShareScope"[], ${at}, ${at}, ${at}
        FROM jsonb_to_recordset(${JSON.stringify(subjects)}::jsonb) AS x(u text, s jsonb, c jsonb)
        JOIN "GroupMembership" gm ON gm."groupId" = ${groupId} AND gm."userId" = x.u
        WHERE gm."status" = 'ACTIVE'
          AND gm."consentScopes" = ARRAY(SELECT jsonb_array_elements_text(x.s))::"ShareScope"[]`,
    ];
  }

  /**
   * A especialidade mudou (#404): os vínculos vivos que a pessoa recebe neste
   * grupo encolhem para o que a especialidade permite. Só encolhem: voltar de
   * nutrição para treino não devolve categoria sem novo aceite (ADR 043 §5).
   * Cada vínculo cortado vira linha nova (a trilha fica), e o que fica vazio só
   * é revogado.
   *
   * Lê agora e devolve as escritas para o `$transaction` de quem chama. A
   * leitura é anterior ao commit, então cada vínculo é revogado e recriado
   * **num só comando**: a linha nova só nasce se a revogação daquele vínculo
   * casou (`revokedAt IS NULL` no commit). Se o titular revogou no meio, nada
   * volta.
   */
  async narrowReceiverOps(
    groupId: string,
    userId: string,
    specialty: Specialty | null,
    at: Date,
  ): Promise<{ ops: Prisma.PrismaPromise<unknown>[]; narrowed: number }> {
    const pode = scopesForSpecialty(specialty);
    const vivos = await this.prisma.professionalLink.findMany({
      where: { groupId, professionalId: userId, revokedAt: null },
      select: { id: true, scopes: true },
    });
    const cortar = vivos.filter((v) => v.scopes.some((s) => !pode.includes(s)));
    const reason: RevokeReason = 'role_changed';
    return {
      narrowed: cortar.length,
      ops: cortar.map((v) => {
        const fica = clipScopes(v.scopes, specialty);
        return fica.length === 0
          ? this.prisma.professionalLink.updateMany({
              where: { id: v.id, revokedAt: null },
              data: { revokedAt: at, revokedReason: reason },
            })
          : this.prisma.$executeRaw`
              WITH revogado AS (
                UPDATE "ProfessionalLink"
                SET "revokedAt" = ${at}, "revokedReason" = ${reason}, "updatedAt" = ${at}
                WHERE "id" = ${v.id} AND "revokedAt" IS NULL
                RETURNING "subjectUserId", "professionalId", "groupId"
              )
              INSERT INTO "ProfessionalLink"
                ("id", "subjectUserId", "professionalId", "groupId", "scopes", "grantedAt", "createdAt", "updatedAt")
              SELECT gen_random_uuid()::text, r."subjectUserId", r."professionalId", r."groupId",
                ${fica}::text[]::"ShareScope"[], ${at}, ${at}, ${at}
              FROM revogado r`;
      }),
    };
  }

  /** Vínculos ativos que o titular concedeu. Base do painel de consentimento (#155). */
  async listActiveGrantedBy(subjectUserId: string): Promise<ProfessionalLink[]> {
    return this.prisma.professionalLink.findMany({
      where: { subjectUserId, revokedAt: null },
      orderBy: { grantedAt: 'desc' },
    });
  }
}
