import { useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { startSessionBody, workoutApi } from '@fatia/api-client';
import { startSessionHandlers, type StartSessionVars } from './start-session-handlers';

/**
 * Começa uma sessão (com plano ou livre) e abre a tela dela. Já existindo uma
 * aberta, a API responde 409 com o id dela (#350/#377): em vez de erro, a
 * pessoa cai no treino que já estava em andamento — sem misturar nele os
 * exercícios escolhidos para o novo. O 409 do duplo toque, que aponta para a
 * sessão que o primeiro toque acabou de abrir, não abre a tela outra vez
 * (`startSessionHandlers`).
 *
 * `pending` são os exercícios escolhidos antes de começar (Treino livre e o
 * "Repetir" do histórico, #381): entram na sessão como escolhidos e ainda sem
 * série, no mesmo cache de `usePendingExercises`, e a ordem deles vai junto.
 *
 * `replace`: a tela que só existe para começar o treino (o Treino livre) sai
 * da pilha — voltar da sessão não reabre a escolha já usada.
 */
export function useStartSession({ replace = false }: { replace?: boolean } = {}) {
  const qc = useQueryClient();
  const router = useRouter();
  const handlers = useMemo(
    () =>
      startSessionHandlers(qc, (id) => {
        const href = `/workout/session/${id}` as Href;
        if (replace) router.replace(href);
        else router.push(href);
      }),
    [qc, router, replace],
  );
  return useMutation({
    mutationFn: ({ planId, pending }: StartSessionVars) =>
      workoutApi.startSession(startSessionBody(planId, pending)),
    onSuccess: handlers.onSuccess,
    onError: handlers.onError,
  });
}
