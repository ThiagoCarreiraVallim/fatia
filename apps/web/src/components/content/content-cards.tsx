import Link from 'next/link';
import { Dumbbell, Pin, Salad } from 'lucide-react';
import {
  contentStatusLabel,
  planTemplateSummary,
  TIP_CATEGORY_LABEL,
  type GroupTip,
  type PlanTemplate,
} from '@fatia/api-client';
import { Badge } from '@/components/ui/badge';
import { MarkdownLite } from './markdown-lite';

/** Cartão de plano pronto: capa (ou ícone do tipo), título e o resumo. */
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
      className="flex min-h-11 gap-3 rounded-2xl border border-subtle bg-card p-3 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold">{template.title}</span>
          {showStatus && (
            <Badge variant={template.publishedAt ? 'default' : 'secondary'} className="shrink-0">
              {contentStatusLabel(template)}
            </Badge>
          )}
        </span>
        <span className="block text-xs text-muted-foreground">{planTemplateSummary(template)}</span>
        <span className="block truncate text-xs text-muted-foreground">
          Por {template.authorName}
        </span>
      </span>
    </Link>
  );
}

/** Dica inteira, como o membro lê. */
export function TipCard({ tip }: { tip: GroupTip }) {
  return (
    <article className="space-y-3 rounded-2xl border border-subtle bg-card p-4">
      {tip.image?.url && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
        <img src={tip.image.url} alt="" className="aspect-video w-full rounded-xl object-cover" />
      )}
      <header className="space-y-1">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          {tip.pinned && (
            <span className="inline-flex items-center gap-1 font-semibold text-primary">
              <Pin className="h-3.5 w-3.5" aria-hidden />
              Fixada
            </span>
          )}
          <span>{TIP_CATEGORY_LABEL[tip.category]}</span>
          <span aria-hidden>·</span>
          <span>{tip.authorName}</span>
        </p>
        <h3 className="text-base font-semibold">{tip.title}</h3>
      </header>
      <MarkdownLite source={tip.body} />
    </article>
  );
}
