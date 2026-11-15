import * as React from 'react';
import type { IconName } from '@fatia/design';
import { cn } from '@/lib/utils';
import { Icon } from './icon';

type Tone = 'info' | 'warning' | 'danger' | 'success';

const TONE: Record<Tone, { box: string; icon: IconName }> = {
  info: { box: 'bg-[hsl(var(--info)/0.12)] text-info', icon: 'info' },
  warning: { box: 'bg-[hsl(var(--warning)/0.12)] text-warning', icon: 'alert' },
  danger: { box: 'bg-[hsl(var(--danger)/0.12)] text-danger', icon: 'alert' },
  success: { box: 'bg-[hsl(var(--success)/0.12)] text-success', icon: 'check' },
};

/**
 * Faixa de aviso dentro da tela (prancha Componentes · Estados): offline,
 * cota da IA no fim, pagamento pendente. Ícone + texto, nunca só a cor.
 * `role="status"` para o leitor de tela anunciar sem roubar o foco; o tom
 * `danger` vira `alert`.
 */
export function Banner({
  tone = 'info',
  title,
  children,
  action,
  className,
}: {
  tone?: Tone;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('anim-fade flex items-start gap-3 rounded-field p-4', t.box, className)}
    >
      <Icon name={t.icon} size={20} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{title}</p>
        {children && <div className="mt-0.5 text-[13px] text-foreground/80">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
