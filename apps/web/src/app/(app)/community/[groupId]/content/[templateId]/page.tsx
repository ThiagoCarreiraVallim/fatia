'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Check, Dumbbell, Salad } from 'lucide-react';
import {
  adoptResultMessage,
  ApiError,
  authorWithRole,
  groupContentApi,
  nutritionApi,
  nutritionDiff,
  planTemplateSummary,
  type AdoptInput,
  type PlanTemplate,
} from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';
import { CheckableRow } from '@/components/content/content-ui';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Um plano pronto da comunidade, antes de adotar (Cm-13/Cm-14, #396). Treino
 * vira plano seu num toque e a tela avisa que está em Meus planos, sem sair
 * daqui; nutrição pergunta o que entra, com as metas de agora ao lado das do
 * plano — e as de agora ficam no histórico se a pessoa trocar.
 */
export default function CommunityTemplatePage() {
  const { groupId, templateId } = useParams<{ groupId: string; templateId: string }>();
  const qc = useQueryClient();
  const [choosing, setChoosing] = useState(false);
  // O plano que acabou de virar seu (ou o que o 409 diz que você já tinha).
  const [adoptedNow, setAdoptedNow] = useState<string | null>(null);

  const template = useQuery({
    queryKey: communityKeys.plan(groupId, templateId),
    queryFn: () => groupContentApi.plan(groupId, templateId),
    retry: false,
  });
  useTopBarTitle(template.data?.title);

  const adopt = useMutation({
    mutationFn: (input: AdoptInput) => groupContentApi.adopt(groupId, templateId, input),
    onSuccess: (r) => {
      toast(adoptResultMessage(r));
      setChoosing(false);
      void qc.invalidateQueries({ queryKey: communityKeys.plans(groupId) });
      void qc.invalidateQueries({ queryKey: ['workout'] });
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      if (r.planId) setAdoptedNow(r.planId);
    },
    onError: (err) => {
      const planId =
        err instanceof ApiError && err.isConflict
          ? (err.body as { planId?: string } | undefined)?.planId
          : undefined;
      if (planId) {
        setAdoptedNow(planId);
        return;
      }
      toast(
        err instanceof ApiError && err.status < 500 && err.message
          ? err.message
          : 'Não deu para adotar agora.',
      );
    },
  });

  if (template.isPending) return <Skeleton className="m-4 h-64 rounded-2xl bg-card" />;
  if (!template.data) {
    return (
      <div className="p-4">
        <EmptyState
          title="Plano indisponível"
          description="A equipe tirou este plano do ar, ou o endereço está errado."
        />
      </div>
    );
  }
  const t = template.data;
  const KindIcon = t.kind === 'WORKOUT' ? Dumbbell : Salad;
  const meuPlano = adoptedNow ?? t.adoptedPlanId;

  return (
    <div className="space-y-4 p-4">
      {t.cover?.url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
        <img src={t.cover.url} alt="" className="aspect-video w-full rounded-2xl object-cover" />
      ) : null}
      <header className="space-y-1">
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <KindIcon size={14} aria-hidden />
          {planTemplateSummary(t)}
        </p>
        <h2 className="text-lg font-semibold">{t.title}</h2>
        <p className="text-xs text-muted-foreground">
          Por {authorWithRole(t.authorName, t.authorRole)}
        </p>
      </header>
      {t.description && <p className="whitespace-pre-line text-sm">{t.description}</p>}

      {/* A ação principal logo depois da descrição, como no app, e não presa
          ao pé da tela por cima de uma lista que podia passar de uma página. */}
      {adoptedNow ? (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl bg-primary/10 p-3 text-sm"
        >
          <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Em Meus planos</span>
            <span className="block text-xs text-muted-foreground">
              A cópia é sua: muda só quando você mudar.
            </span>
          </span>
          <Link
            href={`/workout/plans/${adoptedNow}`}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            Abrir
          </Link>
        </div>
      ) : meuPlano ? (
        <section aria-label="Plano adotado" className="space-y-2">
          <p className="text-sm">Você já adotou este plano.</p>
          <Link
            href={`/workout/plans/${meuPlano}`}
            className={buttonVariants({ className: 'w-full sm:w-auto' })}
          >
            Abrir meu plano
          </Link>
        </section>
      ) : (
        <div className="space-y-2">
          <Button
            className="w-full sm:w-auto"
            disabled={adopt.isPending}
            onClick={() => (t.kind === 'WORKOUT' ? adopt.mutate({}) : setChoosing(true))}
          >
            {adopt.isPending ? 'Adotando…' : 'Adotar plano'}
          </Button>
          <p className="text-xs text-muted-foreground">
            Uma cópia vai para a sua conta e é sua: muda só quando você mudar.
          </p>
        </div>
      )}

      {t.kind === 'WORKOUT' ? (
        <WorkoutPreview t={t} groupId={groupId} />
      ) : (
        <NutritionPreview t={t} />
      )}

      {t.kind === 'NUTRITION' && (
        <AdoptNutritionDialog
          t={t}
          open={choosing}
          onOpenChange={setChoosing}
          pending={adopt.isPending}
          onConfirm={(input) => adopt.mutate(input)}
        />
      )}
    </div>
  );
}

