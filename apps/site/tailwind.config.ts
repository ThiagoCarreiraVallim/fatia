import type { Config } from 'tailwindcss';

/**
 * Tokens espelham `apps/web/tailwind.config.ts` para o site e o app parecerem o
 * mesmo produto. Duplicado em vez de extraído para um pacote compartilhado
 * porque são dois arquivos pequenos e estáveis — extrair agora seria abstração
 * antes da segunda repetição real (ver docs/CLAUDE.md).
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{astro,html,js,ts,md}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
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
        accent: 'hsl(var(--accent))',
        border: 'hsl(var(--border))',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};

export default config;
