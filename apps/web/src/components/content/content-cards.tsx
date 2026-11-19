import Link from 'next/link';
import { Dumbbell, Salad } from 'lucide-react';
import { planTemplateSummary, type PlanTemplate } from '@fatia/api-client';
import { RowChevron, StatusBadge } from './content-ui';

/**
 * Cartão de plano pronto: capa (ou ícone do tipo), título, o resumo e a seta
 * de quem abre outra tela.
 */
export function TemplateCard({
  template,
  href,
  showStatus = false,
}: {
  template: PlanTemplate;
  href: string;
  showStatus?: boolean;
}) {
  const Icone = template.kind === 'WORKOUT' ? Dumbbell : Salad;
  return (
    <Link
      href={href}
      className="flex min-h-11 items-center gap-3 rounded-2xl border border-subtle bg-card p-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {template.cover?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
        <img
          src={template.cover.url}
          alt=""
          className="h-16 w-16 shrink-0 rounded-xl object-cover"
        />
      ) : (
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-muted">
          <Icone className="h-6 w-6 text-muted-foreground" aria-hidden />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="block truncate text-sm font-semibold">{template.title}</span>
        <span className="block text-xs text-muted-foreground">{planTemplateSummary(template)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          Por {template.authorName}
        </span>
        {/* Selo de contorno, embaixo: a pílula verde cheia ao lado do título
            tinha a cara do botão primário e atraía o clique. */}
        {showStatus && <StatusBadge published={Boolean(template.publishedAt)} />}
      </span>
      <RowChevron />
    </Link>
  );
}
