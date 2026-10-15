import Link from 'next/link';
import { Crown, Plug } from 'lucide-react';
import { PRO_BENEFITS, planHref } from '@fatia/api-client';
import { Button } from '@/components/ui/button';

/**
 * O chat para quem está no Free (ADR 024): o que o PRO acrescenta e os dois
 * caminhos — assinar, ou usar a própria IA pelo MCP, que é livre.
 *
 * Fica no lugar da conversa, e não de um 402 depois de digitar: uma caixa de
 * texto que sempre recusa é pior que uma explicação.
 */
export function UpsellIA() {
  return (
    <section
      aria-labelledby="upsell-ia"
      className="mx-5 my-auto space-y-4 rounded-2xl border border-subtle bg-card p-5"
    >
      <div className="space-y-1">
        <h2 id="upsell-ia" className="text-xl font-extrabold">
          O chat com a IA faz parte do PRO
        </h2>
        <p className="text-sm text-muted-foreground">
          Seu registro manual continua completo no Free. Com o PRO, a IA do Fatia registra e
          consulta por você.
        </p>
      </div>
      <ul className="space-y-2">
        {PRO_BENEFITS.map((b) => (
          <li key={b.key} className="text-sm">
            <span className="font-semibold">{b.title}</span>
            <span className="text-muted-foreground"> — {b.text}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href={planHref('chat')}>
            <Crown size={16} aria-hidden />
            Assinar PRO
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/profile/connect">
            <Plug size={16} aria-hidden />
            Use sua própria IA pelo MCP
          </Link>
        </Button>
      </div>
    </section>
  );
}
