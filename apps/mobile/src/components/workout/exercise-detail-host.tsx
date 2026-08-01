import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workoutApi } from '@fatia/api-client';
import { ExerciseDetailDrawer } from './exercise-detail-drawer';

/**
 * Hospeda o drawer de detalhe do exercício na raiz da tela.
 *
 * No PWA o `<Drawer>` fica dentro do card e o `vaul` o teletransporta para o
 * `<body>`. O bottom sheet nativo não tem portal: ele se posiciona com
 * `absoluteFill` **dentro do pai**. Montado dentro de um card de 150px de
 * altura, o sheet abriria com 150px de altura — em cima do card, não da tela.
 *
 * Por isso o drawer sobe para fora do `<Screen>` e o card só pede a abertura.
 * Toda tela que renderiza `ExerciseDetailCard` precisa envolver o conteúdo com
 * este provider; sem ele o toque no exercício não abre nada.
 */

type OpenExerciseDetail = (exerciseId: number) => void;

const ExerciseDetailContext = createContext<OpenExerciseDetail | null>(null);

export function useOpenExerciseDetail(): OpenExerciseDetail {
  const open = useContext(ExerciseDetailContext);
  return useMemo(
    () =>
      open ??
      (() => {
        if (__DEV__) {
          console.warn(
            'ExerciseDetailCard fora de <ExerciseDetailHost>: o detalhe do exercício não abre.',
          );
        }
      }),
    [open],
  );
}

export function ExerciseDetailHost({ children }: { children: ReactNode }) {
  const [exerciseId, setExerciseId] = useState<number | null>(null);

  // O item da lista pode ser um stub (sem músculos, instruções, vídeo), então o
  // exercício completo só é buscado quando alguém abre o detalhe.
  const detail = useQuery({
    queryKey: ['workout', 'exercise', exerciseId],
    queryFn: () => workoutApi.getExercise(exerciseId as number),
    enabled: exerciseId != null,
  });

  const open = useCallback((id: number) => setExerciseId(id), []);

  return (
    <ExerciseDetailContext.Provider value={open}>
      {children}
      <ExerciseDetailDrawer
        exercise={detail.data ?? null}
        open={exerciseId != null && Boolean(detail.data)}
        onOpenChange={(o) => {
          if (!o) setExerciseId(null);
        }}
      />
    </ExerciseDetailContext.Provider>
  );
}
