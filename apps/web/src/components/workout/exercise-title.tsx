'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookOpen } from 'lucide-react';
import { workoutApi } from '@fatia/api-client';
import { ExerciseDetailDrawer } from './exercise-detail-drawer';

/**
 * Nome do exercício em foco e, logo abaixo, o botão "Como fazer" — o
 * `exercise-title.tsx` do app.
 *
 * O card em foco não tinha caminho nenhum para o detalhe (músculos, instruções,
 * vídeo): só os cards da lista, pelo play da miniatura. É justamente no meio do
 * treino, diante de um aparelho que a pessoa não conhece, que ele é útil, e um
 * botão com rótulo diz o que faz sem precisar adivinhar.
 */
export function ExerciseTitle({
  kicker,
  kickerClassName = 'text-primary',
  exerciseId,
  exerciseName,
}: {
  /** O rótulo pequeno de cima: "EM ANDAMENTO", "CARDIO". */
  kicker: string;
  kickerClassName?: string;
  exerciseId: number;
  exerciseName: string;
}) {
  const [open, setOpen] = useState(false);
  // O grupo da sessão só traz id e nome; o exercício completo é buscado ao abrir,
  // com a mesma chave do `ExerciseDetailCard` — quem já abriu por lá, abre daqui
  // sem esperar.
  const detail = useQuery({
    queryKey: ['workout', 'exercise', exerciseId],
    queryFn: () => workoutApi.getExercise(exerciseId),
    enabled: open,
  });

  return (
    <div className="flex flex-col items-center text-center">
      <p className={`text-[10px] font-extrabold tracking-wide ${kickerClassName}`}>{kicker}</p>
      <h2 className="mt-1 text-lg font-extrabold text-foreground">{exerciseName}</h2>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Como fazer ${exerciseName}`}
        className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/60 bg-primary/10 px-4 text-sm font-bold text-primary hover:bg-primary/15"
      >
        <BookOpen size={16} aria-hidden />
        {detail.isFetching && !detail.data ? 'Carregando...' : 'Como fazer'}
      </button>
      <ExerciseDetailDrawer
        exercise={detail.data ?? null}
        open={open && !!detail.data}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      />
    </div>
  );
}
