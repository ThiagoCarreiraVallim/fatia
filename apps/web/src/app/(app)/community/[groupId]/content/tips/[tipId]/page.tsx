'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Droplet, Dumbbell, Pin } from 'lucide-react';
import {
  groupContentApi,
  initialsOf,
  tipByline,
  tipShortcut,
  TIP_CATEGORY_LABEL,
} from '@fatia/api-client';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { LogWaterDrawer } from '@/components/progress/log-water-drawer';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

const BROWSER_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * Uma dica da equipe (Cm-15, #396): imagem, se houver, fixada e categoria,
 * quem escreveu e quando, o texto e o atalho do que ela pede ("Registrar
 * água" abre o registro aqui mesmo; a dica de treino leva ao treino).
 */
export default function CommunityTipPage() {
  const { groupId, tipId } = useParams<{ groupId: string; tipId: string }>();
  const [water, setWater] = useState(false);
  const tip = useQuery({
    queryKey: ['community', 'tips', groupId, tipId],
    queryFn: () => groupContentApi.tip(groupId, tipId),
    retry: false,
  });
  useTopBarTitle('Dica');

  if (tip.isPending) return <Skeleton className="m-4 h-64 rounded-2xl bg-card" />;
  if (!tip.data) {
    return (
      <div className="p-4">
        <EmptyState
          title="Dica indisponível"
          description="A equipe tirou esta dica do ar, ou o endereço está errado."
        />
      </div>
    );
  }
  const d = tip.data;
  const atalho = tipShortcut(d);

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      {d.image?.url && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
        <img src={d.image.url} alt="" className="aspect-video w-full rounded-3xl object-cover" />
      )}
      <div className="flex flex-wrap gap-1.5">
        {d.pinned && (
          <Badge variant="done" className="gap-1">
            <Pin className="h-3.5 w-3.5" aria-hidden />
            fixada
          </Badge>
        )}
        <Badge variant="pending">{TIP_CATEGORY_LABEL[d.category].toLowerCase()}</Badge>
      </div>
      <h1 className="font-display text-2xl font-semibold">{d.title}</h1>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <span
          data-slot="author-avatar"
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[11px] font-bold text-foreground"
        >
          {initialsOf(d.authorName)}
        </span>
        {tipByline(d, BROWSER_TZ)}
      </p>
      <MarkdownLite source={d.body} className="space-y-2 text-sm leading-relaxed text-foreground" />
      {atalho === 'water' && (
        <Button variant="outline" className="mt-auto w-full" onClick={() => setWater(true)}>
          <Droplet aria-hidden />
          Registrar água
        </Button>
      )}
      {atalho === 'workout' && (
        <Link
          href="/workout"
          className={buttonVariants({ variant: 'outline', className: 'mt-auto w-full' })}
        >
          <Dumbbell aria-hidden />
          Ir para o treino
        </Link>
      )}
      <LogWaterDrawer open={water} onClose={() => setWater(false)} />
    </div>
  );
}
