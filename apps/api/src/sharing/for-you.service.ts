import { Injectable } from '@nestjs/common';
import {
  NutritionPlanStatus,
  PlanOfferStatus,
  PostAuthorAs,
  PostKind,
  type Prisma,
} from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { blockedUserIds } from './block.service';
import { COMMUNITY_NAME_USER_SELECT, communityName } from './display-name';
import { requireContentRole } from './content-roles';

export type ForYouKind = 'PLAN_OFFER' | 'NUTRITION_PLAN';

export interface ForYouItem {
  kind: ForYouKind;
  id: string;
  title: string;
  /** "Trocou 2 exercícios…": o recado de quem mandou, quando há. */
  note: string | null;
  from: string | null;
  at: Date;
  /** A tela que já existe para resolver (aceitar, ver o que mudou). */
  href: string;
}

export interface ForYouNotice {
  postId: string;
  title: string;
  from: string;
  at: Date;
  unread: boolean;
}

export interface ForYouRecommendation {
  kind: 'PLAN' | 'TIP';
  id: string;
  title: string;
  meta: string;
  href: string;
}

export interface ForYouView {
  /** O número da aba: o que falta fazer mais os comunicados não vistos. */
  count: number;
  todo: ForYouItem[];
  recommended: ForYouRecommendation[];
  fromTeam: ForYouNotice[];
  done: ForYouItem[];
}

const DONE_LIMIT = 5;
const NOTICE_DAYS = 30;

/**
 * A aba "Para você" da comunidade (#394, prancha Cm-20): o que a equipe desta
 * comunidade mandou **só para a pessoa** (plano de treino e plano alimentar
 * esperando resposta), os comunicados recentes (não lidos = depois da última
 * visita ao mural e de outra pessoa; os ocultados ficam de fora), o conteúdo
 * publicado mais novo e o que já foi resolvido.
 *
 * Tudo é da própria pessoa (`userId`) e da comunidade da URL. Avaliação
 * pedida (#383) e questionário (#391) entram quando as issues deles criarem os
 * dados; os itens levam às telas que já existem.
 */
@Injectable()
export class ForYouService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string, groupId: string): Promise<ForYouView> {
    await requireContentRole(this.prisma, userId, groupId, 'post.read');
    const m = await this.prisma.groupMembership.findUniqueOrThrow({
      where: { groupId_userId: { groupId, userId } },
      select: {
        id: true,
        feedSeenAt: true,
        joinedAt: true,
        createdAt: true,
        group: { select: { name: true } },
      },
    });
    const vistoAte = m.feedSeenAt ?? m.joinedAt ?? m.createdAt;
    const escondidos = await blockedUserIds(this.prisma, userId);

    const [ofertas, planos, comunicados, modelos, dicas] = await Promise.all([
      this.prisma.planOffer.findMany({
        // A oferta que a equipe apagou pela ficha (#402) some daqui também.
        where: { userId, groupId, removedAt: null },
        include: {
          author: { select: { name: true } },
          versions: { orderBy: { version: 'desc' }, take: 1 },
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
      this.prisma.nutritionPlan.findMany({
        where: { userId, groupId, status: { not: NutritionPlanStatus.SUPERSEDED } },
        include: { author: { select: { name: true } } },
        orderBy: { sentAt: 'desc' },
        take: 20,
      }),
      this.prisma.groupPost.findMany({
        where: {
          groupId,
          kind: PostKind.ANNOUNCEMENT,
          removedAt: null,
          createdAt: { gte: new Date(Date.now() - NOTICE_DAYS * 86_400_000) },
          // O que a pessoa ocultou do mural também não aparece aqui.
          hides: { none: { membershipId: m.id } },
          ...(escondidos.length > 0
            ? {
                OR: [
                  { publishedAs: PostAuthorAs.GROUP },
                  { author: { userId: { notIn: escondidos } } },
                ],
              }
            : {}),
        } satisfies Prisma.GroupPostWhereInput,
        select: {
          id: true,
          title: true,
          createdAt: true,
          publishedAs: true,
          author: {
            select: {
              userId: true,
              displayName: true,
              user: { select: COMMUNITY_NAME_USER_SELECT },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
      this.prisma.groupPlanTemplate.findMany({
        where: { groupId, publishedAt: { not: null } },
        select: { id: true, title: true, kind: true, author: { select: { name: true } } },
        orderBy: { publishedAt: 'desc' },
        take: 2,
      }),
      this.prisma.groupTip.findMany({
        where: { groupId, publishedAt: { not: null } },
        select: { id: true, title: true, author: { select: { name: true } } },
        orderBy: { publishedAt: 'desc' },
        take: 1,
      }),
    ]);

    const firstWord = (n: string | null | undefined) => (n ? n.split(/\s+/)[0]! : null);
    const todo: ForYouItem[] = [];
    const done: ForYouItem[] = [];
    for (const o of ofertas) {
      const v = o.versions[0];
      if (!v) continue;
      const item: ForYouItem = {
        kind: 'PLAN_OFFER',
        id: o.id,
        title: v.version > 1 ? `${v.title} · versão ${v.version}` : v.title,
        // A versão nova mostra o que mudou (#405, Cm-20); a primeira, o recado.
        note: v.changeNote ?? v.note,
        from: o.author?.name ?? null,
        at: v.status === PlanOfferStatus.PENDING ? v.sentAt : (v.respondedAt ?? v.sentAt),
        href: `/workout/offers/${o.id}`,
      };
      if (v.status === PlanOfferStatus.PENDING) todo.push(item);
      else if (v.status === PlanOfferStatus.ACCEPTED) done.push(item);
    }
    for (const p of planos) {
      const item: ForYouItem = {
        kind: 'NUTRITION_PLAN',
        id: p.id,
        title: `Plano alimentar · ${p.kcalMin}–${p.kcalMax} kcal`,
        note: p.changeNote ?? p.note,
        from: p.author?.name ?? null,
        at: p.acceptedAt ?? p.sentAt,
        href: '/nutrition/plan',
      };
      if (p.status === NutritionPlanStatus.SENT) todo.push(item);
      else done.push(item);
    }

    const fromTeam = comunicados.map((c) => ({
      postId: c.id,
      title: c.title ?? '',
      from: c.publishedAs === PostAuthorAs.GROUP ? m.group.name : communityName(c.author),
      at: c.createdAt,
      // O comunicado que a própria pessoa mandou não é novidade para ela.
      unread: c.createdAt > vistoAte && c.author.userId !== userId,
    }));
    const recommended: ForYouRecommendation[] = [
      ...modelos.map((t) => ({
        kind: 'PLAN' as const,
        id: t.id,
        title: t.title,
        meta: `${t.kind === 'WORKOUT' ? 'Treino' : 'Plano alimentar'}${
          t.author ? ` · ${firstWord(t.author.name)}` : ''
        }`,
        href: `/community/${groupId}/content/${t.id}`,
      })),
      ...dicas.map((d) => ({
        kind: 'TIP' as const,
        id: d.id,
        title: d.title,
        meta: `Dica${d.author ? ` · ${firstWord(d.author.name)}` : ''}`,
        href: `/community/${groupId}/content`,
      })),
    ];
    done.sort((a, b) => b.at.getTime() - a.at.getTime());

    return {
      count: todo.length + fromTeam.filter((n) => n.unread).length,
      todo: todo.sort((a, b) => b.at.getTime() - a.at.getTime()),
      recommended,
      fromTeam,
      done: done.slice(0, DONE_LIMIT),
    };
  }
}
