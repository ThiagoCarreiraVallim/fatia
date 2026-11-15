'use client';

import type { CSSProperties, ReactNode } from 'react';
import { PROGRESS_SEGMENTS } from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * Peças das telas Onb-* no vocabulário do canvas: o topo com voltar, a barra de
 * 9 traços e "Pular"; o cartão de escolha com check redondo; o stepper; a
 * chave liga-desliga; e os botões `btn pri full` e `btn ghost full`.
 */

export function stagger(i: number): CSSProperties {
  return { ['--i' as string]: i };
}

/**
 * Topo das etapas 3 a 10: voltar, a barra (lima até a etapa anterior, branca
 * na atual, cinza depois) e "Pular" nas puláveis.
 */
export function StepHeader({
  segment,
  onBack,
  onSkip,
}: {
  segment: number;
  onBack?: (() => void) | null;
  onSkip?: (() => void) | null;
}) {
  return (
    <div className="flex items-center gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-card text-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="chevL" size={22} />
        </button>
      ) : (
        <span aria-hidden className="h-11 w-11 shrink-0" />
      )}
      <ProgressBar segment={segment} />
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="h-[34px] shrink-0 rounded-[10px] px-3.5 text-[13px] font-bold text-foreground transition-transform active:scale-95"
        >
          Pular
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ segment, onBrand = false }: { segment: number; onBrand?: boolean }) {
  return (
    <div
      role="progressbar"
      aria-label="Progresso do cadastro"
      aria-valuemin={1}
      aria-valuemax={PROGRESS_SEGMENTS}
      aria-valuenow={segment + 1}
      aria-valuetext={`Etapa ${segment + 1} de ${PROGRESS_SEGMENTS}`}
      className="flex flex-1 gap-1.5"
    >
      {Array.from({ length: PROGRESS_SEGMENTS }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-1 flex-1 rounded-[2px] transition-colors duration-base',
            onBrand
              ? i === segment
                ? 'bg-brand-foreground'
                : 'bg-brand-foreground/30'
              : i < segment
                ? 'bg-primary'
                : i === segment
                  ? 'bg-foreground'
                  : 'bg-surface-3',
          )}
        />
      ))}
    </div>
  );
}

/** A tela inteira da etapa: coluna com o botão principal no pé. */
export function StepScreen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-h-[calc(100dvh-4rem)] flex-col gap-3.5', className)}>
      {children}
    </div>
  );
}

export const Spacer = () => <div aria-hidden className="flex-1" />;

/** `btn pri full`; desabilitado fica a 40% (`.dis`). */
export function PrimaryButton({
  children,
  onClick,
  disabled,
  pending,
  type = 'button',
  className,
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  pending?: boolean;
  type?: 'button' | 'submit';
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      style={style}
      className={cn(
        'flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] bg-primary px-6 text-[15px] font-bold text-primary-foreground shadow-[0_8px_24px_-10px_hsl(var(--primary)/0.6)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** `btn ghost full`. */
export function GhostButton({
  children,
  onClick,
  className,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        '-mt-2 flex h-[52px] w-full items-center justify-center rounded-[16px] text-[15px] font-bold text-foreground transition-transform active:scale-[0.98] disabled:opacity-40',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** `chipic` com o tom do canvas. */
export function OnbChipIcon({
  icon,
  tone = 'lime',
  size = 40,
  className,
}: {
  icon: IconName;
  tone?: 'lime' | 'brand' | 'water' | 'amber' | 'pink' | 'neutral';
  size?: 40 | 52 | 64 | 72;
  className?: string;
}) {
  const tones = {
    lime: 'bg-primary-soft text-primary',
    brand: 'bg-brand-soft text-brand',
    water: 'bg-[hsl(var(--water)/0.14)] text-water',
    amber: 'bg-[hsl(var(--steps)/0.14)] text-steps',
    pink: 'bg-[hsl(var(--fat)/0.14)] text-fat',
    neutral: 'bg-surface-3 text-foreground',
  } as const;
  const box = {
    40: 'h-10 w-10 rounded-[14px]',
    52: 'h-[52px] w-[52px] rounded-[18px]',
    64: 'h-16 w-16 rounded-[22px]',
    72: 'h-[72px] w-[72px] rounded-[24px]',
  } as const;
  const iconSize = { 40: 20, 52: 24, 64: 32, 72: 32 } as const;
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center',
        box[size],
        tones[tone],
        className,
      )}
    >
      <Icon name={icon} size={iconSize[size]} />
    </span>
  );
}

/** O check do canvas (`chk`), redondo nas escolhas únicas. */
export function Check({ on, round = false }: { on: boolean; round?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center text-primary-foreground',
        round ? 'rounded-full' : 'rounded-[8px]',
        on ? 'anim-pop bg-primary' : 'shadow-[inset_0_0_0_2px_hsl(var(--border-strong))]',
      )}
    >
      {on && <Icon name="check" size={16} />}
    </span>
  );
}

/** `tgl` do canvas. */
export function Toggle({ on, dim = false }: { on: boolean; dim?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-fast',
        on ? 'bg-primary' : 'bg-surface-3',
        dim && 'opacity-55',
      )}
    >
      <span
        className={cn(
          'absolute left-[3px] top-[3px] h-[22px] w-[22px] rounded-pill transition-transform duration-base ease-spring motion-reduce:transition-none',
          on ? 'translate-x-5 bg-primary-foreground' : 'bg-white',
        )}
      />
    </span>
  );
}

/** Cartão de escolha: lima por dentro quando escolhido (Onb-04 e Onb-06). */
export function choiceCardClass(selected: boolean, tight = false) {
  return cn(
    'anim-up flex w-full items-center gap-3.5 rounded-card bg-card text-left transition-[box-shadow,background-color] duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    tight ? 'px-[18px] py-4' : 'p-5',
    selected && 'bg-primary-soft shadow-[inset_0_0_0_2px_hsl(var(--primary))]',
  );
}

/** Botão pequeno de mais/menos dos steppers (`ib s2`, 40 px). */
export function StepperButton({
  kind,
  label,
  onClick,
  disabled,
}: {
  kind: 'minus' | 'plus';
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-surface-3 text-foreground transition-transform active:scale-95 disabled:opacity-40"
    >
      {kind === 'plus' ? (
        <Icon name="plus" size={16} />
      ) : (
        <span aria-hidden className="h-0.5 w-3 rounded-[1px] bg-current" />
      )}
    </button>
  );
}

/** Avatar de iniciais (`av`) e a pilha deles (`stack`). */
export function Avatar({
  initials,
  tone = 'neutral',
  size = 28,
}: {
  initials: string;
  tone?: 'neutral' | 'blue' | 'amber' | 'brand';
  size?: 28 | 40;
}) {
  const tones = {
    neutral: 'bg-surface-3 text-foreground',
    blue: 'bg-[#2f4a7a] text-[#dbe6ff]',
    amber: 'bg-[#5a4718] text-[#ffe9b0]',
    brand: 'bg-brand text-brand-foreground',
  } as const;
  return (
    <span
      aria-hidden
      className={cn(
        '-ml-2.5 inline-flex items-center justify-center rounded-full font-display font-bold ring-[3px] ring-background first:ml-0',
        size === 28 ? 'h-7 w-7 text-[11px]' : 'h-10 w-10 text-sm',
        tones[tone],
      )}
    >
      {initials}
    </span>
  );
}

export const AVATAR_TONES = ['neutral', 'blue', 'amber'] as const;
