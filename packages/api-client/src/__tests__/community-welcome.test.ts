import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  WELCOME_KIND_OPTIONS,
  WELCOME_LIMITS,
  emptyWelcomePage,
  welcomeApi,
  welcomeCharCount,
  welcomeCta,
  welcomeDraftErrors,
  welcomeLines,
  welcomePageIcon,
  welcomePosition,
  welcomeStatus,
} from '../community-welcome';
import { configureApiClient, resetApiClient } from '../http';

const fetchMock = vi.fn();
const pedido = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
};

const combinados = {
  kind: 'PLAIN' as const,
  title: 'Combinados da casa',
  body: '- Seg a sex, 6h às 22h\n- Traga toalha e garrafa',
  showTeam: false,
};

describe('boas-vindas da comunidade no cliente (#410)', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });
  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('o editor lê e grava o conjunto; o membro lê só as publicadas', async () => {
    await welcomeApi.editor('g1');
    await welcomeApi.save('g1', { pages: [combinados], showOnJoin: true, published: true });
    await welcomeApi.pages('g1');
    expect(pedido(0)).toMatchObject({ method: 'GET', url: '/api/groups/g1/welcome' });
    expect(pedido(1)).toEqual({
      method: 'PUT',
      url: '/api/groups/g1/welcome',
      body: { pages: [combinados], showOnJoin: true, published: true },
    });
    expect(pedido(2)).toMatchObject({ method: 'GET', url: '/api/groups/g1/welcome/pages' });
  });

  it('"- " no começo da linha vira item de lista; o resto é texto e linha vazia some', () => {
    expect(welcomeLines('Treino desde 2012.\n\n- Traga toalha\n-sem espaço\n  - recuado')).toEqual([
      { text: 'Treino desde 2012.', bullet: false },
      { text: 'Traga toalha', bullet: true },
      { text: '-sem espaço', bullet: false },
      { text: 'recuado', bullet: true },
    ]);
    // Texto puro: marcação não vira nada.
    expect(welcomeLines('<b>oi</b>')).toEqual([{ text: '<b>oi</b>', bullet: false }]);
  });

  it('conta caracteres como o aluno vê (emoji conta 1), igual à API', () => {
    expect(welcomeCharCount('💪 bora')).toBe(6);
    expect(WELCOME_LIMITS).toEqual({ pages: 3, title: 80, body: 300 });
  });

  it('valida cada página: título obrigatório e até 80; texto até 300', () => {
    expect(welcomeDraftErrors([combinados])).toEqual([{}]);
    expect(
      welcomeDraftErrors([
        { ...combinados, title: '  ' },
        { ...combinados, title: 'a'.repeat(81), body: 'b'.repeat(301) },
      ]),
    ).toEqual([
      { title: 'Dê um título à página' },
      { title: 'Título até 80 caracteres', body: 'Texto até 300 caracteres (301)' },
    ]);
  });

  it('o ícone da página simples segue o conteúdo; posição e botão como no Onb-02b', () => {
    expect(welcomePageIcon({ ...combinados, showTeam: true })).toBe('users');
    expect(welcomePageIcon(combinados)).toBe('list');
    expect(welcomePageIcon({ ...combinados, body: 'Só texto' })).toBe('text');
    expect(welcomePosition(0, 3)).toBe('1 de 3');
    expect(welcomeCta(0, 3)).toBe('Próxima');
    expect(welcomeCta(2, 3)).toBe('Continuar');
  });

  it('o selo do topo: sem páginas próprias, rascunho ou publicado', () => {
    expect(welcomeStatus({ pages: [], publishedAt: null })).toEqual({
      label: 'sem páginas próprias',
      tone: 'default',
    });
    const p = [{ position: 1, ...combinados }];
    expect(welcomeStatus({ pages: p, publishedAt: null })).toEqual({
      label: 'rascunho',
      tone: 'draft',
    });
    expect(welcomeStatus({ pages: p, publishedAt: '2026-11-21T10:00:00Z' })).toEqual({
      label: 'publicado',
      tone: 'published',
    });
  });

  it('página nova é simples e vazia; os tipos são capa com a marca ou simples', () => {
    expect(emptyWelcomePage()).toEqual({ kind: 'PLAIN', title: '', body: '', showTeam: false });
    expect(WELCOME_KIND_OPTIONS.map((o) => o.label)).toEqual(['Capa com a marca', 'Simples']);
  });

  it('conta como o aluno vê: emoji com tom de pele, família e acento combinado contam 1 (#469)', () => {
    expect(welcomeCharCount('👍🏽')).toBe(1);
    expect(welcomeCharCount('👨‍👩‍👧')).toBe(1);
    expect(welcomeCharCount('🇧🇷 é')).toBe(3);
    expect(welcomeCharCount('e\u0301')).toBe(1);
    expect(
      welcomeDraftErrors([{ kind: 'PLAIN', title: 'Oi', body: '👍🏽'.repeat(300), showTeam: false }]),
    ).toEqual([{}]);
  });
});
