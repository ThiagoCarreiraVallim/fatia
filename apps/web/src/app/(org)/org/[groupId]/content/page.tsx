'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Dumbbell, Lightbulb, Pin, Salad } from 'lucide-react';
import { contentApi, markdownLitePlainText, TIP_CATEGORY_LABEL } from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { TemplateCard } from '@/components/content/content-cards';
import {
  DrawerOption,
  ListError,
  NewButton,
  RowChevron,
  SectionHeader,
  StatusBadge,
} from '@/components/content/content-ui';
import { useOrgGroup } from '@/components/org/org-shell';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type Tab = 'plans' | 'tips';

/**
 * Planos prontos e dicas da comunidade, pela equipe (Fase 7a). Rascunho fica
 * aqui até alguém publicar; o membro só vê o que está publicado.
 *
 * Criar mora no cabeçalho de cada lista ("Novo plano", "Nova dica"), e não
 * mais em botões soltos acima dela: "Plano de treino" cheio ao lado de "Plano
 * de nutrição" de contorno não dizia que criava nada e parecia um seletor com o
 * treino já escolhido. O tipo do plano agora se escolhe no drawer.
 */
export default function OrgContentPage() {
  const g = useOrgGroup();
  const router = useRouter();
  // `?tab=tips` volta para a aba certa depois de apagar uma dica.
  const requested = useSearchParams().get('tab');
  const [tab, setTab] = useState<Tab>(requested === 'tips' ? 'tips' : 'plans');
  const [newPlanOpen, setNewPlanOpen] = useState(false);
  const plans = useQuery({
    queryKey: orgKeys.contentPlans(g.id),
    queryFn: () => contentApi.plans(g.id),
  });
  const tips = useQuery({
    queryKey: orgKeys.contentTips(g.id),
    queryFn: () => contentApi.tips(g.id),
  });
  const base = `/org/${g.id}/content`;
  const newPlan = () => setNewPlanOpen(true);
  const newTipHref = `${base}/tips/new`;

  return (
    <div className="max-w-3xl space-y-4">
      <p className="text-sm text-muted-foreground">
        O que a equipe publica aqui aparece para os membros em {g.name}. Quem adota um plano recebe
        uma cópia: mudar o original depois não mexe na cópia de ninguém.
      </p>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="plans">Planos</TabsTrigger>
          <TabsTrigger value="tips">Dicas</TabsTrigger>
        </TabsList>

        <TabsContent value="plans" className="space-y-3 pt-2">
          <SectionHeader
            title="Planos"
            count={plans.data?.length}
            action={<NewButton label="Novo plano" onClick={newPlan} />}
          />
          {plans.isPending ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : plans.isError ? (
            <ListError
              title="Não deu para carregar os planos"
              onRetry={() => void plans.refetch()}
            />
          ) : plans.data.length ? (
            <ul className="space-y-2" aria-label="Planos da comunidade">
              {plans.data.map((t) => (
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
              action={<NewButton label="Novo plano" onClick={newPlan} />}
            />
          )}
        </TabsContent>

        <TabsContent value="tips" className="space-y-3 pt-2">
          <SectionHeader
            title="Dicas"
            count={tips.data?.length}
            action={<NewButton label="Nova dica" href={newTipHref} />}
          />
          {tips.isPending ? (
            <Skeleton className="h-24 rounded-2xl" />
          ) : tips.isError ? (
            <ListError title="Não deu para carregar as dicas" onRetry={() => void tips.refetch()} />
          ) : tips.data.length ? (
            <ul className="space-y-2" aria-label="Dicas da comunidade">
              {tips.data.map((d) => (
                <li key={d.id}>
                  <Link
                    href={`${base}/tips/${d.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-subtle bg-card p-3 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-semibold">{d.title}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">
                        {TIP_CATEGORY_LABEL[d.category]} · {markdownLitePlainText(d.body)}
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge published={Boolean(d.publishedAt)} feminine />
                        {/* O alfinete sozinho não dizia nada; com a palavra, diz. */}
                        {d.pinned && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                            <Pin className="h-3 w-3" aria-hidden />
                            Fixada
                          </span>
                        )}
                      </span>
                    </span>
                    <RowChevron />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Lightbulb}
              title="Nenhuma dica ainda"
              description="Dicas curtas de treino, alimentação ou hábitos, com imagem se quiser."
              action={<NewButton label="Nova dica" href={newTipHref} />}
            />
          )}
        </TabsContent>
      </Tabs>

      <Drawer open={newPlanOpen} onOpenChange={setNewPlanOpen}>
        <DrawerContent className="px-4 pb-6">
          <DrawerHeader className="px-0">
            <DrawerTitle>Novo plano</DrawerTitle>
            <DrawerDescription>
              Começa como rascunho; só os membros veem depois de publicar.
            </DrawerDescription>
          </DrawerHeader>
          <div className="space-y-2 pt-4">
            <DrawerOption
              icon={Dumbbell}
              title="Plano de treino"
              description="A partir de um dos seus planos de treino."
              onClick={() => {
                setNewPlanOpen(false);
                router.push(`${base}/plans/new?kind=WORKOUT`);
              }}
            />
            <DrawerOption
              icon={Salad}
              title="Plano de nutrição"
              description="Metas de calorias e macros e refeições salvas."
              onClick={() => {
                setNewPlanOpen(false);
                router.push(`${base}/plans/new?kind=NUTRITION`);
              }}
            />
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}
