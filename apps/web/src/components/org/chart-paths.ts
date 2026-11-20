/** Uma célula de série do painel: `null` é dia oculto (menos de 5 pessoas). */
export interface ChartCell {
  value: number | null;
}

/**
 * Os trechos da linha dos gráficos do painel (#398, #400), num `viewBox` de
 * 1000 × 200; célula oculta vira um buraco na linha, nunca zero.
 */
export function linePaths(cells: ChartCell[], max: number): string[] {
  const passo = cells.length > 1 ? 1000 / (cells.length - 1) : 0;
  const out: string[] = [];
  let atual: string[] = [];
  cells.forEach((c, i) => {
    if (c.value === null) {
      if (atual.length) out.push(atual.join(' '));
      atual = [];
      return;
    }
    const x = (i * passo).toFixed(1);
    const y = (190 - (c.value / max) * 175).toFixed(1);
    atual.push(`${atual.length ? 'L' : 'M'}${x} ${y}`);
  });
  if (atual.length) out.push(atual.join(' '));
  return out;
}
