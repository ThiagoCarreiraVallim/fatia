/**
 * Fontes do design system v2: Sora (números e títulos) e Manrope (texto).
 *
 * No Android, `fontWeight` não troca o arquivo de uma fonte própria — o texto
 * continuaria regular. Por isso cada peso é uma família (`Manrope_700Bold`),
 * e é a família que muda o peso. Os nomes batem com os do
 * `@expo-google-fonts`, carregados em `app/_layout.tsx`, e com o
 * `fontFamily` do `tailwind.config.js` (`font-sans-bold`, `font-display`…).
 */
export const FONT_FAMILIES = {
  body: {
    400: 'Manrope_400Regular',
    500: 'Manrope_500Medium',
    600: 'Manrope_600SemiBold',
    700: 'Manrope_700Bold',
    800: 'Manrope_800ExtraBold',
  },
  display: {
    600: 'Sora_600SemiBold',
    700: 'Sora_700Bold',
  },
} as const;

export type FontRole = keyof typeof FONT_FAMILIES;

/** A família carregada mais próxima do peso pedido. */
export function fontFamilyFor(role: FontRole, weight: number): string {
  const options = FONT_FAMILIES[role] as Record<number, string>;
  const weights = Object.keys(options).map(Number);
  const nearest = weights.reduce((best, w) =>
    Math.abs(w - weight) < Math.abs(best - weight) ? w : best,
  );
  return options[nearest];
}
