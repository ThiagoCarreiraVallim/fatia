/**
 * Espelho de `apps/web/tailwind.config.ts`.
 *
 * A paleta é a mesma de propósito e não pode divergir — os tokens vivem em
 * `global.css` (fonte: packages/design/src/tokens.ts), nos dois temas, e este
 * arquivo só os expõe como utilitários. `src/theme/__tests__/palette.test.ts`
 * garante que os dois CSS batem.
 *
 * Fontes: uma família por peso, porque o Android não sintetiza negrito em fonte
 * própria — `font-bold` sozinho mudaria só o peso pedido, e a letra continuaria
 * a regular. Os nomes são os que `src/theme/fonts.ts` carrega.
 *
 * @type {import('tailwindcss').Config}
 */
const plugin = require('tailwindcss/plugin');

/**
 * `font-bold` e companhia trocam a família, não o `fontWeight`: no Android o
 * peso pedido sozinho não troca o arquivo da fonte própria, e `fontWeight`
 * junto de uma família carregada pode cair na fonte do sistema. Ficam depois
 * das utilidades de família no CSS gerado, então vencem o `font-sans` que o
 * `Text` do DS põe por padrão.
 */
const WEIGHT_FAMILIES = {
  '.font-thin': 'Manrope_400Regular',
  '.font-extralight': 'Manrope_400Regular',
  '.font-light': 'Manrope_400Regular',
  '.font-normal': 'Manrope_400Regular',
  '.font-medium': 'Manrope_500Medium',
  '.font-semibold': 'Manrope_600SemiBold',
  '.font-bold': 'Manrope_700Bold',
  '.font-extrabold': 'Manrope_800ExtraBold',
  '.font-black': 'Manrope_800ExtraBold',
};

module.exports = {
  darkMode: 'class',
  corePlugins: { fontWeight: false },
  content: ['./app/**/*.{ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope_400Regular'],
        'sans-medium': ['Manrope_500Medium'],
        'sans-semibold': ['Manrope_600SemiBold'],
        'sans-bold': ['Manrope_700Bold'],
        'sans-extrabold': ['Manrope_800ExtraBold'],
        display: ['Sora_700Bold'],
        'display-semibold': ['Sora_600SemiBold'],
      },
      fontSize: {
        d1: ['56px', { lineHeight: '56px', letterSpacing: '-2.24px' }],
        d2: ['40px', { lineHeight: '40px', letterSpacing: '-1.2px' }],
        d3: ['28px', { lineHeight: '31px', letterSpacing: '-0.56px' }],
        h1: ['28px', { lineHeight: '32px', letterSpacing: '-0.56px' }],
        h2: ['22px', { lineHeight: '26px', letterSpacing: '-0.33px' }],
        h3: ['17px', { lineHeight: '22px' }],
        b1: ['15px', { lineHeight: '22px' }],
        b2: ['13px', { lineHeight: '18px' }],
        eb: ['12px', { lineHeight: '16px', letterSpacing: '0.72px' }],
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
          text: 'hsl(var(--primary-text))',
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
        },
      },
      // `text-primary` é o verde que passa como texto nos dois temas (no claro, o
      // da marca não passa 4,5:1); `bg-primary` continua o verde da marca.
      textColor: {
        primary: {
          DEFAULT: 'hsl(var(--primary-text))',
          foreground: 'hsl(var(--primary-foreground))',
          text: 'hsl(var(--primary-text))',
        },
      },
      borderRadius: {
        sm: 10,
        md: 12,
        lg: 14,
        chip: 10,
        field: 14,
        card: 20,
        sheet: 28,
        pill: 999,
      },
    },
  },
  plugins: [
    plugin(({ addUtilities }) => {
      addUtilities(
        Object.fromEntries(
          Object.entries(WEIGHT_FAMILIES).map(([cls, family]) => [cls, { fontFamily: family }]),
        ),
      );
    }),
  ],
};
