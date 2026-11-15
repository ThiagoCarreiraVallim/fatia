'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IconName } from '@fatia/design';
import {
  activeRemindersLabel,
  notificationsApi,
  remindersApi,
  reminderSummary,
  reminderVisual,
  type NotificationSettings,
  type Reminder,
} from '@fatia/api-client';
import { TopBarActions } from '@/components/layout/app-top-bar';
import { useWebPush } from '@/components/notifications/use-web-push';
import { ChipIcon, stagger } from '@/components/today/parts';
import { ToggleTrack } from '@/components/you/you-list';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Skeleton } from '@/components/ui/skeleton';
import { NOTIFICATION_SETTINGS_KEY, REMINDERS_KEY } from './keys';
import { ReminderSheet } from './reminder-sheet';

/**
 * Lembretes (prancha Al-V2, #389): a faixa "Notificações bloqueadas" quando o
 * navegador ainda não recebe avisos, a lista com o liga-desliga de cada um, o
 * silêncio noturno e a contagem dos ativos. Tocar num lembrete abre a edição
 * (Al-V3b); o "+" lima do topo abre o novo (Al-V3).
 */
export function RemindersScreen() {
  const qc = useQueryClient();
  const push = useWebPush();
  const [sheet, setSheet] = useState<{ open: boolean; reminder: Reminder | null }>({
    open: false,
    reminder: null,
  });

  const list = useQuery({ queryKey: REMINDERS_KEY, queryFn: () => remindersApi.list() });
  const settings = useQuery({
    queryKey: NOTIFICATION_SETTINGS_KEY,
    queryFn: () => notificationsApi.settings(),
  });

  const flip = useMutation({
    mutationFn: (r: Reminder) => remindersApi.update(r.id, { enabled: !r.enabled }),
    // Otimista: a chave anda no toque e volta se a API recusar.
    onMutate: async (r) => {
      await qc.cancelQueries({ queryKey: REMINDERS_KEY });
      const before = qc.getQueryData<Reminder[]>(REMINDERS_KEY);
      qc.setQueryData<Reminder[]>(REMINDERS_KEY, (old) =>
        old?.map((x) => (x.id === r.id ? { ...x, enabled: !r.enabled } : x)),
      );
      return { before };
    },
    onError: (_e, _r, ctx) => {
      if (ctx?.before) qc.setQueryData(REMINDERS_KEY, ctx.before);
      toast('Não deu para salvar. Tente de novo.');
    },
  });

  const night = useMutation({
    mutationFn: (enabled: boolean) => notificationsApi.setQuietHours({ enabled }),
    onMutate: async (enabled) => {
      await qc.cancelQueries({ queryKey: NOTIFICATION_SETTINGS_KEY });
      const before = qc.getQueryData<NotificationSettings>(NOTIFICATION_SETTINGS_KEY);
      if (before) {
        qc.setQueryData<NotificationSettings>(NOTIFICATION_SETTINGS_KEY, {
          ...before,
          quietHours: { ...before.quietHours, enabled },
        });
      }
      return { before };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(NOTIFICATION_SETTINGS_KEY, ctx.before);
      toast('Não deu para salvar. Tente de novo.');
    },
  });

  const allow = async () => {
    if (push.state === 'denied') {
      toast('O navegador está bloqueando. Libere os avisos nas configurações do site.');
      return;
    }
    try {
      const next = await push.enable();
      if (next === 'denied') toast('O navegador bloqueou. Libere nas configurações do site.');
    } catch {
      toast('Não deu para liberar agora. Tente de novo.');
    }
  };

  const quiet = settings.data?.quietHours;
  const reminders = list.data ?? [];

  return (
    <div className="flex flex-col gap-4 px-6 pb-8 pt-4">
      <TopBarActions>
        <button
          type="button"
          aria-label="Novo lembrete"
          onClick={() => setSheet({ open: true, reminder: null })}
          className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="plus" size={22} />
        </button>
      </TopBarActions>

      {push.available && push.state !== 'on' && (
        <div
          role="status"
          className="anim-fade flex items-center gap-3 rounded-field bg-[hsl(var(--warning)/0.12)] p-3"
        >
          <ChipIcon icon="bell" tone="amber" size={32} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Notificações bloqueadas</p>
            <p className="text-[13px] text-muted-foreground">Nada vai tocar até liberar</p>
          </div>
          <Button size="sm" disabled={push.busy} onClick={() => void allow()}>
            Liberar
          </Button>
        </div>
      )}

      {list.isPending && <Skeleton className="h-72 rounded-card bg-card" />}
      {list.isError && (
        <p role="alert" className="text-sm text-muted-foreground">
          Não deu para carregar.{' '}
          <button type="button" className="underline" onClick={() => list.refetch()}>
            Tentar de novo
          </button>
        </p>
      )}

      {reminders.length > 0 && (
        <ul className="divide-y divide-subtle overflow-hidden rounded-card bg-card">
          {reminders.map((r, i) => {
            const v = reminderVisual(r.kind);
            return (
              <li
                key={r.id}
                style={stagger(i)}
                className="anim-up flex min-h-16 items-center gap-2 py-2 pl-4 pr-2.5"
              >
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, reminder: r })}
                  className="flex min-w-0 flex-1 items-center gap-3.5 rounded-field text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChipIcon icon={v.icon as IconName} tone={v.tone} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-foreground">
                      {r.title}
                    </span>
                    <span className="flex items-center gap-1 text-[13px] text-muted-foreground">
                      {reminderSummary(r)}
                      <Icon name="edit" size={14} className="text-faint" />
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Ligar ou desligar ${r.title}`}
                  aria-pressed={r.enabled}
                  onClick={() => flip.mutate(r)}
                  className="shrink-0 p-2"
                >
                  <ToggleTrack on={r.enabled} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {list.data && reminders.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Nenhum lembrete ainda. Toque no + para criar o primeiro.
        </p>
      )}

      {quiet && (
        <button
          type="button"
          aria-pressed={quiet.enabled}
          onClick={() => night.mutate(!quiet.enabled)}
          className="flex items-center gap-3 rounded-card bg-card px-[18px] py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Icon name="moon" size={20} className="shrink-0 text-muted-foreground" />
          <span className="min-w-0 flex-1">
            <span className="block font-bold">Silêncio noturno</span>
            <span className="block text-[13px] text-muted-foreground">
              {quiet.from} – {quiet.to}
            </span>
          </span>
          <ToggleTrack on={quiet.enabled} />
        </button>
      )}

      {list.data && (
        <p className="text-[13px] text-muted-foreground">
          {activeRemindersLabel(reminders)} · toque no lembrete para mudar horários e dias
        </p>
      )}

      <ReminderSheet
        open={sheet.open}
        reminder={sheet.reminder}
        onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
      />
    </div>
  );
}
