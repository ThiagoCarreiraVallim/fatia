import { personalNoticeView, type PersonalNoticeInput } from '@fatia/api-client';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Icon } from './icon';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

/**
 * Aviso "recebido do seu personal" (prancha Componentes-plano · 1.6): treino,
 * plano alimentar, avaliação pedida e check-in. Aparece no topo do Hoje e da
 * aba do assunto e some ao aceitar ou responder. Os textos vêm do api-client.
 */
export function PersonalNotice({
  notice,
  onAction,
  className,
}: {
  notice: PersonalNoticeInput;
  onAction: () => void;
  className?: string;
}) {
  const v = personalNoticeView(notice);
  const attention = v.tone === 'attention';
  return (
    <div
      role="status"
      className={cn(
        'anim-up flex items-center gap-3 rounded-field p-3',
        attention ? 'bg-[hsl(var(--warning)/0.12)]' : 'bg-card',
        className,
      )}
    >
      {'avatar' in v.lead ? (
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--water)/0.2)] text-[11px] font-bold text-foreground"
        >
          {initials(v.lead.avatar)}
        </span>
      ) : (
        <span
          aria-hidden
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-chip',
            attention ? 'bg-[hsl(var(--warning)/0.2)] text-warning' : 'bg-muted text-foreground',
          )}
        >
          <Icon name={v.lead.icon} size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{v.title}</p>
        <p className="text-[13px] text-muted-foreground">{v.detail}</p>
      </div>
      <Button
        size="xs"
        variant={v.action === 'Ver' ? 'default' : 'secondary'}
        onClick={onAction}
        aria-label={`${v.action}: ${v.title}`}
      >
        {v.action}
      </Button>
    </div>
  );
}
