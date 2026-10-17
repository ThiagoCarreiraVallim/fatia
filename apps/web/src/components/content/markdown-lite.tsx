import type { ReactNode } from 'react';
import { parseMarkdownLite, type InlineToken } from '@fatia/api-client';

function inline(tokens: InlineToken[], key = ''): ReactNode[] {
  return tokens.map((t, i) => {
    const k = `${key}${i}`;
    if (t.type === 'text') return t.text;
    if (t.type === 'bold') return <strong key={k}>{inline(t.children, `${k}-`)}</strong>;
    if (t.type === 'italic') return <em key={k}>{inline(t.children, `${k}-`)}</em>;
    return (
      <a
        key={k}
        href={t.href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="font-medium text-primary underline underline-offset-2"
      >
        {inline(t.children, `${k}-`)}
      </a>
    );
  });
}

/**
 * O markdown restrito das dicas (Fase 7a), desenhado com elementos do React.
 * Nada vira HTML cru: o parser devolve tokens, e texto é sempre texto.
 */
export function MarkdownLite({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className ?? 'space-y-2 text-sm leading-relaxed'}>
      {parseMarkdownLite(source).map((b, i) =>
        b.type === 'paragraph' ? (
          <p key={i}>{inline(b.children)}</p>
        ) : b.ordered ? (
          <ol key={i} className="list-decimal space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-1 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{inline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
