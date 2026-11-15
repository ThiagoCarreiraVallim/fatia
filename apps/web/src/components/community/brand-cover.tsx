import type * as React from 'react';
import { checkBrandColor, DEFAULT_BRAND, hexToHslTriplet } from '@fatia/design';
import { cn } from '@/lib/utils';

/**
 * Variáveis da cor da comunidade (DESIGN.md · Cor da comunidade). A cor só vive
 * como superfície (capa, botão `brand`, selo PRO · grupo): entra pelo `--brand`
 * no `style` de quem envolve a tela da comunidade, com o texto por cima
 * escolhido pelo contraste. Cor recusada (inválida ou perto do verde do Fatia)
 * cai na cor padrão — mesma regra do validador da API (`@IsBrandColor`).
 */
export function brandStyle(color: string | null | undefined): React.CSSProperties {
  const check = color ? checkBrandColor(color) : null;
  const ok = check && check.status !== 'rejected' ? check : null;
  const bg = ok ? ok.color : DEFAULT_BRAND.color;
  const fg = ok ? ok.text : DEFAULT_BRAND.text;
  return {
    ['--brand' as string]: hexToHslTriplet(bg),
    ['--brand-foreground' as string]: hexToHslTriplet(fg),
  } as React.CSSProperties;
}

/**
 * Capa da comunidade (prancha Componentes-plano · 1.1): a cor dela numa faixa
 * no alto do card, e o nome e a contagem embaixo, no texto do card. Texto
 * nenhum vai sobre a cor: uma cor aceita com aviso (abaixo de 4,5:1) deixaria
 * o subtítulo ilegível.
 */
export function BrandCover({
  name,
  color,
  subtitle,
  logo,
  className,
}: {
  name: string;
  color: string | null | undefined;
  subtitle?: string;
  logo?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      style={brandStyle(color)}
      className={cn('overflow-hidden rounded-card bg-card', className)}
    >
      <div
        aria-hidden
        className="h-[110px] bg-[linear-gradient(150deg,hsl(var(--brand)),hsl(var(--brand)/0.45))]"
      />
      <div className="flex items-center gap-3 p-4">
        {logo}
        <div className="min-w-0">
          <h1 className="truncate font-display text-h3 font-bold text-foreground">{name}</h1>
          {subtitle && <p className="text-b2 text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
    </header>
  );
}
