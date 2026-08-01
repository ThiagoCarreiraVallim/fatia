/**
 * Forma de um traço do boneco anatômico, já extraído do SVG de origem.
 *
 * `group` e `muscle` são o `id` e o `data-muscle` do SVG original. O PWA acha o
 * grupo com `querySelectorAll('g[data-muscle=...]')`; aqui não há DOM nem
 * seletor de atributo, então a mesma informação viaja como dado e o casamento é
 * feito em código — por isso os dois campos precisam sobreviver à extração.
 */
export interface MusclePath {
  d: string;
  fill: string | null;
  fillRule?: 'evenodd' | 'nonzero';
  stroke?: string;
  strokeWidth?: number;
  group?: string;
  muscle?: string;
}
