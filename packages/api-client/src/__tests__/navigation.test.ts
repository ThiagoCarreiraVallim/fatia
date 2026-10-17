import { describe, expect, it } from 'vitest';
import { PRIMARY_TABS, ROUTES, activeNavKey, menuSections, routeInfo } from '../navigation';

const hrefs = (s: ReturnType<typeof menuSections>) => s.flatMap((x) => x.items.map((i) => i.href));

describe('navegação', () => {
  it('a barra tem Nutrição, Treino e Comunidade; o Início é a raiz, não aba', () => {
    expect(PRIMARY_TABS.map((t) => [t.label, t.href])).toEqual([
      ['Nutrição', '/nutrition'],
      ['Treino', '/workout'],
      ['Comunidade', '/community'],
    ]);
  });

  it('o menu leva a todas as outras telas, em seções', () => {
    const web = menuSections({ platform: 'web', chatAvailable: true });
    expect(web.map((s) => s.title)).toEqual(['Você', 'Registros', 'IA']);
    expect(hrefs(web)).toEqual([
      '/progress',
      '/nutrition/goals',
      '/goals',
      '/progress/records',
      '/profile',
      '/nutrition/foods',
      '/nutrition/nutrient-targets',
      '/workout/plans',
      '/workout/history',
      '/chat',
      '/profile/connect',
      '/plan',
    ]);
  });

  it('no Free o chat aparece com cadeado e leva ao plano (ADR 024)', () => {
    const ia = menuSections({ platform: 'web', chatAvailable: true, chatLocked: true }).find(
      (s) => s.title === 'IA',
    );
    expect(ia?.items.find((i) => i.key === 'chat')).toMatchObject({
      href: '/plan?recurso=chat',
      locked: true,
    });
    expect(ia?.items.find((i) => i.key === 'connect')?.locked).toBeUndefined();
  });

  it('o chat só aparece com a IA disponível', () => {
    expect(hrefs(menuSections({ platform: 'web', chatAvailable: false }))).not.toContain('/chat');
  });

  it('no app não há chat, e "Conectar sua IA" vai para a tela de lá', () => {
    const app = hrefs(menuSections({ platform: 'mobile', chatAvailable: true }));
    expect(app).not.toContain('/chat');
    expect(app).toContain('/profile/tokens');
    expect(app).not.toContain('/profile/connect');
  });

  it.each([
    ['/', 'home'],
    ['/nutrition', 'nutrition'],
    ['/nutrition/foods', 'nutrition'],
    ['/nutrition/goals', 'nutrition'],
    ['/workout/session/abc', 'workout'],
    ['/community', 'community'],
    ['/community/g1', 'community'],
    ['/progress', 'more'],
    ['/goals', 'more'],
    ['/profile/connect', 'more'],
    ['/chat/abc', 'more'],
    ['/nutritionx', 'more'],
  ])('%s acende %s', (path, key) => {
    expect(activeNavKey(path)).toBe(key);
  });

  describe('barra de topo: título e voltar', () => {
    it('o Início não tem voltar', () => {
      expect(routeInfo('/')).toEqual({ title: 'Início', parent: null, parentTitle: null });
    });

    it.each([
      ['/nutrition', 'Nutrição', '/', 'Início'],
      ['/nutrition/foods', 'Meus alimentos', '/nutrition', 'Nutrição'],
      ['/nutrition/goals?from=home', 'Metas do dia', '/nutrition', 'Nutrição'],
      ['/workout/plans/p1', 'Plano de treino', '/workout/plans', 'Planos de treino'],
      ['/workout/session/s1', 'Treino', '/workout/history', 'Histórico de treino'],
      ['/progress/records', 'Recordes', '/progress', 'Progresso'],
      ['/plan', 'Meu plano', '/profile', 'Perfil'],
      ['/chat/c1', 'Chat', '/', 'Início'],
      ['/community/g1', 'Comunidade', '/community', 'Comunidade'],
      ['/students/m1', 'Membro', '/students', 'Membros'],
      ['/community/new', 'Criar comunidade', '/community', 'Comunidade'],
      ['/org/g1', 'Painel', '/community/g1', 'Comunidade'],
      ['/org/g1/members', 'Membros', '/org/g1', 'Painel'],
      ['/org/g1/members/m9', 'Membro', '/org/g1/members', 'Membros'],
      ['/org/g1/seats', 'Assentos', '/org/g1', 'Painel'],
      ['/org/g1/settings?x=1', 'Configurações', '/org/g1', 'Painel'],
    ])('%s: "%s", volta para %s', (path, title, parent, parentTitle) => {
      expect(routeInfo(path)).toEqual({ title, parent, parentTitle });
    });

    it('rota fora do mapa volta ao ancestral conhecido mais próximo', () => {
      expect(routeInfo('/nutrition/xyz').parent).toBe('/nutrition');
      expect(routeInfo('/desconhecida/a/b').parent).toBe('/');
    });

    it('voltar sempre chega ao Início, sem ciclo', () => {
      for (const r of ROUTES) {
        let path: string | null = r.pattern.replace(/:\w+/g, 'x');
        const visitados = new Set<string>();
        while (path !== null && path !== '/') {
          expect(visitados.has(path)).toBe(false);
          visitados.add(path);
          path = routeInfo(path).parent;
        }
        expect(path).toBe('/');
      }
    });
  });
});
