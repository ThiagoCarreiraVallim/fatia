import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { motionTiming } from '@/theme/motion-values';

/**
 * A folha sobe em 550 ms com a curva do DS (prancha Movimento). Sem
 * `animationConfigs`, o @gorhom usa o padrão dele (250 ms no Android, mola no
 * iOS), e a folha do app destoa da web. O componente importa Reanimated e o
 * @gorhom, que não rodam no Node; por isso a ligação é conferida no fonte.
 */
const ROOT = path.resolve(__dirname, '../../../..');
const read = (f: string) => readFileSync(path.join(ROOT, f), 'utf8');

describe('movimento da folha no app', () => {
  it('a duração do tipo sheet é 550 ms, e 0 com reduzir movimento', () => {
    expect(motionTiming('sheet', false).duration).toBe(550);
    expect(motionTiming('sheet', true).duration).toBe(0);
  });

  it('o Drawer passa animationConfigs com o tempo de folha do DS', () => {
    expect(read('src/components/ui/drawer.tsx')).toMatch(/animationConfigs=\{SHEET_ANIMATION\}/);
    expect(read('src/theme/motion.ts')).toMatch(
      /export const SHEET_ANIMATION\b[^=]*=\s*timing\('sheet'\)/,
    );
  });
});
