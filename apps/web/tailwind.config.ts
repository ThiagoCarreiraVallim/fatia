import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  // `dark:` vale quando o tema resolvido é o escuro (o script do <head> grava
  // `data-theme` no <html>; ver src/lib/theme-script.ts).
  darkMode: ['selector', '[data-theme="dark"]'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // Manrope no texto, Sora em números e títulos (DS v2 "Noite", #368).
      fontFamily: {
        sans: ['var(--font-manrope)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-sora)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Escala do canvas: d1–d3 para números, h1–h3 títulos, b1/b2 texto, eb sobretítulo.
      fontSize: {
        d1: ['56px', { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '700' }],
        d2: ['40px', { lineHeight: '1', letterSpacing: '-0.03em', fontWeight: '700' }],
        d3: ['28px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        h1: ['28px', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        h2: ['22px', { lineHeight: '1.2', letterSpacing: '-0.015em', fontWeight: '700' }],
        h3: ['17px', { lineHeight: '1.3', fontWeight: '600' }],
        b1: ['15px', { lineHeight: '1.45' }],
        b2: ['13px', { lineHeight: '1.4' }],
        eb: ['12px', { lineHeight: '1.3', letterSpacing: '0.06em', fontWeight: '700' }],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          // Verde que pode ser texto: no claro o da marca não passa 4,5:1.
          text: 'hsl(var(--primary-text))',
          soft: 'hsl(var(--primary-soft))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        faint: 'hsl(var(--faint-foreground))',
        'surface-3': 'hsl(var(--surface-3))',
        sunken: 'hsl(var(--sunken))',
        'border-strong': 'hsl(var(--border-strong))',
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        danger: 'hsl(var(--danger))',
        success: 'hsl(var(--success))',
        warning: 'hsl(var(--warning))',
        protein: 'hsl(var(--protein))',
        carbs: 'hsl(var(--carbs))',
        fat: 'hsl(var(--fat))',
        water: 'hsl(var(--water))',
        kcal: 'hsl(var(--kcal))',
        steps: 'hsl(var(--steps))',
        info: 'hsl(var(--info))',
        ok: 'hsl(var(--ok))',
        brand: {
          DEFAULT: 'hsl(var(--brand))',
          foreground: 'hsl(var(--brand-foreground))',
          soft: 'hsl(var(--brand-soft))',
        },
        subtle: 'hsl(var(--border-subtle))',
      },
      // `text-primary` usa o verde que passa como texto nos dois temas; o fundo
      // (`bg-primary`) continua o verde da marca. Regra do claro: verde da marca
      // só como superfície (ADR 041).
      textColor: {
        primary: {
          DEFAULT: 'hsl(var(--primary-text))',
          foreground: 'hsl(var(--primary-foreground))',
          text: 'hsl(var(--primary-text))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // Raios do canvas: chip 10, campo/botão 14, card 20, folha 28; pílula só
        // em selo e interruptor.
        chip: '10px',
        field: '14px',
        card: '20px',
        sheet: '28px',
        pill: '999px',
      },
      transitionDuration: {
        fast: '150ms',
        base: '300ms',
        tab: '500ms',
        sheet: '550ms',
        data: '1300ms',
      },
      transitionTimingFunction: {
        ds: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [animate],
};

export default config;
