import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  contentApi,
  groupContentApi,
  imageProblem,
  uploadMedia,
  type PlanTemplate,
} from '../community-content';
import { panelHref, panelSections, activePanelSection } from '../community-panel';
import {
  adoptResultMessage,
  contentStatusLabel,
  goalsProblem,
  nutritionDiff,
  sortTips,
  planTemplateSummary,
} from '../content-panel';
import { configureApiClient, resetApiClient } from '../http';
import { markdownLitePlainText, parseInline, parseMarkdownLite, safeHref } from '../markdown-lite';
import { routeInfo } from '../navigation';

const fetchMock = vi.fn();

function pedido(i = 0) {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return {
    method: init.method ?? 'GET',
    url,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

const metas = {
  kcalMin: 1800,
  kcalMax: 2100,
  proteinMinG: 120,
  proteinMaxG: 160,
  carbsMinG: 180,
  carbsMaxG: 240,
  fatMinG: 50,
  fatMaxG: 70,
};

describe('planos prontos e dicas no cliente', () => {
  beforeEach(() => {
    configureApiClient({ resolveUrl: (path) => path, fetch: fetchMock as unknown as typeof fetch });
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{}', { status: 200 })));
  });

  afterEach(() => {
    fetchMock.mockReset();
    resetApiClient();
  });

  it('a equipe publica pela bancada e o membro adota pela vitrine', async () => {
    await contentApi.createWorkout('g1', { planId: 'p1', level: 'beginner' });
    await contentApi.publishPlan('g1', 't1', true);
    await contentApi.setTipState('g1', 'd1', { pinned: true });
    await groupContentApi.adopt('g1', 't1', { applyGoals: false });
    await groupContentApi.tips('g1');
    await contentApi.setAvatar('g1', null);
    expect(fetchMock.mock.calls.map((_, i) => pedido(i))).toEqual([
      {
        method: 'POST',
        url: '/api/groups/g1/content/plans/workout',
        body: { planId: 'p1', level: 'beginner' },
      },
      { method: 'POST', url: '/api/groups/g1/content/plans/t1/publish', body: { published: true } },
      { method: 'POST', url: '/api/groups/g1/content/tips/d1/state', body: { pinned: true } },
      { method: 'POST', url: '/api/groups/g1/plans/t1/adopt', body: { applyGoals: false } },
      { method: 'GET', url: '/api/groups/g1/tips', body: undefined },
      { method: 'PUT', url: '/api/groups/g1/avatar', body: { fileId: null } },
    ]);
  });

  it('envia a imagem direto ao bucket e confirma', async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            fileId: 'f1',
            uploadUrl: 'https://bucket/put',
            headers: { 'Content-Type': 'image/png' },
          }),
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'f1', url: 'https://bucket/get' })));
    const put = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    const view = await uploadMedia(
      { purpose: 'group_content', groupId: 'g1', mime: 'image/png', bytes: 10 },
      put,
    );
    expect(put).toHaveBeenCalledWith('https://bucket/put', { 'Content-Type': 'image/png' });
    expect(pedido(0)).toEqual({
      method: 'POST',
      url: '/api/media/uploads',
      body: { purpose: 'group_content', groupId: 'g1', mime: 'image/png', bytes: 10 },
    });
    expect(pedido(1)).toEqual({ method: 'POST', url: '/api/media/f1/confirm', body: undefined });
    expect(view.id).toBe('f1');
  });

  it('não confirma quando o bucket recusa o envio', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ fileId: 'f1', uploadUrl: 'https://x', headers: {} })),
    );
    await expect(
      uploadMedia(
        { purpose: 'group_content', groupId: 'g1', mime: 'image/png', bytes: 10 },
        async () => ({ ok: false, status: 403 }),
      ),
    ).rejects.toThrow('403');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('recusa imagem fora do tipo ou do tamanho antes de pedir a URL', () => {
    expect(imageProblem({ type: 'image/gif', size: 10 })).toMatch(/JPEG, PNG ou WebP/);
    expect(imageProblem({ type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(imageProblem({ type: 'image/webp', size: 500 })).toBeNull();
  });
});

describe('markdown restrito das dicas', () => {
  it('parágrafos, listas, negrito, itálico e link https', () => {
    expect(
      parseMarkdownLite(
        'Beba **água**\ne *durma*.\n\n- um\n- [dois](https://fat.ia.br/x)\n\n1. a\n2. b',
      ),
    ).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Beba ' },
          { type: 'bold', children: [{ type: 'text', text: 'água' }] },
          { type: 'text', text: ' e ' },
          { type: 'italic', children: [{ type: 'text', text: 'durma' }] },
          { type: 'text', text: '.' },
        ],
      },
      {
        type: 'list',
        ordered: false,
        items: [
          [{ type: 'text', text: 'um' }],
          [
            {
              type: 'link',
              href: 'https://fat.ia.br/x',
              children: [{ type: 'text', text: 'dois' }],
            },
          ],
        ],
      },
      {
        type: 'list',
        ordered: true,
        items: [[{ type: 'text', text: 'a' }], [{ type: 'text', text: 'b' }]],
      },
    ]);
  });

  it('HTML sai como texto, e link que não é https vira só o rótulo', () => {
    expect(parseInline('<script>alert(1)</script>')).toEqual([
      { type: 'text', text: '<script>alert(1)</script>' },
    ]);
    for (const href of ['javascript:alert(1)', 'http://x.com', 'data:text/html,oi', '/relativo']) {
      const tokens = parseInline(`[clique](${href})`);
      expect(tokens.every((t) => t.type === 'text')).toBe(true);
      expect(tokens[0]).toEqual({ type: 'text', text: 'clique' });
      expect(safeHref(href)).toBeNull();
    }
  });

  it('marcador sem par fica como texto', () => {
    expect(parseInline('2 * 3 = 6 e **sem fim')).toEqual([
      { type: 'text', text: '2 * 3 = 6 e **sem fim' },
    ]);
  });

  it('texto puro para prévia', () => {
    expect(markdownLitePlainText('**Água**: beba.\n\n- 2 L\n- mais')).toBe('Água: beba. 2 L; mais');
  });
});

