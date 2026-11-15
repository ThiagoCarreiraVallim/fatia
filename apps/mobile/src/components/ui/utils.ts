import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * O tailwind-merge precisa conhecer a escala de texto e as famílias do DS:
 * sem isso ele lê `text-h2` como cor e apaga a `text-foreground` ao lado.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['d1', 'd2', 'd3', 'h1', 'h2', 'h3', 'b1', 'b2', 'eb'] }],
      'font-family': [
        {
          font: [
            'sans',
            'sans-medium',
            'sans-semibold',
            'sans-bold',
            'sans-extrabold',
            'display',
            'display-semibold',
          ],
        },
      ],
    },
  },
});

/** Mesma função de `apps/web/src/lib/utils.ts` — mantida idêntica de propósito. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
