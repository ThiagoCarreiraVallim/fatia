'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  achievementDetail,
  achievementIcon,
  achievementTally,
  isAchievementUnlocked,
  progressApi,
} from '@fatia/api-client';
import type { IconName } from '@fatia/design';
import { ErrorState } from '@/components/ui/error-state';
import { Icon } from '@/components/ui/icon';
import { Ring } from '@/components/ui/ring';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Conquistas (prancha Al-G11, #382): o catálogo fechado de 10, desbloqueadas em verde e
 * bloqueadas com cadeado. Tocar mostra quando desbloqueou ou o que falta.
 */
export function AchievementsScreen() {
  const query = useQuery({
    queryKey: ['achievements', 'list'],
    // O GET só lê; a reavaliação (POST, idempotente) grava o que já vale, como no Hoje.
    queryFn: async () => {
      await progressApi.refreshAchievements();
      return progressApi.listAchievements();
    },
  });
  const list = query.data ?? [];
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected =
    list.find((a) => a.key === selectedKey) ?? list.find(isAchievementUnlocked) ?? list[0];
  const tally = achievementTally(list);

  return (
    <div className="flex flex-col gap-3 px-4 pb-8 pt-2">
      {query.isError && (
        <ErrorState
          message="Não deu para carregar as conquistas."
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isLoading && <Skeleton className="h-[420px] rounded-card" />}

      {query.data && (
        <>
          <section className="flex items-center justify-between gap-3">
            <span className="sr-only">
              {tally.got} de {tally.total} desbloqueadas
            </span>
            <div className="flex flex-col gap-1" aria-hidden>
              <span className="font-display text-[40px] font-bold leading-none tracking-tight tabular-nums">
                {tally.got}
                <span className="ml-1 text-[17px] font-semibold tracking-normal text-muted-foreground">
                  de {tally.total}
                </span>
              </span>
              <span className="text-[13px] text-muted-foreground">desbloqueadas</span>
            </div>
            <Ring value={tally.got} max={tally.total} size={64} stroke={7} label="conquistas">
              <span />
            </Ring>
          </section>

          <ul className="grid grid-cols-3 gap-2">
            {list.map((a) => {
              const unlocked = isAchievementUnlocked(a);
              const on = selected?.key === a.key;
              return (
                <li key={a.key}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={`${a.title}, ${unlocked ? 'desbloqueada' : 'bloqueada'}`}
                    onClick={() => setSelectedKey(a.key)}
                    className={cn(
                      'flex h-full w-full flex-col items-center gap-2 rounded-card bg-card px-2 py-3.5 text-center',
                      on && 'shadow-[inset_0_0_0_1.5px_hsl(var(--primary))]',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-full',
                        unlocked
                          ? 'bg-primary-soft text-primary-text'
                          : 'bg-surface-3 text-muted-foreground opacity-50',
                      )}
                    >
                      <Icon
                        name={unlocked ? (achievementIcon(a.key) as IconName) : 'lock'}
                        size={22}
                      />
                    </span>
                    <span
                      className={cn(
                        'text-[12px] font-semibold leading-tight',
                        !unlocked && 'text-muted-foreground',
                      )}
                    >
                      {a.title}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          {selected && (
            <section
              aria-live="polite"
              className="flex items-center gap-3 rounded-card bg-card p-4 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.35)]"
            >
              <span
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full',
                  isAchievementUnlocked(selected)
                    ? 'bg-primary-soft text-primary-text'
                    : 'bg-surface-3 text-muted-foreground',
                )}
              >
                <Icon
                  name={
                    isAchievementUnlocked(selected)
                      ? (achievementIcon(selected.key) as IconName)
                      : 'lock'
                  }
                  size={20}
                />
              </span>
              <div className="flex min-w-0 flex-col">
                <span className="font-bold">{selected.title}</span>
                <span className="text-[13px] text-muted-foreground">
                  {achievementDetail(selected).text}
                </span>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