describe('regras do conteúdo', () => {
  const treino = {
    kind: 'WORKOUT',
    exercises: [{}, {}, {}],
    meals: [],
    goals: null,
    level: 'intermediate',
  } as unknown as PlanTemplate;

  it('resume o cartão por tipo', () => {
    expect(planTemplateSummary(treino)).toBe('Treino · 3 exercícios · Intermediário');
    expect(
      planTemplateSummary({
        kind: 'NUTRITION',
        exercises: [],
        meals: [{}] as never,
        goals: metas,
        level: null,
      }),
    ).toBe('Nutrição · 1800–2100 kcal · 1 refeição');
    expect(contentStatusLabel({ publishedAt: null })).toBe('Rascunho');
  });

  it('compara as metas linha a linha antes de aplicar', () => {
    const diff = nutritionDiff({ ...metas, kcalMin: 2500, kcalMax: 2800 }, metas);
    expect(diff[0]).toEqual({
      label: 'Calorias',
      current: '2500–2800 kcal',
      next: '1800–2100 kcal',
      changed: true,
    });
    expect(diff.slice(1).every((r) => !r.changed)).toBe(true);
    expect(nutritionDiff(null, metas).every((r) => r.current === '—' && r.changed)).toBe(true);
  });

  it('diz o que aconteceu na adoção', () => {
    expect(
      adoptResultMessage({
        kind: 'NUTRITION',
        planId: null,
        goalsApplied: true,
        mealsSaved: 2,
        mealsAlreadySaved: false,
      }),
    ).toBe('2 refeições salvas, metas atualizadas.');
    expect(
      adoptResultMessage({
        kind: 'NUTRITION',
        planId: null,
        goalsApplied: false,
        mealsSaved: 0,
        mealsAlreadySaved: true,
      }),
    ).toBe('As refeições já estavam salvas.');
  });

  it('fixadas primeiro', () => {
    const tips = sortTips([
      { pinned: false, publishedAt: '2026-10-02' },
      { pinned: true, publishedAt: '2026-09-01' },
      { pinned: false, publishedAt: '2026-10-05' },
    ]);
    expect(tips.map((t) => t.publishedAt)).toEqual(['2026-09-01', '2026-10-05', '2026-10-02']);
  });

  it('confere as metas do formulário', () => {
    expect(goalsProblem(metas)).toBeNull();
    expect(goalsProblem({ ...metas, fatMinG: 90 })).toBe('O mínimo de gordura passa do máximo.');
    expect(goalsProblem({ ...metas, proteinMaxG: null })).toMatch(/proteína/);
  });

  it('a seção Planos e dicas é do dono e do profissional', () => {
    expect(panelSections('PROFESSIONAL').map((s) => s.section)).toEqual([
      'overview',
      'members',
      'invites',
      'content',
      'exercises',
      'challenges',
    ]);
    expect(panelSections('OWNER').map((s) => s.section)).toContain('content');
    expect(panelHref('g1', 'content')).toBe('/org/g1/content');
    expect(activePanelSection('/org/g1/content/plans/t1')).toBe('content');
  });

  it('voltar do plano leva à lista, e da lista à comunidade', () => {
    expect(routeInfo('/community/g1/content/t1')).toMatchObject({
      title: 'Plano pronto',
      parent: '/community/g1/content',
    });
    expect(routeInfo('/community/g1/content')).toMatchObject({ parent: '/community/g1' });
    expect(routeInfo('/org/g1/content/tips/d1')).toMatchObject({
      title: 'Dica',
      parent: '/org/g1/content',
    });
  });
});
