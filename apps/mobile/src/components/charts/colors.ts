/**
 * Cores literais para as props do React Native que não aceitam `className` —
 * `stroke`/`fill` do SVG, `color` de ícone, `ActivityIndicator`.
 *
 * São os mesmos valores dos tokens de `global.css`. Ficam aqui, e não espalhadas
 * pelos componentes, para que uma troca de paleta tenha um lugar só para mexer.
 */
export const chartColors = {
  primary: '#2ce500',
  foreground: '#e5e2e1',
  mutedForeground: '#baccaf',
  background: '#131313',
  card: '#2a2a2a',
  border: '#333333',
  destructive: '#93000a',
} as const;
