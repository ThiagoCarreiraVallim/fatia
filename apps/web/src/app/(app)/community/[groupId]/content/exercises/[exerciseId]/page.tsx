'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookOpen, Check, Plus } from 'lucide-react';
import {
  ApiError,
  authorWithRole,
  groupExerciseApi,
  workoutApi,
  type WorkoutPlan,
} from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';
import { guideLine } from '@/components/content/member-content';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { ExerciseDetailDrawer } from '@/components/workout/exercise-detail-drawer';
import { cn } from '@/lib/utils';

/**
 * O guia da academia (Cm-16, #396): o vídeo e as fotos que a equipe gravou na
 * academia, a dica de quem escreveu, o "Como fazer" do Fatia e o "Pôr num
 * treino", que escolhe um dos meus planos (em vez de abrir o seletor da prancha).
 */
export default function CommunityGuidePage() {
  const { groupId, exerciseId } = useParams<{ groupId: string; exerciseId: string }>();
  const id = Number(exerciseId);
  // Foto escolhida na fileira; `null` = nenhuma (com vídeo, o vídeo fica em cima sozinho).
  const [foto, setFoto] = useState<number | null>(null);
  const [howTo, setHowTo] = useState(false);
  const [picking, setPicking] = useState(false);
  const guide = useQuery({
    queryKey: [...communityKeys.exercises(groupId), id],
    queryFn: () => groupExerciseApi.memberGuide(groupId, id),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ['workout', 'exercise', id],
    queryFn: () => workoutApi.getExercise(id),
    enabled: howTo,
  });
  useTopBarTitle(guide.data?.name ?? 'Guia da academia');

  if (guide.isPending) return <Skeleton className="m-4 h-64 rounded-2xl bg-card" />;
  if (!guide.data) {
    return (
      <div className="p-4">
        <EmptyState
          title="Guia indisponível"
          description="A equipe tirou este guia do ar, ou ele não é desta comunidade."
        />
      </div>
    );
  }
  const g = guide.data;
  const fotos = g.photos;
  const temVideo = Boolean(g.video?.url);
  // Sem vídeo, a primeira foto já ocupa o topo; com vídeo, a foto tocada abre embaixo dele.
  const escolhida = foto ?? (temVideo ? null : 0);
  const destaque = escolhida === null ? undefined : fotos[escolhida];
  // Com vídeo, até uma foto só precisa da miniatura para ser vista.
  const mostraFileira = temVideo ? fotos.length > 0 : fotos.length > 1;

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      {g.video?.url ? (
        <video
          src={g.video.url}
          controls
          playsInline
          preload="metadata"
          aria-label={`Vídeo: ${g.name}`}
          className="aspect-video w-full rounded-3xl bg-black object-contain"
        />
      ) : destaque ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
        <img
          src={destaque.url ?? undefined}
          alt={`Foto de ${g.name}`}
          className="aspect-video w-full rounded-3xl object-cover"
        />
      ) : null}
      {mostraFileira && (
        <div className="flex gap-2">
          {fotos.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-label={`Foto ${i + 1} de ${fotos.length}`}
              aria-pressed={i === escolhida}
              onClick={() => setFoto(i)}
              className={cn(
                'h-16 w-16 overflow-hidden rounded-xl ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                i === escolhida && 'ring-2 ring-primary',
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta */}
              <img src={f.url ?? undefined} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {temVideo && destaque && escolhida !== null && (
        // eslint-disable-next-line @next/next/no-img-element -- URL assinada e curta
        <img
          src={destaque.url ?? undefined}
          alt={`Foto ${escolhida + 1} de ${g.name}`}
          className="w-full rounded-2xl object-cover"
        />
      )}
      <div>
        <h1 className="font-display text-2xl font-semibold">{g.name}</h1>
        <p className="text-sm text-muted-foreground">{guideLine(g)}</p>
      </div>
      {g.tips && (
        <section className="space-y-1 rounded-2xl bg-card p-4">
          <h2 className="text-xs font-bold uppercase tracking-wide text-primary">
            Dica de {g.authorName}
          </h2>
          <p className="whitespace-pre-line text-sm leading-relaxed">{g.tips}</p>
          <p className="text-xs text-muted-foreground">
            {authorWithRole(g.authorName, g.authorRole)}
          </p>
        </section>
      )}
      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={() => setHowTo(true)}>
          <BookOpen aria-hidden />
          Como fazer
        </Button>
        <Button onClick={() => setPicking(true)}>
          <Plus aria-hidden />
          Pôr num treino
        </Button>
      </div>
      <ExerciseDetailDrawer
        exercise={howTo ? (detail.data ?? null) : null}
        open={howTo && !!detail.data}
        onOpenChange={setHowTo}
      />
      <PlanPicker
        open={picking}
        onClose={() => setPicking(false)}
        exerciseId={id}
        exerciseName={g.name}
      />
    </div>
  );
}

/** Escolhe um dos meus planos para receber o exercício; o que já tem avisa. */
function PlanPicker({
  open,
  onClose,
  exerciseId,
  exerciseName,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: number;
  exerciseName: string;
}) {
  const qc = useQueryClient();
  const plans = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
    enabled: open,
  });
  const add = useMutation({
    mutationFn: (plan: WorkoutPlan) => workoutApi.addPlanExercise(plan.id, { exerciseId }),
    onSuccess: (_r, plan) => {
      void qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      toast(`${exerciseName} entrou em ${plan.name}.`);
      onClose();
    },
    onError: (e) =>
      toast(e instanceof ApiError ? e.message : 'Não deu para pôr no treino. Tente de novo.'),
  });

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Pôr num treino</DrawerTitle>
          <DrawerDescription>Escolha o plano que vai receber {exerciseName}.</DrawerDescription>
        </DrawerHeader>
        <div className="space-y-2 px-4 pb-6">
          {plans.isPending ? (
            <Skeleton className="h-14 rounded-2xl bg-card" />
          ) : plans.isError ? (
            <p className="text-sm text-muted-foreground">Não deu para carregar seus planos.</p>
          ) : plans.data.length ? (
            plans.data.map((p) => {
              const jaTem = p.exercises.some((e) => e.exerciseId === exerciseId);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={jaTem || add.isPending}
                  onClick={() => add.mutate(p)}
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-2xl bg-card p-3 text-left text-sm font-semibold transition-colors hover:bg-surface-3 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="truncate">{p.name}</span>
                  {jaTem && (
                    <span className="flex shrink-0 items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Check className="h-3.5 w-3.5" aria-hidden />
                      já tem
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <p className="text-sm text-muted-foreground">
              Você ainda não tem planos de treino. Crie um em Treino.
            </p>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
