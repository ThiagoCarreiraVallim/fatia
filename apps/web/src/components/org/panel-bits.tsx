'use client';

import type { ReactNode } from 'react';
import type { ChipTone } from '@fatia/api-client';
import { cn } from '@/lib/utils';

/**
 * Peças pequenas das telas de dinheiro e de programas do painel (#403):
 * cabeçalho da página, cartão de número, selo de status com ponto e abas
 * com contagem. O status nunca é só a cor: o texto vai junto.
 */

export function PanelPageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </div>
  );
}

const DOT: Record<ChipTone, string | null> = {
  ok: 'bg-success',
  warn: 'bg-warning',
  info: 'bg-info',
  neutral: null,
  muted: null,
};

export function StatusChip({ label, tone }: { label: string; tone: ChipTone }) {
  const dot = DOT[tone];
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 text-xs font-medium shadow-[inset_0_0_0_1px_hsl(var(--border))]',
        tone === 'muted' ? 'text-muted-foreground' : 'text-foreground',
      )}
    >
      {dot && <span aria-hidden className={cn('h-1.5 w-1.5 rounded-full', dot)} />}
      {label}
    </span>
  );
}

const VALUE_TONE: Partial<Record<ChipTone, string>> = {
  ok: 'text-success',
  warn: 'text-warning',
};

export function PanelStat({
  label,
  value,
  sub,
  tone,
  className,
}: {
  label: string;
  value: string;
  sub?: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border border-subtle bg-card px-4 py-3',
        tone === 'warn' && 'border-[hsl(var(--warning)/0.5)]',
        className,
      )}
    >
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          'truncate font-display text-[26px] font-bold leading-tight tabular-nums',
          tone && VALUE_TONE[tone],
        )}
      >
        {value}
      </p>
      {sub && <p className="truncate text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function CountTabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { key: T; label: string; count?: number | null }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="flex max-w-full gap-0.5 overflow-x-auto rounded-[10px] bg-card p-[3px]"
    >
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'flex h-[30px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-2.5 text-[13px] font-semibold',
            value === t.key
              ? 'bg-muted text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t.label}
          {t.count != null && (
            <span className="rounded bg-surface-3 px-1.5 text-[11px] tabular-nums">{t.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Tabela do painel numa caixa: rola por dentro no celular, nunca a página. */
export function PanelTable({
  label,
  head,
  children,
  minWidth = 560,
}: {
  label: string;
  head: string[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-subtle bg-card">
      <table aria-label={label} className="w-full text-sm" style={{ minWidth }}>
        <thead>
          <tr className="border-b border-subtle text-left text-[13px] text-muted-foreground">
            {head.map((h) => (
              <th key={h} scope="col" className="px-3 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-subtle">{children}</tbody>
      </table>
    </div>
  );
}
