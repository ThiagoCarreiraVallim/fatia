import { BadRequestException, Injectable } from '@nestjs/common';
import { MembershipStatus, type GroupRole, type GroupWelcomeKind } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { requireContentRole } from './content-roles';
import { TEAM_ROLES } from './permissions';

/** Até 3 páginas, texto até 300 caracteres (#410: limite mantido), título até 80. */
export const WELCOME_MAX_PAGES = 3;
export const WELCOME_BODY_MAX = 300;
export const WELCOME_TITLE_MAX = 80;

export interface WelcomePageInput {
  kind: GroupWelcomeKind;
  title: string;
  body: string;
  showTeam: boolean;
}

/** Uma página como o aluno lê: texto puro, "- " vira lista no cliente. */
export interface WelcomePageView extends WelcomePageInput {
  position: number;
}

export interface WelcomeEditorView {
  pages: WelcomePageView[];
  /** Nulo = rascunho, ou sem páginas (vale o padrão do Fatia). */
  publishedAt: Date | null;
  showOnJoin: boolean;
}

export interface WelcomeMemberView {
  pages: WelcomePageView[];
  /** Os nomes da equipe, para a página com `showTeam`. Só nome e papel. */
  team: { name: string; role: GroupRole }[];
}

/**
 * Páginas de boas-vindas da comunidade (#410, Pn-23 e Onb-02b).
 *
 * A equipe que publica conteúdo (`content.publish`) escreve de 1 a 3 páginas e
 * publica o conjunto; o aluno vê ao entrar pelo convite (com "Mostrar ao
 * entrar" ligado) e relê em Sobre. Nada é coletado do aluno: é só leitura.
 * Todo acesso é amarrado ao `groupId` da URL.
 */
@Injectable()
export class WelcomeService {
  constructor(private readonly prisma: PrismaService) {}

  async editor(actorId: string, groupId: string): Promise<WelcomeEditorView> {
    await requireContentRole(this.prisma, actorId, groupId, 'content.publish');
    return this.read(groupId);
  }

  /**
   * Reescreve o conjunto inteiro, na ordem, e publica ou volta a rascunho.
   * Republicar mantém a data da primeira publicação; zero páginas volta ao
   * padrão do Fatia (e não dá para publicar assim).
   */
  async save(
    actorId: string,
    groupId: string,
    input: { pages: WelcomePageInput[]; showOnJoin: boolean; published: boolean },
  ): Promise<WelcomeEditorView> {
    await requireContentRole(this.prisma, actorId, groupId, 'content.publish');
    const pages = input.pages.map(cleanPage);
    if (pages.length > WELCOME_MAX_PAGES) {
      throw new BadRequestException(`No máximo ${WELCOME_MAX_PAGES} páginas`);
    }
    if (input.published && pages.length === 0) {
      throw new BadRequestException('Crie ao menos uma página antes de publicar');
    }
    const atual = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { welcomePublishedAt: true },
    });
    const publishedAt = input.published ? (atual.welcomePublishedAt ?? new Date()) : null;
    await this.prisma.$transaction([
      this.prisma.groupWelcomePage.deleteMany({ where: { groupId } }),
      this.prisma.groupWelcomePage.createMany({
        data: pages.map((p, i) => ({ groupId, position: i + 1, ...p })),
      }),
      this.prisma.group.update({
        where: { id: groupId },
        data: { welcomePublishedAt: publishedAt, welcomeShowOnJoin: input.showOnJoin },
      }),
    ]);
    return this.read(groupId);
  }

  /** Comunidade → Sobre: só o publicado, com os nomes da equipe. */
  async forMember(userId: string, groupId: string): Promise<WelcomeMemberView> {
    await requireContentRole(this.prisma, userId, groupId, 'content.read');
    const g = await this.prisma.group.findUniqueOrThrow({
      where: { id: groupId },
      select: { welcomePublishedAt: true },
    });
    if (!g.welcomePublishedAt) return { pages: [], team: [] };
    const [pages, team] = await Promise.all([
      pagesOf(this.prisma, groupId),
      teamOf(this.prisma, groupId),
    ]);
    return { pages, team };
  }

  private async read(groupId: string): Promise<WelcomeEditorView> {
    const [g, pages] = await Promise.all([
      this.prisma.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { welcomePublishedAt: true, welcomeShowOnJoin: true },
      }),
      pagesOf(this.prisma, groupId),
    ]);
    return { pages, publishedAt: g.welcomePublishedAt, showOnJoin: g.welcomeShowOnJoin };
  }
}

/** Caracteres como o aluno vê (emoji conta 1), o mesmo que o `char_length` do CHECK. */
const length = (s: string) => [...s].length;

/** Texto puro: quebra de linha única, sem espaço nas pontas de cada linha e do todo. */
function cleanPage(p: WelcomePageInput): WelcomePageInput {
  const title = p.title.trim().replace(/\s+/g, ' ');
  const body = p.body
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
  if (!title) throw new BadRequestException('Toda página precisa de título');
  if (length(title) > WELCOME_TITLE_MAX) {
    throw new BadRequestException(`Título até ${WELCOME_TITLE_MAX} caracteres`);
  }
  if (length(body) > WELCOME_BODY_MAX) {
    throw new BadRequestException(`Texto até ${WELCOME_BODY_MAX} caracteres`);
  }
  return { kind: p.kind, title, body, showTeam: p.showTeam };
}

function pagesOf(prisma: PrismaService, groupId: string): Promise<WelcomePageView[]> {
  return prisma.groupWelcomePage.findMany({
    where: { groupId },
    orderBy: { position: 'asc' },
    select: { position: true, kind: true, title: true, body: true, showTeam: true },
  });
}

/** A equipe que recebe o que o aluno compartilha (ADR 026): só nome e papel. */
async function teamOf(prisma: PrismaService, groupId: string) {
  const rows = await prisma.groupMembership.findMany({
    where: { groupId, status: MembershipStatus.ACTIVE, role: { in: [...TEAM_ROLES] } },
    select: { role: true, user: { select: { name: true } } },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((m) => ({ name: m.user.name, role: m.role }));
}

/** As páginas que quem tem o convite vê ao entrar: publicadas e com "Mostrar ao entrar". */
export async function welcomeForJoin(
  prisma: PrismaService,
  groupId: string,
): Promise<WelcomePageView[]> {
  const g = await prisma.group.findUnique({
    where: { id: groupId },
    select: { welcomePublishedAt: true, welcomeShowOnJoin: true },
  });
  if (!g?.welcomePublishedAt || !g.welcomeShowOnJoin) return [];
  return pagesOf(prisma, groupId);
}
