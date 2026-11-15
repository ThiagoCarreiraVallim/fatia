import type { Config } from 'tailwindcss';

/**
 * Espelho de `apps/web/tailwind.config.ts`: os valores vivem em
 * `src/styles/global.css` (fonte: packages/design/src/tokens.ts, conferido pelo
 * css-parity.test.ts do pacote). O site segue o tema do sistema, sem seletor.
 */
const config: Config = {
  darkMode: 'media',
  content: ['./src/**/*.{astro,html,js,ts,md}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora Variable', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: 'hsl(var(--card))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        faint: 'hsl(var(--faint-foreground))',
        'surface-3': 'hsl(var(--surface-3))',
        accent: 'hsl(var(--accent))',
        border: 'hsl(var(--border))',
        'border-strong': 'hsl(var(--border-strong))',
      },
      // Verde da marca só como superfície: `text-primary` é o que passa 4,5:1.
      textColor: {
        primary: {
          DEFAULT: 'hsl(var(--primary-text))',
          foreground: 'hsl(var(--primary-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        chip: '10px',
        field: '14px',
        card: '20px',
        sheet: '28px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};

export default config;
