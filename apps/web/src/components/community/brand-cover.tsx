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

/** Capa da comunidade: fundo na cor dela, nome em Sora por cima. */
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
      className={cn(
        'flex min-h-[140px] items-end gap-4 rounded-card bg-brand p-5 text-brand-foreground',
        className,
      )}
    >
      {logo}
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-bold leading-tight">{name}</h1>
        {subtitle && <p className="text-sm opacity-80">{subtitle}</p>}
      </div>
    </header>
  );
}
