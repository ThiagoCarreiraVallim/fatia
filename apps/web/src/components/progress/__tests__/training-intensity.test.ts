import { describe, expect, it } from 'vitest';
import type { WorkoutSession } from '@fatia/api-client';
import { heatmapCells } from '../training-intensity';

// Fuso com dia local diferente do UTC à noite: em UTC o teste de "dia local"
// não distinguiria nada.
process.env.TZ = 'America/Sao_Paulo';

function sessao(startedAt: string, minutos = 60): WorkoutSession {
  const fim = new Date(new Date(startedAt).getTime() + minutos * 60_000).toISOString();
  return { id: startedAt, startedAt, completedAt: fim, sets: [] } as unknown as WorkoutSession;
}

describe('heatmapCells', () => {
  // Terça, 13/10/2026, à tarde no horário local do teste.
  const hoje = new Date(2026, 9, 13, 15);

  it('covers two calendar weeks starting on Sunday, so the D S T… header lines up', () => {
    const cells = heatmapCells([], hoje);

    expect(cells).toHaveLength(14);
    expect(cells[0].date).toBe('2026-10-04'); // domingo da semana passada
    expect(cells[13].date).toBe('2026-10-17'); // sábado desta semana
    expect(cells.map((c) => c.future)).toEqual([...Array(10).fill(false), true, true, true, true]);
  });

  it('places a session on its local day', () => {
    const noite = new Date(2026, 9, 12, 21, 30); // segunda, 21h30 local
    const cells = heatmapCells([sessao(noite.toISOString())], hoje);

    const segunda = cells.find((c) => c.date === '2026-10-12');
    expect(segunda?.intensity).toBeGreaterThan(0);
    expect(cells.filter((c) => c.intensity > 0)).toHaveLength(1);
  });
});
