import type { GroupRole } from './community';
import { apiFetch } from './http';

/**
 * Páginas de boas-vindas da comunidade (#410, Pn-23 e Onb-02b), comuns ao
 * painel, à web e ao app. O texto é puro: só "- " no começo da linha vira item
 * de lista, e nada é interpretado como HTML.
 */

export type WelcomeKind = 'COVER' | 'PLAIN';

export interface WelcomePageInput {
  kind: WelcomeKind;
  title: string;
  body: string;
  /** Mostra os nomes da equipe nesta página. */
  showTeam: boolean;
}

export interface WelcomePage extends WelcomePageInput {
  position: number;
}

export interface WelcomeEditorState {
  pages: WelcomePage[];
  /** Nulo = rascunho, ou sem páginas (vale o padrão do Fatia). */
  publishedAt: string | null;
  showOnJoin: boolean;
}

export interface WelcomeMemberView {
  pages: WelcomePage[];
  team: { name: string; role: GroupRole }[];
}

export interface SaveWelcomeInput {
  pages: WelcomePageInput[];
  showOnJoin: boolean;
  published: boolean;
}

/** Os mesmos limites da API (`welcome.service.ts`). */
export const WELCOME_LIMITS = { pages: 3, title: 80, body: 300 } as const;

export const WELCOME_KIND_OPTIONS: { value: WelcomeKind; label: string }[] = [];

export const WELCOME_COPY = {} as Record<string, string>;

const base = (groupId: string) => `/api/groups/${groupId}/welcome`;

export const welcomeApi = {
  editor: (groupId: string) => apiFetch<WelcomeEditorState>(base(groupId)),
  save: (groupId: string, input: SaveWelcomeInput) =>
    apiFetch<WelcomeEditorState>(base(groupId), { method: 'GET', body: JSON.stringify(input) }),
  pages: (groupId: string) => apiFetch<WelcomeMemberView>(base(groupId)),
};

/** Caracteres como o aluno vê (emoji conta 1), como a API conta. */
export function welcomeCharCount(_text: string): number {
  return 0;
}

export interface WelcomeLine {
  text: string;
  bullet: boolean;
}

/** As linhas do texto: "- " no começo vira item de lista; linha vazia some. */
export function welcomeLines(_body: string): WelcomeLine[] {
  return [];
}

/** O ícone da página simples: equipe, lista ou texto. */
export function welcomePageIcon(_page: WelcomePageInput): 'users' | 'list' | 'text' {
  return 'text';
}

/** "1 de 3". */
export function welcomePosition(_index: number, _total: number): string {
  return '';
}

/** O botão de baixo: "Próxima" até a última, "Continuar" na última. */
export function welcomeCta(_index: number, _total: number): string {
  return '';
}

export interface WelcomePageErrors {
  title?: string;
  body?: string;
}

/** O que impede salvar cada página, na ordem. Vazio = tudo certo. */
export function welcomeDraftErrors(_pages: WelcomePageInput[]): WelcomePageErrors[] {
  return [];
}

/** Rascunho, publicado ou sem páginas próprias (o selo do topo, Pn-23/23c). */
export function welcomeStatus(_state: Pick<WelcomeEditorState, 'pages' | 'publishedAt'>): {
  label: string;
  tone: 'published' | 'draft' | 'default';
} {
  return { label: '', tone: 'default' };
}

/** Uma página nova do editor: simples, vazia, sem equipe. */
export function emptyWelcomePage(): WelcomePageInput {
  return { kind: 'COVER', title: 'x', body: 'x', showTeam: true };
}
