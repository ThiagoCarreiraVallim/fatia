'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Lightbulb, Pin, Plus, Salad } from 'lucide-react';
import {
  contentApi,
  contentStatusLabel,
  markdownLitePlainText,
  TIP_CATEGORY_LABEL,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { TemplateCard } from '@/components/content/content-cards';
import { useOrgGroup } from '@/components/org/org-shell';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * Planos prontos e dicas da comunidade, pela equipe (Fase 7a). Rascunho fica
 * aqui até alguém publicar; o membro só vê o que está publicado.
 */
export default function OrgContentPage() {
  const g = useOrgGroup();
  const planos = useQuery({
    queryKey: orgKeys.contentPlans(g.id),
    queryFn: () => contentApi.plans(g.id),
  });
  const dicas = useQuery({
    queryKey: orgKeys.contentTips(g.id),
    queryFn: () => contentApi.tips(g.id),
  });
  const base = `/org/${g.id}/content`;

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        O que a equipe publica aqui aparece para os membros em {g.name}. Quem adota um plano recebe
        uma cópia: mudar o original depois não mexe na cópia de ninguém.
      </p>
      <Tabs defaultValue="plans">
        <TabsList>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="tips">Dicas</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-3 pt-2">
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${base}/plans/new?kind=WORKOUT`}
              className={buttonVariants({ size: 'sm' })}
            >
              <Dumbbell className="h-4 w-4" aria-hidden />
              Plano de treino
            </Link>
            <Link
              href={`${base}/plans/new?kind=NUTRITION`}
              className={buttonVariants({ size: 'sm', variant: 'outline' })}
            >
              <Salad className="h-4 w-4" aria-hidden />
              Plano de nutrição
            </Link>
          </div>
          {planos.isPending ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : planos.data?.length ? (
            <ul className="space-y-2" aria-label="Planos da comunidade">
              {planos.data.map((t) => (
                <li key={t.id}>
                  <TemplateCard template={t} href={`${base}/plans/${t.id}`} showStatus />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Dumbbell}
              title="Nenhum plano ainda"
              description="Publique um treino seu ou metas e refeições para os membros adotarem."
            />
          )}
        </TabsContent>

        <TabsContent value="tips" className="space-y-3 pt-2">
          <Link href={`${base}/tips/new`} className={buttonVariants({ size: 'sm' })}>
            <Plus className="h-4 w-4" aria-hidden />
            Nova dica
          </Link>
          {dicas.isPending ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : dicas.data?.length ? (
            <ul className="space-y-2" aria-label="Dicas da comunidade">
              {dicas.data.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`${base}/tips/${d.id}`}
                    className="block space-y-1 rounded-2xl border border-subtle bg-card p-3 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex items-start justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                        {d.pinned && (
                          <Pin className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Fixada" />
                        )}
                        <span className="truncate">{d.title}</span>
                      </span>
                      <Badge variant={d.publishedAt ? 'default' : 'secondary'} className="shrink-0">
                        {contentStatusLabel(d)}
                      </Badge>
                    </span>
                    <span className="line-clamp-2 block text-xs text-muted-foreground">
                      {TIP_CATEGORY_LABEL[d.category]} · {markdownLitePlainText(d.body)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="Nenhuma dica ainda"
              description="Dicas curtas de treino, alimentação ou hábitos, com imagem se quiser."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
