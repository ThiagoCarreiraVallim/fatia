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

export const WELCOME_KIND_OPTIONS: { value: WelcomeKind; label: string }[] = [
  { value: 'COVER', label: 'Capa com a marca' },
  { value: 'PLAIN', label: 'Simples' },
];

/** Os textos fixos do editor (Pn-23) e da tela do aluno (Onb-02b). */
export const WELCOME_COPY = {
  title: 'Boas-vindas da comunidade',
  subtitle: 'De 1 a 3 páginas que o aluno vê ao entrar.',
  bodyHint: 'Use “- ” no começo da linha para lista.',
  healthTitle: 'Não peça dado de saúde aqui',
  healthBody:
    'Peso, medidas, doenças e remédios vão na avaliação, que o aluno escolhe compartilhar.',
  showOnJoin: 'Mostrar ao entrar na comunidade',
  showOnJoinHint:
    'depois da tela de boas-vindas do Fatia, antes de escolher o que compartilhar · tem “Pular”',
  showTeam: 'Mostrar a equipe nesta página',
  emptyTitle: 'Usando o padrão do Fatia',
  emptyBody:
    'Quem entra vê só a tela de boas-vindas do Fatia, com a sua marca e a equipe. Crie páginas para contar regras, horários e como vocês acompanham.',
  reviewLater: 'Dá para rever depois em Comunidade → Sobre',
  skip: 'Pular',
} as const;

const base = (groupId: string) => `/api/groups/${groupId}/welcome`;

export const welcomeApi = {
  /** O editor (`content.publish`): rascunho ou publicado, tudo. */
  editor: (groupId: string) => apiFetch<WelcomeEditorState>(base(groupId)),
  /** Reescreve o conjunto, na ordem, e publica ou volta a rascunho. */
  save: (groupId: string, input: SaveWelcomeInput) =>
    apiFetch<WelcomeEditorState>(base(groupId), { method: 'PUT', body: JSON.stringify(input) }),
  /** Comunidade → Sobre: só o publicado, com os nomes da equipe. */
  pages: (groupId: string) => apiFetch<WelcomeMemberView>(`${base(groupId)}/pages`),
};

type GraphemeSegmenter = { segment(s: string): Iterable<unknown> };
const Segmenter = (
  Intl as unknown as {
    Segmenter?: new (l?: string, o?: { granularity: 'grapheme' }) => GraphemeSegmenter;
  }
).Segmenter;
const graphemes = Segmenter ? new Segmenter(undefined, { granularity: 'grapheme' }) : null;

/**
 * Caracteres como o aluno vê: grafemas (emoji com tom de pele, família,
 * bandeira e acento combinado contam 1), como a API conta (`welcomeLength`).
 */
export function welcomeCharCount(text: string): number {
  if (graphemes) {
    return [...graphemes.segment(text)].length;
  }
  // Sem Intl.Segmenter (Hermes antigo): aproxima juntando marcas, seletores,
  // tons de pele, o que vem depois de ZWJ e os pares de bandeira.
  let n = 0;
  let joined = false;
  let flagHalf = false;
  for (const ch of text) {
    if (ch === '\u200d') {
      joined = true;
      continue;
    }
    if (/\p{M}|\ufe0f|[\u{1F3FB}-\u{1F3FF}]/u.test(ch)) continue;
    if (joined) {
      joined = false;
      continue;
    }
    if (/\p{Regional_Indicator}/u.test(ch)) {
      flagHalf = !flagHalf;
      if (!flagHalf) continue;
    } else flagHalf = false;
    n += 1;
  }
  return n;
}

export interface WelcomeLine {
  text: string;
  bullet: boolean;
}

/** As linhas do texto: "- " no começo vira item de lista; linha vazia some. */
export function welcomeLines(body: string): WelcomeLine[] {
  return body
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) =>
      l.startsWith('- ') ? { text: l.slice(2).trim(), bullet: true } : { text: l, bullet: false },
    );
}

/** O ícone da página simples: equipe, lista ou texto. */
export function welcomePageIcon(page: WelcomePageInput): 'users' | 'list' | 'text' {
  if (page.showTeam) return 'users';
  return welcomeLines(page.body).some((l) => l.bullet) ? 'list' : 'text';
}

/** "1 de 3". */
export function welcomePosition(index: number, total: number): string {
  return `${index + 1} de ${total}`;
}

/** O botão de baixo: "Próxima" até a última, "Continuar" na última. */
export function welcomeCta(index: number, total: number): string {
  return index >= total - 1 ? 'Continuar' : 'Próxima';
}

export interface WelcomePageErrors {
  title?: string;
  body?: string;
}

/** O que impede salvar cada página, na ordem. `{}` = a página está certa. */
export function welcomeDraftErrors(pages: WelcomePageInput[]): WelcomePageErrors[] {
  return pages.map((p) => {
    const e: WelcomePageErrors = {};
    const title = p.title.trim();
    if (!title) e.title = 'Dê um título à página';
    else if (welcomeCharCount(title) > WELCOME_LIMITS.title) {
      e.title = `Título até ${WELCOME_LIMITS.title} caracteres`;
    }
    const n = welcomeCharCount(p.body.trim());
    if (n > WELCOME_LIMITS.body) e.body = `Texto até ${WELCOME_LIMITS.body} caracteres (${n})`;
    return e;
  });
}

/** Rascunho, publicado ou sem páginas próprias (o selo do topo, Pn-23/23c). */
export function welcomeStatus(state: Pick<WelcomeEditorState, 'pages' | 'publishedAt'>): {
  label: string;
  tone: 'published' | 'draft' | 'default';
} {
  if (state.pages.length === 0) return { label: 'sem páginas próprias', tone: 'default' };
  return state.publishedAt
    ? { label: 'publicado', tone: 'published' }
    : { label: 'rascunho', tone: 'draft' };
}

/** Uma página nova do editor: simples, vazia, sem equipe. */
export function emptyWelcomePage(): WelcomePageInput {
  return { kind: 'PLAIN', title: '', body: '', showTeam: false };
}
