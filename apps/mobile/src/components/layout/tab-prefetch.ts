import type { QueryClient } from '@tanstack/react-query';
import {
  billingApi,
  goalsApi,
  groupsApi,
  nutritionApi,
  planOffersApi,
  progressApi,
  remindersApi,
  usersApi,
  workoutApi,
} from '@fatia/api-client';
import { hojeIso } from '@/components/nutrition/helpers';
import { REMINDERS_KEY } from '@/components/reminders/keys';

/**
 * As leituras de abertura de cada aba (item 6), com as **mesmas chaves** das
 * telas: buscadas logo depois do login, a primeira visita a uma aba já abre com
 * dado no cache, e o skeleton quase não aparece. Quem mudar a chave de uma tela
 * de aba muda aqui também.
 */
interface TabQuery {
  queryKey: readonly unknown[];
  queryFn: () => Promise<unknown>;
  retry?: boolean;
}

export function tabQueries(): TabQuery[] {
  return [
    // Hoje
    { queryKey: ['dashboard', 'today'], queryFn: () => progressApi.today() },
    { queryKey: ['goals', 'active'], queryFn: () => goalsApi.list({ status: 'active' }) },
    // Nutrição
    {
      queryKey: ['nutrition', 'summary', hojeIso()],
      queryFn: () => nutritionApi.summary(hojeIso()),
    },
    // Treino
    {
      queryKey: ['workout', 'muscles', 'week'],
      queryFn: () => workoutApi.getWeeklyMuscleSummary(),
    },
    { queryKey: ['workout', 'plans'], queryFn: () => workoutApi.listPlans() },
    { queryKey: ['workout', 'block'], queryFn: () => workoutApi.getActiveBlock(), retry: false },
    { queryKey: ['plan-offers'], queryFn: () => planOffersApi.list() },
    // Comunidade
    { queryKey: ['community', 'mine'], queryFn: () => groupsApi.mine() },
    // Você
    { queryKey: ['billing', 'plan'], queryFn: () => billingApi.plan() },
    { queryKey: REMINDERS_KEY, queryFn: () => remindersApi.list() },
    { queryKey: ['users', 'me'], queryFn: () => usersApi.me() },
  ];
}

/** Busca o que ainda não está no cache (ou passou do `staleTime`). Erro não importa aqui. */
export function prefetchTabs(qc: QueryClient): void {
  for (const q of tabQueries()) {
    void qc.prefetchQuery({ ...q, queryKey: [...q.queryKey] });
  }
}
