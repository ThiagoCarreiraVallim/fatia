import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Mesma função de `apps/web/src/lib/utils.ts` — mantida idêntica de propósito. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
