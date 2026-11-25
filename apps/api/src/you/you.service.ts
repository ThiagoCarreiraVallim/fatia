import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { GroupRole, MembershipStatus, type IdeaArea } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { NEWS, NEWS_IDS, type NewsEntry } from './news-catalog';
import { PANEL_NEWS, PANEL_NEWS_IDS, type PanelNewsEntry } from './panel-news-catalog';

export interface NewsItemView extends NewsEntry {
  unread: boolean;
}

export interface NewsView {
  items: NewsItemView[];
  unreadCount: number;
}

export interface PanelNewsItemView extends PanelNewsEntry {
  unread: boolean;
}

export interface PanelNewsView {
  items: PanelNewsItemView[];
  unreadCount: number;
}

/** Ideia de até 1.000 caracteres: "Sugerir uma ideia" é texto curto, não relatório. */
export const IDEA_MAX = 1000;

/** Id de tutorial do catálogo do cliente (`tutorials.ts`): slug curto. */
export const TUTORIAL_ID = /^[a-z0-9-]{2,60}$/;

/**
 * O catálogo mora no cliente, então a API não sabe quais slugs existem. O teto
 * impede que um cliente fabrique linhas sem fim; o catálogo real tem dezenas.
 */
export const TUTORIALS_SEEN_MAX = 200;

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

  /**
   * As novidades do painel (#413, Pn-27): só para quem é da equipe de alguma
   * comunidade. Para os outros, a rota não existe (404), como o resto do painel.
   * Mesma regra do "novo" das do aluno: só conta o que saiu depois da conta.
   */
  async panelNews(userId: string): Promise<PanelNewsView> {
    await this.requireTeamSomewhere(userId);
    return this.panelNewsOf(userId);
  }

  /** Marca as do painel dadas, ou todas; id do aluno ou inventado não grava nada. */
  async markPanelNewsRead(userId: string, ids?: string[]): Promise<PanelNewsView> {
    await this.requireTeamSomewhere(userId);
    const alvo = (ids ?? [...PANEL_NEWS_IDS]).filter((id) => PANEL_NEWS_IDS.has(id));
    if (alvo.length > 0) {
      await this.prisma.userNewsRead.createMany({
        data: alvo.map((newsId) => ({ userId, newsId })),
        skipDuplicates: true,
      });
    }
    return this.panelNewsOf(userId);
  }

  private async panelNewsOf(userId: string): Promise<PanelNewsView> {
    const [user, lidas] = await Promise.all([
      this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { createdAt: true } }),
      this.prisma.userNewsRead.findMany({
        where: { userId, newsId: { in: [...PANEL_NEWS_IDS] } },
        select: { newsId: true },
      }),
    ]);
    const lido = new Set(lidas.map((l) => l.newsId));
    const desde = user.createdAt.toISOString().slice(0, 10);
    const items = PANEL_NEWS.map((n) => ({ ...n, unread: !lido.has(n.id) && n.date >= desde }));
    return { items, unreadCount: items.filter((i) => i.unread).length };
  }

  private async requireTeamSomewhere(userId: string): Promise<void> {
    const equipe = await this.prisma.groupMembership.count({
      where: { userId, status: MembershipStatus.ACTIVE, role: { not: GroupRole.MEMBER } },
    });
    if (equipe === 0) throw new NotFoundException('Not found');
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
    const [already, total] = await Promise.all([
      this.prisma.userTutorialSeen.count({ where: { userId, tutorialId } }),
      this.prisma.userTutorialSeen.count({ where: { userId } }),
    ]);
    if (!already && total >= TUTORIALS_SEEN_MAX) {
      throw new BadRequestException('Tutorial desconhecido.');
    }
    await this.prisma.userTutorialSeen.upsert({
      where: { userId_tutorialId: { userId, tutorialId } },
      create: { userId, tutorialId },
      update: {},
    });
    return this.tutorialsSeen(userId);
  }

  /** A ideia do aluno vem sem área; a da equipe (Pn-27) diz onde ajudaria. */
  async sendIdea(userId: string, body: string, area?: IdeaArea): Promise<{ sent: true }> {
    const texto = body.trim();
    if (!texto) throw new BadRequestException('Escreva a ideia antes de mandar.');
    if (texto.length > IDEA_MAX) {
      throw new BadRequestException(`A ideia tem no máximo ${IDEA_MAX} caracteres.`);
    }
    await this.prisma.feedbackIdea.create({ data: { userId, body: texto, area: area ?? null } });
    return { sent: true };
  }
}
