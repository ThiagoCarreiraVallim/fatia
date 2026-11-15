'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { firstStepsRingOffset, onboardingApi } from '@fatia/api-client';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

export const FIRST_STEPS_KEY = ['onboarding', 'first-steps'] as const;

/**
 * "Primeiros passos" no Hoje (Onb-11): três tarefas com o anel 0/3, cada uma
 * riscada quando feita (a API confere: refeição registrada, treino, comunidade
 * ou desafio). Com as três, "Tudo pronto!" até o fim do dia, e some no seguinte.
 */
export function FirstStepsCard() {
  const q = useQuery({ queryKey: FIRST_STEPS_KEY, queryFn: () => onboardingApi.firstSteps() });
  const view = q.data;
  if (!view || !view.visible) return null;

  if (view.allDone) {
    return (
      <section
        aria-label="Primeiros passos"
        className="anim-pop flex items-center gap-3.5 rounded-card bg-primary p-5 text-primary-foreground"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-primary-foreground text-primary">
          <Icon name="check" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-h3">Tudo pronto!</p>
          <p className="text-[13px] font-semibold opacity-75">Este cartão some amanhã</p>
        </div>
        <Link
          href="/onboarding?refazer=1"
          className="flex h-8 items-center rounded-chip bg-black/10 px-3 text-xs font-bold"
        >
          Refazer
        </Link>
      </section>
    );
  }

  const total = view.items.length;
  return (
    <section
      aria-label="Primeiros passos"
      className="flex flex-col gap-3 rounded-card bg-[linear-gradient(160deg,#1c2a18,hsl(var(--card)))] p-5 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-h3">Primeiros passos</h2>
        <div className="relative h-11 w-11">
          <svg width="44" height="44" viewBox="0 0 36 36" aria-hidden className="-rotate-90">
            <circle
              cx="18"
              cy="18"
              r="15"
              strokeWidth="4"
              fill="none"
              className="stroke-surface-3"
            />
            <circle
              cx="18"
              cy="18"
              r="15"
              strokeWidth="4"
              fill="none"
              pathLength={100}
              strokeDasharray="100"
              strokeLinecap="round"
              className="stroke-primary transition-[stroke-dashoffset] duration-base ease-ds"
              style={{ strokeDashoffset: firstStepsRingOffset(view.doneCount, total) }}
            />
          </svg>
          <b className="absolute inset-0 flex items-center justify-center text-[11px] tabular-nums">
            {view.doneCount}/{total}
          </b>
        </div>
      </div>
      <ul className="flex flex-col">
        {view.items.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className={cn('flex items-center gap-3 py-1.5', item.done && 'opacity-55')}
            >
              <span
                aria-hidden
                className={cn(
                  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-primary-foreground',
                  item.done ? 'bg-primary' : 'shadow-[inset_0_0_0_2px_hsl(var(--border-strong))]',
                )}
              >
                {item.done && <Icon name="check" size={16} />}
              </span>
              <div className="min-w-0 flex-1">
                <b className={cn(item.done && 'line-through')}>{item.title}</b>
                <p className="text-xs text-faint">{item.subtitle}</p>
              </div>
              <span className="sr-only">{item.done ? 'feito' : 'a fazer'}</span>
              <Icon name="chevR" className="text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