function WorkoutPreview({ t, groupId }: { t: PlanTemplate; groupId: string }) {
  return (
    <section aria-labelledby="exercicios" className="space-y-2">
      <h3 id="exercicios" className="text-sm font-semibold">
        Exercícios
      </h3>
      <ol className="divide-y rounded-2xl border border-subtle bg-card text-sm">
        {t.exercises.map((e, i) => (
          <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0 truncate">{`${i + 1}. ${e.name}`}</span>
            <span className="flex shrink-0 items-center gap-2">
              {e.hasGuide && e.exerciseId !== null && (
                <Link
                  href={`/community/${groupId}/content/exercises/${e.exerciseId}`}
                  aria-label={`Guia da academia: ${e.name}`}
                  className="flex min-h-8 items-center gap-1 rounded-full bg-primary/10 px-2.5 text-xs font-semibold text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BookOpen className="h-3.5 w-3.5" aria-hidden />
                  guia
                </Link>
              )}
              <span className="text-muted-foreground">{`${e.targetSets} × ${e.targetReps || '—'}`}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function NutritionPreview({ t }: { t: PlanTemplate }) {
  return (
    <>
      {t.goals && (
        <section aria-labelledby="metas" className="space-y-2">
          <h3 id="metas" className="text-sm font-semibold">
            Metas diárias
          </h3>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            {nutritionDiff(null, t.goals).map((l) => (
              <div key={l.label} className="rounded-xl border border-subtle bg-card p-3">
                <dt className="text-xs text-muted-foreground">{l.label}</dt>
                <dd className="font-medium">{l.next}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {t.meals.length > 0 && (
        <section aria-labelledby="refeicoes" className="space-y-2">
          <h3 id="refeicoes" className="text-sm font-semibold">
            Refeições sugeridas
          </h3>
          <ul className="space-y-2">
            {t.meals.map((m, i) => (
              <li key={i} className="rounded-2xl border border-subtle bg-card p-3 text-sm">
                <p className="flex justify-between gap-3 font-medium">
                  <span className="truncate">{m.name}</span>
                  <span className="shrink-0 text-muted-foreground">{m.kcal} kcal</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.items.map((it) => `${it.foodName} (${Math.round(it.grams)} g)`).join(', ')}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function AdoptNutritionDialog({
  t,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  t: PlanTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (input: AdoptInput) => void;
}) {
  const [metas, setMetas] = useState(false);
  const [refeicoes, setRefeicoes] = useState(t.meals.length > 0);
  const atuais = useQuery({
    queryKey: ['nutrition', 'goals'],
    queryFn: () => nutritionApi.goals(),
    enabled: open && t.goals !== null,
  });
  const diff = t.goals ? nutritionDiff(atuais.data, t.goals) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>O que entra na sua conta?</DialogTitle>
          <DialogDescription>Escolha o que copiar deste plano.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {t.meals.length > 0 && (
            <CheckableRow
              role="checkbox"
              label="Salvar as refeições sugeridas"
              checked={refeicoes}
              onChange={() => setRefeicoes(!refeicoes)}
            >
              <span className="block pl-7 text-xs text-muted-foreground">
                {`${t.meals.length} ${t.meals.length === 1 ? 'refeição' : 'refeições'} em Refeições salvas, para registrar num toque.`}
              </span>
            </CheckableRow>
          )}
          {t.goals && (
            <CheckableRow
              role="checkbox"
              label="Trocar minhas metas pelas do plano"
              checked={metas}
              onChange={() => setMetas(!metas)}
            >
              <span className="block pl-7">
                <table className="w-full text-xs">
                  <caption className="sr-only">Suas metas e as do plano</caption>
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th scope="col" className="font-normal" />
                      <th scope="col" className="font-normal">
                        Agora
                      </th>
                      <th scope="col" className="font-normal">
                        Plano
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff.map((l) => (
                      <tr key={l.label}>
                        <th scope="row" className="py-0.5 text-left font-normal">
                          {l.label}
                        </th>
                        <td className="py-0.5">{l.current}</td>
                        <td className={l.changed ? 'py-0.5 font-semibold' : 'py-0.5'}>{l.next}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Só há o que guardar se a pessoa já tinha metas. */}
                {metas && atuais.data && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Suas metas de agora ficam no histórico.
                  </span>
                )}
              </span>
            </CheckableRow>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={pending || (!metas && !refeicoes)}
            onClick={() => onConfirm({ applyGoals: metas, saveMeals: refeicoes })}
          >
            {pending ? 'Adotando…' : 'Adotar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
