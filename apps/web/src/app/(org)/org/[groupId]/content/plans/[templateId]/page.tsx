'use client';

import { useParams, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { contentApi, groupCan, type TemplateKind } from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { NutritionTemplateEditor } from '@/components/org/nutrition-editor/nutrition-template-editor';
import { WorkoutTemplateEditor } from '@/components/org/plan-editor/workout-template-editor';
import { useOrgGroup } from '@/components/org/org-shell';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/** Abre o editor de um plano existente, ou o de um novo (`/new?kind=`). */
export default function OrgPlanTemplatePage() {
  const g = useOrgGroup();
  const { templateId } = useParams<{ templateId: string }>();
  const search = useSearchParams();
  const isNew = templateId === 'new';
  const kind: TemplateKind = search.get('kind') === 'NUTRITION' ? 'NUTRITION' : 'WORKOUT';
  const canSend = groupCan(g, 'member.plans');

  const current = useQuery({
    queryKey: orgKeys.contentPlan(g.id, templateId),
    queryFn: () => contentApi.plan(g.id, templateId),
    enabled: !isNew,
  });

  if (isNew) {
    return kind === 'WORKOUT' ? (
      <WorkoutTemplateEditor key="new" groupId={g.id} template={null} />
    ) : (
      <NutritionTemplateEditor key="new" groupId={g.id} template={null} />
    );
  }
  if (current.isPending) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
  if (!current.data) {
    return (
      <EmptyState
        title="Plano não encontrado"
        description="Ele foi apagado, ou o endereço está errado."
      />
    );
  }
  // Treino no editor de sessões (#406); alimentação no de refeições (#407).
  if (current.data.kind === 'WORKOUT') {
    return <WorkoutTemplateEditor key={current.data.id} groupId={g.id} template={current.data} />;
  }
  return (
    <NutritionTemplateEditor
      key={current.data.id}
      groupId={g.id}
      template={current.data}
      canSend={canSend}
    />
  );
}
