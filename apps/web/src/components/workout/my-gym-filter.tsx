'use client';

import { useQuery } from '@tanstack/react-query';
import { groupsApi } from '@fatia/api-client';
import { communityKeys } from '@/components/community/query-keys';

/** A pessoa está em alguma comunidade? Só então o filtro da academia faz sentido. */
export function useInCommunity(enabled = true): boolean {
  const mine = useQuery({
    queryKey: communityKeys.mine,
    queryFn: () => groupsApi.mine(),
    enabled,
    staleTime: 60_000,
  });
  return Boolean(mine.data?.some((g) => g.status === 'ACTIVE'));
}

/**
 * "Na minha academia" (Fase 7b): só os exercícios da comunidade e o que dá
 * para fazer com o equipamento que ela marcou.
 */
export function MyGymToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-subtle px-3 py-1.5 text-xs font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring">
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      Na minha academia
    </label>
  );
}

/** Marca, na lista, o exercício que a comunidade da pessoa criou ou gravou. */
export function CommunityBadge({ name }: { name: string }) {
  return (
    <span className="shrink-0 rounded bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
      {name}
    </span>
  );
}
