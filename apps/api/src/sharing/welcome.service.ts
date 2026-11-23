import { BadRequestException, Injectable } from '@nestjs/common';
import { MembershipStatus, type GroupRole, type GroupWelcomeKind } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';
import { requireContentRole } from './content-roles';
import { TEAM_ROLES } from './permissions';

/**
 * Até 3 páginas, texto até 300 caracteres (#410: limite mantido), título até
 * 80, contados como o aluno vê (grafemas: emoji com tom de pele conta 1).
 */
export const WELCOME_MAX_PAGES = 3;
export const WELCOME_BODY_MAX = 300;
export const WELCOME_TITLE_MAX = 80;
/**
 * O teto do banco, em pontos de código (`char_length` do CHECK): folgado para
 * 300 grafemas compostos, mas barra texto patológico (milhares de acentos num
 * caractere). A API recusa antes de o Postgres ver.
 */
export const WELCOME_BODY_CAP = 2000;
export const WELCOME_TITLE_CAP = 600;

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
    // Dois salvamentos ao mesmo tempo (duas abas, retry) apagariam e criariam
    // as mesmas posições em paralelo (P2002 → 500). A linha do grupo fica
    // travada até o commit: um espera o outro e o último vale.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Group" WHERE "id" = ${groupId} FOR UPDATE`;
      const atual = await tx.group.findUniqueOrThrow({
        where: { id: groupId },
        select: { welcomePublishedAt: true },
      });
      const publishedAt = input.published ? (atual.welcomePublishedAt ?? new Date()) : null;
      await tx.groupWelcomePage.deleteMany({ where: { groupId } });
      await tx.groupWelcomePage.createMany({
        data: pages.map((p, i) => ({ groupId, position: i + 1, ...p })),
      });
      await tx.group.update({
        where: { id: groupId },
        data: { welcomePublishedAt: publishedAt, welcomeShowOnJoin: input.showOnJoin },
      });
    });
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

type GraphemeSegmenter = { segment(s: string): Iterable<unknown> };
const Segmenter = (
  Intl as unknown as {
    Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => GraphemeSegmenter;
  }
).Segmenter;
const graphemes = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;

/**
 * Caracteres como o aluno vê: grafemas (emoji com tom de pele, família e
 * acento combinado contam 1). Gêmeo de `welcomeCharCount` no api-client, com
 * os mesmos casos de teste; a API não depende do api-client.
 */
export function welcomeLength(s: string): number {
  if (!graphemes) return [...s].length;
  return [...graphemes.segment(s)].length;
}

/** Pontos de código, como o `char_length` do CHECK do banco. */
const codePoints = (s: string) => [...s].length;

/** Controles C0 e DEL: o NUL derruba o Postgres; o resto não tem o que fazer no texto. */
// eslint-disable-next-line no-control-regex
const CONTROLS = /[\u0000-\u0008\u000B-\u001F\u007F]/g;

/** Texto puro: quebra de linha única, sem controles, sem espaço nas pontas de cada linha e do todo. */
function cleanPage(p: WelcomePageInput): WelcomePageInput {
  const title = p.title
    .replace(/[\t\n\r]/g, ' ')
    .replace(CONTROLS, '')
    .trim()
    .replace(/\s+/g, ' ');
  const body = p.body
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROLS, '')
    .split('\n')
    .map((l) => l.trimEnd())
    .join('\n')
    .trim();
  if (!title) throw new BadRequestException('Toda página precisa de título');
  if (codePoints(title) > WELCOME_TITLE_CAP || welcomeLength(title) > WELCOME_TITLE_MAX) {
    throw new BadRequestException(`Título até ${WELCOME_TITLE_MAX} caracteres`);
  }
  if (codePoints(body) > WELCOME_BODY_CAP || welcomeLength(body) > WELCOME_BODY_MAX) {
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
