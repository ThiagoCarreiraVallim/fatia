import { describe, expect, it } from 'vitest';
import {
  HOME_TITLE,
  PRIMARY_TABS,
  ROUTES,
  activeNavKey,
  menuSections,
  navBarMode,
  routeInfo,
  hasTopBar,
} from '../navigation';

const hrefs = (s: ReturnType<typeof menuSections>) => s.flatMap((x) => x.items.map((i) => i.href));

describe('navegação', () => {
  it('a barra tem as cinco abas, na ordem Hoje · Nutrição · Treino · Comunidade · Você', () => {
    expect(PRIMARY_TABS.map((t) => [t.key, t.label, t.href])).toEqual([
      ['today', 'Hoje', '/'],
      ['nutrition', 'Nutrição', '/nutrition'],
      ['workout', 'Treino', '/workout'],
      ['community', 'Comunidade', '/community'],
      ['you', 'Você', '/you'],
    ]);
  });

  it('cada aba tem ícone, e Você é o avatar da pessoa', () => {
    expect(PRIMARY_TABS.map((t) => t.icon)).toEqual([
      'home',
      'apple',
      'dumbbell',
      'users',
      'avatar',
    ]);
  });

  it('"Mais" não existe mais: nem aba, nem chave', () => {
    expect(PRIMARY_TABS.map((t) => t.key)).not.toContain('more');
    for (const path of ['/progress', '/chat', '/xyz', '/profile/connect']) {
      expect(activeNavKey(path)).not.toBe('more');
    }
  });

  it('o título do Início é "Hoje"', () => {
    expect(HOME_TITLE).toBe('Hoje');
  });

  it('Você tem as seções da prancha Al-V1, com as telas que já existem', () => {
    const web = menuSections({ platform: 'web', chatAvailable: true });
    expect(web.map((s) => s.title)).toEqual([
      'Progresso',
      'Nutrição',
      'Treino',
      'IA',
      'Comunidade e equipe',
      'Rotina e avisos',
      'Conta',
    ]);
    expect(hrefs(web)).toEqual([
      '/progress',
      '/goals',
      '/progress/records',
      '/nutrition/goals',
      '/nutrition/nutrient-targets',
      '/nutrition/foods',
      '/workout/plans',
      '/workout/history',
      '/chat',
      '/profile/connect',
      '/community',
      '/you/reminders',
      '/profile/notifications',
      '/plan',
      null,
      '/you/units',
      '/profile/appearance',
      '/you/news',
      '/you/help',
      null,
      null,
    ]);
  });

  it('Conta tem o interruptor de fotos e as ações de senha e exportação', () => {
    const conta = menuSections({ platform: 'web', chatAvailable: false }).at(-1)!;
    expect(conta.items.filter((i) => i.kind !== 'link').map((i) => [i.key, i.kind])).toEqual([
      ['keep-photos', 'toggle'],
      ['password', 'action'],
      ['export', 'action'],
    ]);
    expect(conta.items.find((i) => i.key === 'export')?.detail).toBe('Arquivo com link, vale 24 h');
  });

  it('toda linha leva ícone do design system', () => {
    for (const s of menuSections({ platform: 'mobile', chatAvailable: true })) {
      for (const i of s.items) expect(i.icon).toMatch(/^[a-zA-Z]+$/);
    }
  });

  it('as telas novas de Você voltam para Você', () => {
    for (const path of ['/you/edit', '/you/units', '/you/news', '/you/help', '/you/delete']) {
      expect(routeInfo(path).parent).toBe('/you');
      expect(activeNavKey(path)).toBe('you');
    }
  });

  it('os avisos são uma linha de Você, não um sino no cabeçalho dela (ADR 040, item 4)', () => {
    const avisos = menuSections({ platform: 'mobile', chatAvailable: false }).find(
      (s) => s.title === 'Rotina e avisos',
    )!;
    expect(avisos.items.map((i) => i.key)).toEqual(['reminders', 'notifications']);
    expect(avisos.items.find((i) => i.key === 'reminders')).toMatchObject({
      label: 'Lembretes',
      icon: 'bell',
      href: '/you/reminders',
    });
    expect(avisos.items.find((i) => i.key === 'notifications')).toMatchObject({
      label: 'Notificações',
      href: '/profile/notifications',
    });
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

  it('no app "Conectar sua IA" vai para a tela de lá', () => {
    const app = hrefs(menuSections({ platform: 'mobile', chatAvailable: true }));
    expect(app).toContain('/chat');
    expect(app).toContain('/profile/tokens');
    expect(app).not.toContain('/profile/connect');
  });

  it.each([
    ['/', 'today'],
    ['/nutrition', 'nutrition'],
    ['/nutrition/foods', 'nutrition'],
    ['/nutrition/goals', 'nutrition'],
    ['/workout/plans/1', 'workout'],
    ['/workout/session/abc', 'workout'],
    ['/community', 'community'],
    ['/community/x', 'community'],
    ['/org/x/members', 'community'],
    ['/org/x', 'community'],
    ['/students/m1', 'community'],
    ['/you', 'you'],
    ['/profile', 'you'],
    ['/profile/notifications', 'you'],
    ['/progress', 'you'],
    ['/progress/records', 'you'],
    ['/goals', 'you'],
    ['/plan', 'you'],
    ['/plan?recurso=chat', 'you'],
  ])('%s acende %s', (path, key) => {
    expect(activeNavKey(path)).toBe(key);
  });

  it.each(['/chat', '/chat/abc', '/nutritionx', '/desconhecida'])(
    '%s não acende aba nenhuma',
    (path) => {
      expect(activeNavKey(path)).toBeNull();
    },
  );

  describe('navBarMode: a barra some nas tarefas de foco', () => {
    it.each([
      '/chat',
      '/chat/c1',
      '/chat/memories',
      '/workout/session/s1',
      '/nutrition/photo',
      '/nutrition/scan',
      '/community/new',
      '/onboarding',
      '/org/g1/content/plans/t1',
      '/org/g1/content/tips/t1',
      '/org/g1/exercises/12',
    ])('%s esconde a barra', (path) => {
      expect(navBarMode(path)).toBe('hidden');
    });

    it.each([
      '/',
      '/nutrition',
      '/nutrition/foods',
      '/workout',
      '/workout/plans',
      '/workout/plans/p1',
      '/workout/history',
      '/community',
      '/community/g1',
      '/you',
      '/profile',
      '/progress',
      '/org/g1',
      '/org/g1/members',
    ])('%s mostra a barra', (path) => {
      expect(navBarMode(path)).toBe('visible');
    });

    it('a sessão concluída é tela de ver: só a sessão em andamento esconde', () => {
      expect(navBarMode('/workout/session/s1', { activeSessionId: 's1' })).toBe('hidden');
      expect(navBarMode('/workout/session/s1', { activeSessionId: null })).toBe('visible');
      expect(navBarMode('/workout/session/s1', { activeSessionId: 'outra' })).toBe('visible');
    });
  });

  describe('barra de topo: título e voltar', () => {
    it('o Hoje não tem voltar', () => {
      expect(routeInfo('/')).toEqual({ title: 'Hoje', parent: null, parentTitle: null });
    });

    it.each([
      ['/nutrition', 'Nutrição', null, null],
      ['/you', 'Você', null, null],
      ['/profile', 'Perfil', '/you', 'Você'],
      ['/progress', 'Progresso', '/you', 'Você'],
      ['/goals', 'Metas pessoais', '/you', 'Você'],
      ['/profile/notifications', 'Notificações', '/you', 'Você'],
      ['/nutrition/foods', 'Meus alimentos', '/nutrition', 'Nutrição'],
      ['/nutrition/goals?from=home', 'Metas do dia', '/nutrition', 'Nutrição'],
      ['/workout/plans/p1', 'Plano de treino', '/workout/plans', 'Planos de treino'],
      ['/workout/session/s1', 'Treino', '/workout/history', 'Histórico de treino'],
      ['/progress/records', 'Recordes', '/progress', 'Progresso'],
      ['/plan', 'Meu plano', '/you', 'Você'],
      ['/chat/c1', 'Chat', '/', 'Hoje'],
      ['/community/g1', 'Comunidade', '/community', 'Comunidade'],
      ['/students/m1', 'Membro', '/students', 'Membros'],
      ['/community/new', 'Criar comunidade', '/community', 'Comunidade'],
      ['/org/g1', 'Painel', '/community/g1', 'Comunidade'],
      ['/org/g1/members', 'Membros', '/org/g1', 'Painel'],
      ['/org/g1/members/m9', 'Membro', '/org/g1/members', 'Membros'],
      ['/org/g1/seats', 'Assentos', '/org/g1', 'Painel'],
      ['/org/g1/settings?x=1', 'Configurações', '/org/g1', 'Painel'],
      ['/community/g1/feed', 'Mural', '/community/g1', 'Comunidade'],
      ['/community/g1/settings', 'Sobre a comunidade', '/community/g1', 'Comunidade'],
      ['/org/g1/moderation', 'Moderação', '/org/g1', 'Painel'],
    ])('%s: "%s", volta para %s', (path, title, parent, parentTitle) => {
      expect(routeInfo(path)).toEqual({ title, parent, parentTitle });
    });

    it('rota fora do mapa volta ao ancestral conhecido mais próximo', () => {
      expect(routeInfo('/nutrition/xyz').parent).toBe('/nutrition');
      expect(routeInfo('/desconhecida/a/b').parent).toBe('/');
    });

    it('voltar sempre chega a uma aba raiz, sem ciclo', () => {
      for (const r of ROUTES) {
        let path: string | null = r.pattern.replace(/:\w+/g, 'x');
        const visitados = new Set<string>();
        let last = path;
        while (path !== null) {
          expect(visitados.has(path)).toBe(false);
          visitados.add(path);
          last = path;
          path = routeInfo(path).parent;
        }
        expect(['/', '/nutrition', '/workout', '/community', '/you']).toContain(last);
      }
    });
  });
});

describe('abas raiz', () => {
  it('as 5 abas são telas de ver: sem seta de voltar', () => {
    for (const tab of ['/', '/nutrition', '/workout', '/community', '/you']) {
      expect(routeInfo(tab).parent, tab).toBeNull();
    }
  });

  it('só o Hoje fica sem barra de topo: as outras abas têm título e ações', () => {
    expect(hasTopBar('/')).toBe(false);
    expect(hasTopBar('/workout')).toBe(true);
    expect(hasTopBar('/workout/plans')).toBe(true);
  });

  it('o que fica dentro de uma aba volta para ela', () => {
    expect(routeInfo('/workout/plans').parent).toBe('/workout');
    expect(routeInfo('/nutrition/foods').parent).toBe('/nutrition');
  });
});
