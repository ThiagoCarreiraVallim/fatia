import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Screen } from '@/components/layout/screen';
import { headerButtonClass } from '@/components/layout/tab-header';
import { NOTIFICATION_SETTINGS_KEY, REMINDERS_KEY } from '@/components/reminders/keys';
import { ReminderSheet } from '@/components/reminders/reminder-sheet';
import { ChipIcon } from '@/components/today/parts';
import { ToggleTrack } from '@/components/you/you-list';
import { Button, DrawerLayer, ErrorState, LoadingState, useToast } from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { enablePush, pushDeviceId } from '@/notifications/push';
import { colors } from '@/theme/colors';
import { listEntering } from '@/theme/motion';

/**
 * Lembretes (prancha Al-V2, #389) — réplica de
 * `apps/web/src/components/reminders/reminders-screen.tsx`. A faixa
 * "Notificações bloqueadas" aparece enquanto este celular não recebe avisos;
 * "Liberar" pede a permissão e, se o sistema já negou, abre as configurações.
 */
export default function RemindersScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const [sheet, setSheet] = useState<{ open: boolean; reminder: Reminder | null }>({
    open: false,
    reminder: null,
  });
  // `null` enquanto confere; `false` = este celular não recebe avisos.
  const [receiving, setReceiving] = useState<boolean | null>(null);
  const [allowing, setAllowing] = useState(false);

  useEffect(() => {
    void pushDeviceId()
      .then((id) => setReceiving(id !== null))
      .catch(() => setReceiving(false));
  }, []);

  const list = useQuery({ queryKey: REMINDERS_KEY, queryFn: () => remindersApi.list() });
  const settings = useQuery({
    queryKey: NOTIFICATION_SETTINGS_KEY,
    queryFn: () => notificationsApi.settings(),
  });

  const flip = useMutation({
    mutationFn: (r: Reminder) => remindersApi.update(r.id, { enabled: !r.enabled }),
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
      toast.show({ message: 'Não deu para salvar. Tente de novo.' });
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
      toast.show({ message: 'Não deu para salvar. Tente de novo.' });
    },
  });

  const allow = async () => {
    setAllowing(true);
    try {
      const r = await enablePush(true);
      if (r === 'enabled') setReceiving(true);
      // O sistema já negou: só dá para liberar nas configurações dele.
      else if (r === 'denied') void Linking.openSettings();
      else toast.show({ message: 'Esta versão do app não recebe avisos. Atualize pela loja.' });
    } catch {
      toast.show({ message: 'Não deu para liberar agora. Tente de novo.' });
    } finally {
      setAllowing(false);
    }
  };

  const quiet = settings.data?.quietHours;
  const reminders = list.data ?? [];

  return (
    <>
      <Screen
        actions={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Novo lembrete"
            onPress={() => setSheet({ open: true, reminder: null })}
            className={headerButtonClass('lime')}
          >
            <Icon name="plus" size={20} color={colors.primaryForeground} />
          </Pressable>
        }
        onRefresh={() => void list.refetch()}
        refreshing={list.isRefetching}
      >
        <View className="gap-4 px-6 pb-6 pt-4">
          {receiving === false ? (
            <View
              accessibilityRole="alert"
              className="flex-row items-center gap-3 rounded-card px-4 py-3.5"
              style={{
                backgroundColor: `${colors.warning}1a`,
                borderWidth: 1,
                borderColor: `${colors.warning}4d`,
              }}
            >
              <ChipIcon icon="bell" tone="amber" size={32} />
              <View className="flex-1">
                <Text className="font-sans-bold text-[15px] text-foreground">
                  Notificações bloqueadas
                </Text>
                <Text className="text-xs text-faint">Nada vai tocar até liberar</Text>
              </View>
              <Button size="xs" variant="secondary" loading={allowing} onPress={() => void allow()}>
                Liberar
              </Button>
            </View>
          ) : null}

          {list.isPending ? <LoadingState /> : null}
          {list.isError ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : null}

          {reminders.length > 0 ? (
            <View className="overflow-hidden rounded-card bg-card">
              {reminders.map((r, i) => {
                const v = reminderVisual(r.kind);
                return (
                  <Animated.View
                    key={r.id}
                    entering={listEntering(i)}
                    className="min-h-[60px] flex-row items-center gap-2 border-border py-3.5 pl-[18px] pr-2.5"
                    style={i ? { borderTopWidth: 1 } : undefined}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${r.title}, ${reminderSummary(r)}`}
                      accessibilityHint="Abre a edição"
                      onPress={() => setSheet({ open: true, reminder: r })}
                      className="flex-1 flex-row items-center gap-3.5"
                    >
                      <ChipIcon icon={v.icon as IconName} tone={v.tone} />
                      <View className="flex-1">
                        <Text className="font-sans-semibold text-[15px] text-foreground">
                          {r.title}
                        </Text>
                        <View className="flex-row items-center gap-1">
                          <Text className="text-[13px] text-muted-foreground">
                            {reminderSummary(r)}
                          </Text>
                          <Icon name="edit" size={14} color={colors.faintForeground} />
                        </View>
                      </View>
                    </Pressable>
                    <Pressable
                      accessibilityRole="switch"
                      accessibilityLabel={`Ligar ou desligar ${r.title}`}
                      accessibilityState={{ checked: r.enabled }}
                      onPress={() => flip.mutate(r)}
                      className="p-2"
                    >
                      <ToggleTrack on={r.enabled} />
                    </Pressable>
                  </Animated.View>
                );
              })}
            </View>
          ) : null}

          {list.data && reminders.length === 0 ? (
            <Text className="text-b2 text-muted-foreground">
              Nenhum lembrete ainda. Toque no + para criar o primeiro.
            </Text>
          ) : null}

          {quiet ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={`Silêncio noturno, ${quiet.from} – ${quiet.to}`}
              accessibilityState={{ checked: quiet.enabled }}
              onPress={() => night.mutate(!quiet.enabled)}
              className="flex-row items-center gap-3 rounded-card bg-card px-[18px] py-4 active:opacity-80"
            >
              <Icon name="moon" size={20} color={colors.mutedForeground} />
              <View className="flex-1">
                <Text className="font-sans-bold text-foreground">Silêncio noturno</Text>
                <Text className="text-xs text-faint">
                  {quiet.from} – {quiet.to}
                </Text>
              </View>
              <ToggleTrack on={quiet.enabled} />
            </Pressable>
          ) : null}

          {list.data ? (
            <Text className="text-xs text-faint">
              {activeRemindersLabel(reminders)} · toque no lembrete para mudar horários e dias
            </Text>
          ) : null}
        </View>
      </Screen>

      <DrawerLayer>
        <ReminderSheet
          open={sheet.open}
          reminder={sheet.reminder}
          onOpenChange={(open) => setSheet((s) => ({ ...s, open }))}
        />
      </DrawerLayer>
    </>
  );
}
