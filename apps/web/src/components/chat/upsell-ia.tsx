'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Camera, MessageCircle, Mic, Plug } from 'lucide-react';
import { planHref } from '@fatia/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const FEATURES = [
  {
    icon: MessageCircle,
    label: 'Conversa',
    title: 'Fale com a IA',
    text: 'Pergunte quanto falta de proteína ou peça uma troca.',
  },
  {
    icon: Camera,
    label: 'Foto do prato',
    title: 'Fotografe o prato',
    text: 'A IA monta a refeição e você só confere.',
  },
  { icon: Mic, label: 'Voz', title: 'Diga o que comeu', text: 'Fala e pronto, sem digitar.' },
];

/**
 * O chat para quem está no Free (prancha Al-M1, #386): um jeito de cada vez,
 * o lembrete de que o registro manual segue grátis e três caminhos — ver o
 * PRO (na web, a assinatura pelo Asaas), usar a própria IA pelo MCP, que é
 * livre, ou voltar.
 *
 * Fica no lugar da conversa, e não de um 402 depois de digitar: uma caixa de
 * texto que sempre recusa é pior que uma explicação.
 */
export function UpsellIA() {
  const [picked, setPicked] = useState(1);
  const f = FEATURES[picked]!;
  return (
    <section
      aria-labelledby="upsell-ia"
      className="mx-5 my-auto space-y-5 rounded-2xl border border-subtle bg-card p-5"
    >
      <div className="flex justify-center gap-3">
        {FEATURES.map((x, i) => (
          <button
            key={x.label}
            type="button"
            aria-label={x.label}
            aria-pressed={i === picked}
            onClick={() => setPicked(i)}
            className={cn(
              'flex h-14 w-14 items-center justify-center rounded-field transition-colors',
              i === picked ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
            )}
          >
            <x.icon size={24} aria-hidden />
          </button>
        ))}
      </div>
      <div className="space-y-1 text-center">
        <h2 id="upsell-ia" className="text-xl font-extrabold">
          {f.title}
        </h2>
        <p className="text-sm text-muted-foreground">{f.text}</p>
      </div>
      <div className="flex items-center justify-center gap-2">
        <Badge variant="free">Free</Badge>
        <span className="text-xs text-muted-foreground">Registro manual segue grátis</span>
      </div>
      <div className="flex flex-col gap-2">
        <Button asChild size="xl">
          <Link href={planHref('chat')}>Ver o PRO</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/profile/connect">
            <Plug size={16} aria-hidden />
            Usar minha IA pelo MCP
          </Link>
        </Button>
        <Button asChild variant="text">
          <Link href="/">Agora não</Link>
        </Button>
      </div>
    </section>
  );
}
