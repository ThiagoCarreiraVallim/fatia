import { Injectable } from '@nestjs/common';
import type { GroupRole, GroupWelcomeKind } from '@fatia/db';
import { PrismaService } from '../common/prisma.service';

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

  async editor(_actorId: string, _groupId: string): Promise<WelcomeEditorView> {
    return { pages: [], publishedAt: null, showOnJoin: true };
  }

  async save(
    actorId: string,
    groupId: string,
    _input: { pages: WelcomePageInput[]; showOnJoin: boolean; published: boolean },
  ): Promise<WelcomeEditorView> {
    return this.editor(actorId, groupId);
  }

  async forMember(_userId: string, _groupId: string): Promise<WelcomeMemberView> {
    return { pages: [], team: [] };
  }
}

/** As páginas que quem tem o convite vê ao entrar: publicadas e com "Mostrar ao entrar". */
export async function welcomeForJoin(
  _prisma: PrismaService,
  _groupId: string,
): Promise<WelcomePageView[]> {
  return [];
}
