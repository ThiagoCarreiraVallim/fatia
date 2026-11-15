import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { NEWS, NEWS_IDS, type NewsEntry } from './news-catalog';

export interface NewsItemView extends NewsEntry {
  unread: boolean;
}

export interface NewsView {
  items: NewsItemView[];
  unreadCount: number;
}

/** Ideia de até 1.000 caracteres: "Sugerir uma ideia" é texto curto, não relatório. */
export const IDEA_MAX = 1000;

/** Id de tutorial do catálogo do cliente (`tutorials.ts`): slug curto. */
export const TUTORIAL_ID = /^[a-z0-9-]{2,60}$/;

/**
 * O resto da aba Você que não é perfil nem conta (#387): novidades lidas,
 * tutoriais vistos e as ideias que a pessoa manda. Tudo amarrado ao `userId`
 * do token — nenhum id de pessoa vem do cliente.
 */
@Injectable()
export class YouService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * As novidades com o "novo" de cada uma. Só conta como não lida o que saiu
   * depois de a conta existir: quem chega hoje não abre a tela com uma pilha
   * de novidades velhas para "ler".
   */
  async news(userId: string): Promise<NewsView> {
    const [user, lidas] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.userNewsRead.findMany({ where: { userId }, select: { newsId: true } }),
    ]);
    const lido = new Set(lidas.map((l) => l.newsId));
    const desde = user.createdAt.toISOString().slice(0, 10);
    const items = NEWS.map((n) => ({ ...n, unread: !lido.has(n.id) && n.date >= desde }));
    return { items, unreadCount: items.filter((i) => i.unread).length };
  }

  /** Marca como lidas as novidades dadas, ou todas quando a lista não vem. */
  async markNewsRead(userId: string, ids?: string[]): Promise<NewsView> {
    const alvo = (ids ?? [...NEWS_IDS]).filter((id) => NEWS_IDS.has(id));
    if (alvo.length > 0) {
      await this.prisma.userNewsRead.createMany({
        data: alvo.map((newsId) => ({ userId, newsId })),
        skipDuplicates: true,
      });
    }
    return this.news(userId);
  }

  async tutorialsSeen(userId: string): Promise<{ seen: string[] }> {
    const rows = await this.prisma.userTutorialSeen.findMany({
      where: { userId },
      select: { tutorialId: true },
      orderBy: { seenAt: 'asc' },
    });
    return { seen: rows.map((r) => r.tutorialId) };
  }

  async markTutorialSeen(userId: string, tutorialId: string): Promise<{ seen: string[] }> {
    if (!TUTORIAL_ID.test(tutorialId)) throw new BadRequestException('Tutorial desconhecido.');
    await this.prisma.userTutorialSeen.upsert({
      where: { userId_tutorialId: { userId, tutorialId } },
      create: { userId, tutorialId },
      update: {},
    });
    return this.tutorialsSeen(userId);
  }

  async sendIdea(userId: string, body: string): Promise<{ sent: true }> {
    const texto = body.trim();
    if (!texto) throw new BadRequestException('Escreva a ideia antes de mandar.');
    if (texto.length > IDEA_MAX) {
      throw new BadRequestException(`A ideia tem no máximo ${IDEA_MAX} caracteres.`);
    }
    await this.prisma.feedbackIdea.create({ data: { userId, body: texto } });
    return { sent: true };
  }
}
