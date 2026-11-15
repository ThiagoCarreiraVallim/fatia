import type { CSSProperties, ReactNode } from 'react';
import type { GoalTone, IconTone } from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * Peças pequenas do Hoje (pranchas Al-H1/H3/H4/H5), no vocabulário do canvas:
 * `card`, `card tight`, `bar thin` e `chipic`.
 */

export const todayCard =
  'anim-up relative flex flex-col gap-3 overflow-hidden rounded-card bg-card p-5';
export const todayTile =
  'anim-up relative flex flex-col gap-2 overflow-hidden rounded-card bg-card px-[18px] py-4';

/** Índice da entrada escalonada (`--i`, 70 ms entre cartões). */
export function stagger(i: number): CSSProperties {
  return { ['--i' as string]: i };
}

/** Barra fina que cresce da esquerda (`anim-grow-x`); `color` é uma classe `bg-*`. */
export function Bar({
  percent,
  color,
  label,
  index = 0,
  animate = true,
  className,
}: {
  percent: number;
  color: string;
  /** Nome para o leitor de tela; sem ele a barra é decorativa. */
  label?: string;
  index?: number;
  /** Água anima a largura (o "+" muda o valor na hora), em vez de crescer de novo. */
  animate?: boolean;
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div
      {...(label
        ? {
            role: 'meter',
            'aria-label': label,
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': p,
          }
        : { 'aria-hidden': true })}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)}
    >
      <span
        style={{ width: `${p}%`, ...stagger(index) }}
        className={cn(
          'block h-full rounded-full',
          animate ? 'anim-grow-x' : 'transition-[width] duration-[400ms] ease-ds',
          color,
        )}
      />
    </div>
  );
}

const TONE: Record<IconTone, string> = {
  lime: 'bg-primary-soft text-primary',
  blue: 'bg-[hsl(var(--protein)/0.14)] text-protein',
  water: 'bg-[hsl(var(--water)/0.14)] text-water',
  amber: 'bg-[hsl(var(--steps)/0.14)] text-steps',
  brand: 'bg-brand-soft text-brand',
  // `chipic pink` (Aniversário) e o `chipic` sem tom (Pesagem, Moderação).
  pink: 'bg-[hsl(var(--fat)/0.14)] text-fat',
  neutral: 'bg-surface-3 text-foreground',
};

/** Ícone num quadrado de canto 14 (11 no compacto), com o fundo do tom a 14%. */
export function ChipIcon({
  icon,
  tone,
  size = 40,
}: {
  icon: IconName;
  tone: IconTone;
  size?: 32 | 34 | 40;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        size === 32
          ? 'h-8 w-8 rounded-[10px]'
          : size === 34
            ? 'h-[34px] w-[34px] rounded-[11px]'
            : 'h-10 w-10 rounded-[14px]',
        TONE[tone],
      )}
    >
      <Icon name={icon} size={size === 40 ? 20 : 16} />
    </span>
  );
}

/** Cor da barra de cada tom. */
export const TONE_BAR: Record<GoalTone, string> = {
  lime: 'bg-primary',
  blue: 'bg-protein',
  water: 'bg-water',
  amber: 'bg-steps',
};

/** Rótulo pequeno em maiúsculas dentro de cartão ("PRÓXIMO TREINO"). */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('text-xs font-bold opacity-70', className)}>{children}</p>;
}
