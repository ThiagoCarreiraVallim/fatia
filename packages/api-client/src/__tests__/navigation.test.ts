import { describe, expect, it } from 'vitest';
import { PRIMARY_TABS, activeNavKey, menuSections } from '../navigation';

const hrefs = (s: ReturnType<typeof menuSections>) => s.flatMap((x) => x.items.map((i) => i.href));

describe('navegação', () => {
  it('a barra tem Início, Nutrição e Treino (o "+" e o "Mais" são botões)', () => {
    expect(PRIMARY_TABS.map((t) => [t.label, t.href])).toEqual([
      ['Início', '/'],
      ['Nutrição', '/nutrition'],
      ['Treino', '/workout'],
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
    ]);
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
    ['/progress', 'more'],
    ['/goals', 'more'],
    ['/profile/connect', 'more'],
    ['/chat/abc', 'more'],
    ['/nutritionx', 'more'],
  ])('%s acende %s', (path, key) => {
    expect(activeNavKey(path)).toBe(key);
  });
});
