'use client';

import Link from 'next/link';
import type { IconName } from '@fatia/design';
import { Icon } from '@/components/ui/icon';
import { cn } from '@/lib/utils';

/**
 * As listas de Você (prancha Al-V1): título pequeno em caixa alta e um cartão
 * com linhas de 52 px — ícone apagado, rótulo, detalhe à direita e a seta.
 */
export function YouSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-faint">{title}</h2>
      <ul className="divide-y divide-subtle overflow-hidden rounded-card bg-card">{children}</ul>
    </section>
  );
}

const rowClass =
  'flex min-h-[52px] w-full items-center gap-3.5 px-[18px] py-3.5 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-60';

function RowBody({
  icon,
  label,
  subtitle,
  trailing,
}: {
  icon: IconName;
  label: string;
  subtitle?: string;
  trailing?: React.ReactNode;
}) {
  return (
    <>
      <Icon name={icon} size={20} className="shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-foreground">{label}</span>
        {subtitle && <span className="block text-b2 text-muted-foreground">{subtitle}</span>}
      </span>
      {trailing}
    </>
  );
}

/** Linha que abre uma tela. */
export function YouLinkRow({
  href,
  icon,
  label,
  subtitle,
  detail,
  prefetch,
}: {
  href: string;
  icon: IconName;
  label: string;
  subtitle?: string;
  /** À direita, antes da seta: texto ou selo. */
  detail?: React.ReactNode;
  prefetch?: boolean;
}) {
  return (
    <li>
      <Link href={href} prefetch={prefetch} className={rowClass}>
        <RowBody
          icon={icon}
          label={label}
          subtitle={subtitle}
          trailing={
            <>
              {typeof detail === 'string' ? (
                <span className="shrink-0 text-xs text-faint">{detail}</span>
              ) : (
                detail
              )}
              <Icon name="chevR" size={20} className="shrink-0 text-faint" />
            </>
          }
        />
      </Link>
    </li>
  );
}

/** Linha que faz algo ali mesmo (trocar senha, exportar). */
export function YouActionRow({
  icon,
  label,
  subtitle,
  onClick,
  disabled,
}: {
  icon: IconName;
  label: string;
  subtitle?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <li>
      <button type="button" onClick={onClick} disabled={disabled} className={rowClass}>
        <RowBody icon={icon} label={label} subtitle={subtitle} />
      </button>
    </li>
  );
}

/**
 * Linha que liga e desliga. A linha inteira é o botão (`aria-pressed`), como
 * na prancha; o trilho é só desenho.
 */
export function YouToggleRow({
  icon,
  label,
  subtitle,
  on,
  onToggle,
  disabled,
}: {
  icon: IconName;
  label: string;
  subtitle?: string;
  on: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        disabled={disabled}
        className={rowClass}
      >
        <RowBody icon={icon} label={label} subtitle={subtitle} trailing={<ToggleTrack on={on} />} />
      </button>
    </li>
  );
}

export function ToggleTrack({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'relative h-7 w-12 shrink-0 rounded-pill transition-colors duration-fast',
        on ? 'bg-primary' : 'bg-surface-3',
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
