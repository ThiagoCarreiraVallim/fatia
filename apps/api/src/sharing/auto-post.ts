import { Logger } from '@nestjs/common';
import { AutoPostKind, MembershipStatus, PostKind, type Prisma } from '@fatia/db';
import type { PrismaService } from '../common/prisma.service';

export const AUTO_POST_KINDS = Object.values(AutoPostKind);

export interface AutoPostInput {
  groupId: string;
  /** Quem publicou o conteúdo: o post aparece em nome dele ("Helena publicou um plano"). */
  actorUserId: string;
  kind: AutoPostKind;
  refId: string;
  title: string;
  /** Uma linha de contexto ("4 exercícios", "nutrição"). */
  meta?: string | null;
}

const logger = new Logger('AutoPost');

/**
 * Post automático no mural quando a equipe publica conteúdo novo (#394,
 * prancha Pn-14): plano, dica, exercício da casa ou desafio. Liga e desliga
 * por tipo em `Group.autoPosts`.
 *
 * Função e não service: quem chama já tem o Prisma, e o post é um efeito
 * colateral que **nunca** derruba a publicação do conteúdo — erro aqui vira
 * log. Republicar o mesmo conteúdo não repete o post (`autoKind` + `autoRefId`).
 */
export async function publishAutoPost(
  prisma: Pick<PrismaService, 'group' | 'groupMembership' | 'groupPost'>,
  input: AutoPostInput,
): Promise<string | null> {
  try {
    const grupo = await prisma.group.findUnique({
      where: { id: input.groupId },
      select: { autoPosts: true },
    });
    if (!grupo?.autoPosts.includes(input.kind)) return null;
    const autor = await prisma.groupMembership.findFirst({
      where: { groupId: input.groupId, userId: input.actorUserId, status: MembershipStatus.ACTIVE },
      select: { id: true },
    });
    if (!autor) return null;
    const ja = await prisma.groupPost.findFirst({
      where: { groupId: input.groupId, autoKind: input.kind, autoRefId: input.refId },
      select: { id: true },
    });
    if (ja) return null;
    const data: Prisma.GroupPostUncheckedCreateInput = {
      groupId: input.groupId,
      membershipId: autor.id,
      kind: PostKind.AUTO,
      autoKind: input.kind,
      autoRefId: input.refId,
      title: input.title.slice(0, 200),
      body: (input.meta ?? '').slice(0, 200),
    };
    const post = await prisma.groupPost.create({ data, select: { id: true } });
    return post.id;
  } catch (err) {
    logger.warn(`Post automático não saiu: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
