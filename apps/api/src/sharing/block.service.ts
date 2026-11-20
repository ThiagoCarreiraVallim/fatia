import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { MembershipStatus, PostAuthorAs } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { COMMUNITY_NAME_USER_SELECT, communityName } from './display-name';

export interface BlockInput {
  /** A comunidade da URL (ou da tool): o post e o comentário só valem dentro dela. */
  groupId: string;
  postId: string;
  /** Bloquear quem escreveu o comentário, e não o post. */
  commentId?: string | null;
}

export interface BlockView {
  id: string;
  /** Como a pessoa aparecia quando foi bloqueada. */
  label: string;
  /** Onde aconteceu; nulo se a comunidade não existe mais. */
  groupName: string | null;
  createdAt: Date;
}

/**
 * As contas que somem para `userId`: as que ele bloqueou e as que o
 * bloquearam. O bloqueio vale nos dois sentidos (prancha Cm-07), e quem foi
 * bloqueado não é avisado: para ele, a outra pessoa só parece ter sumido.
 */
export async function blockedUserIds(
  prisma: Pick<PrismaService, 'userBlock'>,
  userId: string,
): Promise<string[]> {
  const rows = await prisma.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [...new Set(rows.map((r) => (r.blockerId === userId ? r.blockedId : r.blockerId)))];
}

/** Há bloqueio, em qualquer sentido, entre as duas contas? */
export async function isBlockedBetween(
  prisma: Pick<PrismaService, 'userBlock'>,
  a: string,
  b: string,
): Promise<boolean> {
  if (a === b) return false;
  const n = await prisma.userBlock.count({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return n > 0;
}

/**
 * Bloquear pessoa (#394, Apple 1.2). O cliente nunca recebe o id da conta de
 * outra pessoa: bloqueia-se pelo post ou pelo comentário que se está vendo,
 * dentro da comunidade da URL. O bloqueio vale em todas as comunidades e no
 * mural inteiro (posts, comentários, reações e contagens), conferido pelo
 * `PostService` com `blockedUserIds`.
 */
@Injectable()
export class BlockService {
  constructor(private readonly prisma: PrismaService) {}

  async block(userId: string, input: BlockInput): Promise<BlockView> {
    const eu = await this.prisma.groupMembership.findUnique({
      where: { groupId_userId: { groupId: input.groupId, userId } },
      select: { status: true, group: { select: { name: true } } },
    });
    if (!eu || eu.status !== MembershipStatus.ACTIVE) throw new NotFoundException('Post not found');

    // Já bloqueado nos dois sentidos não acha o post: o 404 é o mesmo de "não existe".
    const escondidos = await blockedUserIds(this.prisma, userId);
    const post = await this.prisma.groupPost.findFirst({
      where: { id: input.postId, groupId: input.groupId, removedAt: null },
      select: {
        publishedAs: true,
        author: {
          select: {
            userId: true,
            displayName: true,
            user: { select: COMMUNITY_NAME_USER_SELECT },
          },
        },
      },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.publishedAs !== PostAuthorAs.GROUP && escondidos.includes(post.author.userId)) {
      throw new NotFoundException('Post not found');
    }

    let autor = post.author;
    if (input.commentId) {
      const c = await this.prisma.groupPostComment.findFirst({
        where: { id: input.commentId, postId: input.postId, removedAt: null },
        select: {
          author: {
            select: {
              userId: true,
              displayName: true,
              user: { select: COMMUNITY_NAME_USER_SELECT },
            },
          },
        },
      });
      if (!c) throw new NotFoundException('Comment not found');
      autor = c.author;
    } else if (post.publishedAs === PostAuthorAs.GROUP) {
      throw new BadRequestException('Este post é da comunidade, não de uma pessoa');
    }
    if (autor.userId === userId) throw new BadRequestException('Você não pode bloquear você mesmo');

    const label = communityName(autor);
    const row = await this.prisma.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId: userId, blockedId: autor.userId } },
      create: { blockerId: userId, blockedId: autor.userId, label, groupId: input.groupId },
      update: {},
      select: { id: true, label: true, createdAt: true },
    });
    return { ...row, groupName: eu.group.name };
  }

  /** Só o próprio bloqueio: o de outra pessoa responde como inexistente. */
  async unblock(userId: string, id: string): Promise<{ unblocked: true }> {
    const r = await this.prisma.userBlock.deleteMany({ where: { id, blockerId: userId } });
    if (r.count === 0) throw new NotFoundException('Block not found');
    return { unblocked: true };
  }

  /** Quem a pessoa bloqueou. Quem a bloqueou nunca aparece aqui. */
  async list(userId: string): Promise<BlockView[]> {
    const rows = await this.prisma.userBlock.findMany({
      where: { blockerId: userId },
      select: { id: true, label: true, createdAt: true, group: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.label,
      groupName: r.group?.name ?? null,
      createdAt: r.createdAt,
    }));
  }
}
