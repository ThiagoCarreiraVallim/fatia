import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../common/prisma.service';

type LinkReader = PrismaService | Prisma.TransactionClient;

/**
 * Política da oferta (#379): ela só vale enquanto quem enviou tem
 * `ProfessionalLink` ativo com a pessoa, na comunidade em que enviou. Sem o
 * vínculo (revogado, saiu da comunidade, autor apagado), a oferta pendente
 * some das listas e não se responde mais; o plano já aceito continua da
 * pessoa.
 *
 * Funções soltas, e não um service: o Hoje (`DashboardService`) filtra com a
 * mesma regra sem depender do módulo de compartilhamento.
 */

/** Os vínculos ativos da pessoa: com quem e em qual comunidade. */
export function activeLinksOf(db: LinkReader, userId: string) {
  return db.professionalLink.findMany({
    where: { subjectUserId: userId, revokedAt: null },
    select: { professionalId: true, groupId: true },
  });
}

type OfferParties = { authorId: string | null; groupId: string | null };

/** A oferta tem vínculo ativo entre os vínculos lidos. */
export function isLinked(
  offer: OfferParties,
  links: ReadonlyArray<{ professionalId: string; groupId: string }>,
): boolean {
  return links.some((l) => l.professionalId === offer.authorId && l.groupId === offer.groupId);
}

/** O filtro de `PlanOffer` das ofertas com vínculo ativo; nulo quando não há nenhum. */
export function linkedOffersWhere(
  links: ReadonlyArray<{ professionalId: string; groupId: string }>,
): Prisma.PlanOfferWhereInput | null {
  if (links.length === 0) return null;
  return { OR: links.map((l) => ({ authorId: l.professionalId, groupId: l.groupId })) };
}

/** O vínculo ativo de uma oferta só, conferido no banco. */
export async function hasActiveLink(
  db: LinkReader,
  offer: OfferParties & { userId: string },
): Promise<boolean> {
  if (!offer.authorId || !offer.groupId) return false;
  const link = await db.professionalLink.findFirst({
    where: {
      subjectUserId: offer.userId,
      professionalId: offer.authorId,
      groupId: offer.groupId,
      revokedAt: null,
    },
    select: { id: true },
  });
  return link !== null;
}
