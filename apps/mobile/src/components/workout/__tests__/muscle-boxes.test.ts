import { describe, expect, it } from 'vitest';
import { MUSCLE_BOXES } from '@fatia/api-client';
import type { MusclePath } from '../muscle-path';
import { BACK_PATHS } from '../muscle-paths-back';
import { FRONT_PATHS } from '../muscle-paths-front';

/**
 * O recorte do boneco (#474) usa uma tabela de caixas por músculo em
 * `@fatia/api-client`. Ela foi tirada destes traços; se o desenho mudar, este
 * teste recalcula e aponta a diferença. Os traços só têm comandos absolutos
 * (M, L, C, H, V, Z), e o ponto de controle das curvas fica dentro da caixa com
 * folga de poucos pontos: é o bastante para um recorte.
 */
function boxesOf(paths: MusclePath[]): Record<string, number[]> {
  const boxes: Record<string, [number, number, number, number]> = {};
  for (const path of paths) {
    if (!path.muscle) continue;
    const tokens = path.d.match(/[A-Za-z]|-?\d*\.?\d+(?:e-?\d+)?/g) ?? [];
    let cmd = '';
    let x = 0;
    let y = 0;
    let pending: number[] = [];
    const box = boxes[path.muscle] ?? [Infinity, Infinity, -Infinity, -Infinity];
    const add = () => {
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    };
    for (const token of tokens) {
      if (/[A-Za-z]/.test(token)) {
        expect('MLCHVZ').toContain(token);
        cmd = token;
        continue;
      }
      pending.push(Number(token));
      if (cmd === 'H') x = pending.pop()!;
      else if (cmd === 'V') y = pending.pop()!;
      else if (pending.length === 2) [x, y] = pending as [number, number];
      else continue;
      pending = [];
      add();
    }
    boxes[path.muscle] = box;
  }
  return Object.fromEntries(Object.entries(boxes).map(([k, b]) => [k, b.map(Math.round)]));
}

describe('MUSCLE_BOXES bate com os traços do boneco', () => {
  it('frente', () => {
    expect(boxesOf(FRONT_PATHS)).toEqual(MUSCLE_BOXES.front);
  });

  it('costas', () => {
    expect(boxesOf(BACK_PATHS)).toEqual(MUSCLE_BOXES.back);
  });
});
