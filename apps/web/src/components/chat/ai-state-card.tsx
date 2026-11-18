'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertCircle, Clock, RotateCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ghostButton } from '@/components/elements/surfaces';

const TONE = {
  warning: {
    ring: 'ring-1 ring-inset ring-warning/35',
    chip: 'bg-warning/15 text-warning',
    icon: Clock,
  },
  danger: {
    ring: 'ring-1 ring-inset ring-danger/35',
    chip: 'bg-danger/15 text-danger',
    icon: AlertCircle,
  },
} as const;

const ACTION_CLASS = cn(
  ghostButton,
  'flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-foreground/[0.08] px-4 text-sm font-semibold text-foreground',
);

/**
 * O cartão dos estados da IA (prancha Al-M11): o ícone num chip da cor do estado, o título, o
 * texto e a ação de largura cheia. "Cota" é âmbar (volta tal hora, registro à mão); "fora do ar"
 * é vermelho (a mensagem ficou salva, tentar de novo).
 */
export function AiStateCard({
  tone,
  title,
  body,
  action,
  role = 'alert',
  className,
}: {
  tone: keyof typeof TONE;
  title: string;
  body: ReactNode;
  action: { label: string; href: string } | { label: string; onClick: () => void };
  role?: 'alert' | 'status';
  className?: string;
}) {
  const { ring, chip, icon: Icone } = TONE[tone];
  return (
    <div
      role={role}
      className={cn(
        'flex w-full flex-col gap-2.5 rounded-3xl bg-foreground/[0.04] p-4',
        ring,
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className={cn('grid size-9 shrink-0 place-items-center rounded-xl', chip)}
        >
          <Icone size={16} />
        </span>
        <p className="flex-1 text-[15px] font-bold text-foreground">{title}</p>
      </div>
      <p className="text-sm text-foreground/75">{body}</p>
      {'href' in action ? (
        <Link href={action.href} className={ACTION_CLASS}>
          {action.label}
        </Link>
      ) : (
        <button type="button" onClick={action.onClick} className={ACTION_CLASS}>
          <RotateCw size={16} aria-hidden />
          {action.label}
        </button>
      )}
    </div>
  );
}
