'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IconName } from '@fatia/design';
import {
  notificationGroups,
  notificationPreview,
  notificationsApi,
  type NotificationKind,
  type NotificationSettings,
} from '@fatia/api-client';
import { NOTIFICATION_SETTINGS_KEY } from '@/components/reminders/keys';
import { ChipIcon } from '@/components/today/parts';
import { ToggleTrack } from '@/components/you/you-list';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Notificações (prancha Al-V4, #389): "Da sua equipe" (só com equipe, com o
 * nome dela), "Comunidade" e "Opcional", cada tipo com o seu liga-desliga; a
 * prévia de como o aviso chega agrupado; e a promessa de que nenhum aviso
 * mostra dado de saúde nem o texto de um post.
 */
export function NotificationsScreen() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: NOTIFICATION_SETTINGS_KEY,
    queryFn: () => notificationsApi.settings(),
  });

  const save = useMutation({
    mutationFn: ({ kind, on }: { kind: NotificationKind; on: boolean }) =>
      notificationsApi.setPreferences({ [kind]: on }),
    onMutate: async ({ kind, on }) => {
      await qc.cancelQueries({ queryKey: NOTIFICATION_SETTINGS_KEY });
      const before = qc.getQueryData<NotificationSettings>(NOTIFICATION_SETTINGS_KEY);
      if (before) {
        qc.setQueryData<NotificationSettings>(NOTIFICATION_SETTINGS_KEY, {
          ...before,
          preferences: { ...before.preferences, [kind]: on },
        });
      }
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(NOTIFICATION_SETTINGS_KEY, ctx.before);
      toast('Não deu para salvar. Tente de novo.');
    },
  });

  if (settings.isPending) {
    return (
      <div className="px-6 pt-4">
        <Skeleton className="h-96 rounded-card bg-card" />
      </div>
    );
  }
  if (settings.isError) {
    return (
      <p role="alert" className="px-6 pt-4 text-sm text-muted-foreground">
        Não deu para carregar.{' '}
        <button type="button" className="underline" onClick={() => settings.refetch()}>
          Tentar de novo
        </button>
      </p>
    );
  }

  const { preferences, team, community } = settings.data;

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
      {notificationGroups({ team }).map((group) => (
        <section key={group.title} aria-label={group.title} className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-bold uppercase tracking-[0.06em] text-faint">
              {group.title}
            </h2>
            {group.detail && <span className="text-xs text-faint">{group.detail}</span>}
          </div>
          <ul className="divide-y divide-subtle overflow-hidden rounded-card bg-card">
            {group.items.map((item) => {
              const on = preferences[item.kind];
              return (
                <li key={item.kind}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => save.mutate({ kind: item.kind, on: !on })}
                    className="flex min-h-16 w-full items-center gap-3.5 px-4 py-3 text-left transition-colors hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <ChipIcon icon={item.icon as IconName} tone={item.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold text-foreground">
                        {item.label}
                      </span>
                      <span className="block text-[13px] text-muted-foreground">{item.hint}</span>
                    </span>
                    <ToggleTrack on={on} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <div className="flex flex-col gap-2 rounded-card bg-muted px-[18px] py-4">
        <span className="text-xs font-bold uppercase tracking-[0.06em] text-faint">
          Avisos chegam agrupados
        </span>
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- ícone do app, estático */}
          <img src="/icons/icon-192.png" alt="" className="h-7 w-7 rounded-[8px]" />
          <div className="min-w-0 flex-1">
            <b className="text-[13px]">Fatia</b>
            <p aria-live="polite" className="text-[13px] text-muted-foreground">
              {notificationPreview(preferences, { team, community })}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-faint">Nenhum aviso mostra dado de saúde ou o texto de um post.</p>
    </div>
  );
}
