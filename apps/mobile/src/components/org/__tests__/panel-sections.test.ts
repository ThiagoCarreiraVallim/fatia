import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { panelHref, type GroupRole } from '@fatia/api-client';
import { mobilePanelSections } from '../panel-sections';

const APP = path.resolve(__dirname, '../../../../app/(app)');

/** O arquivo de rota do Expo Router para um caminho do painel. */
function hasRoute(href: string): boolean {
  const rel = href.replace(/^\/org\/[^/]+/, 'org/[groupId]');
  return [`${rel}.tsx`, `${rel}/index.tsx`].some((f) => existsSync(path.join(APP, f)));
}

describe('abas do painel no app (#399, F7)', () => {
  it.each<GroupRole>(['OWNER', 'PROFESSIONAL'])(
    'toda seção que aparece para %s tem tela no app',
    (role) => {
      const secoes = mobilePanelSections(role);
      expect(secoes.length).toBeGreaterThan(0);
      for (const s of secoes) expect(hasRoute(panelHref('g1', s.section))).toBe(true);
    },
  );

  it('"Para revisar" fica de fora até a tela do app existir (#414)', () => {
    expect(mobilePanelSections('OWNER').map((s) => s.section)).not.toContain('review');
  });

  it('relatório e origens dos convites (#400) também ficam para a #414', () => {
    const secoes = mobilePanelSections('OWNER').map((s) => s.section);
    expect(secoes).not.toContain('report');
    expect(secoes).not.toContain('origins');
  });
});
