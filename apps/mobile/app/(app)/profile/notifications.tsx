import { Fragment } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IconName } from '@fatia/design';
import {
  notificationGroups,
  notificationPreview,
  notificationsApi,
  type NotificationKind,
  type NotificationSettings,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { NOTIFICATION_SETTINGS_KEY } from '@/components/reminders/keys';
import { ChipIcon } from '@/components/today/parts';
import { ToggleTrack } from '@/components/you/you-list';
import { ErrorState, LoadingState, useToast } from '@/components/ui';
import { Text } from '@/components/ui/text';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- asset estático do Metro
const APP_ICON = require('../../../assets/icon.png') as number;

/**
 * Notificações (prancha Al-V4, #389) — réplica de
 * `apps/web/src/components/notifications/notifications-screen.tsx`: três grupos
 * com o liga-desliga de cada tipo, a prévia do aviso agrupado e a promessa de
 * que nenhum aviso mostra dado de saúde nem o texto de um post.
 */
export default function NotificationsScreen() {
  const qc = useQueryClient();
  const toast = useToast();
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
      toast.show({ message: 'Não deu para salvar. Tente de novo.' });
    },
  });

  return (
    <Screen onRefresh={() => void settings.refetch()} refreshing={settings.isRefetching}>
      <View className="gap-4 px-6 pb-6 pt-4">
        {settings.isPending ? <LoadingState /> : null}
        {settings.isError ? (
          <ErrorState error={settings.error} onRetry={() => settings.refetch()} />
        ) : null}
        {settings.data ? (
          <>
            {notificationGroups({ team: settings.data.team }).map((group) => (
              <View key={group.title} className="gap-2">
                <View className="flex-row items-center justify-between px-1">
                  <Text
                    accessibilityRole="header"
                    className="font-sans-bold text-xs uppercase tracking-[0.72px] text-faint"
                  >
                    {group.title}
                  </Text>
                  {group.detail ? <Text className="text-xs text-faint">{group.detail}</Text> : null}
                </View>
                <View className="overflow-hidden rounded-card bg-card">
                  {group.items.map((item, i) => {
                    const on = settings.data.preferences[item.kind];
                    return (
                      <Fragment key={item.kind}>
                        {i > 0 ? <View className="ml-[70px] h-px bg-border" /> : null}
                        <Pressable
                          accessibilityRole="switch"
                          accessibilityLabel={item.label}
                          accessibilityHint={item.hint}
                          accessibilityState={{ checked: on }}
                          onPress={() => save.mutate({ kind: item.kind, on: !on })}
                          className="min-h-16 flex-row items-center gap-3.5 px-4 py-3 active:bg-surface-3"
                        >
                          <ChipIcon icon={item.icon as IconName} tone={item.tone} />
                          <View className="flex-1">
                            <Text className="font-sans-semibold text-[15px] text-foreground">
                              {item.label}
                            </Text>
                            <Text className="text-[13px] text-muted-foreground">{item.hint}</Text>
                          </View>
                          <ToggleTrack on={on} />
                        </Pressable>
                      </Fragment>
                    );
                  })}
                </View>
              </View>
            ))}

            <View className="gap-2 rounded-card bg-muted px-[18px] py-4">
              <Text className="font-sans-bold text-xs uppercase tracking-[0.72px] text-faint">
                Avisos chegam agrupados
              </Text>
              <View className="flex-row items-center gap-2">
                <Image
                  source={APP_ICON}
                  accessibilityIgnoresInvertColors
                  style={{ width: 28, height: 28, borderRadius: 8 }}
                />
                <View className="flex-1">
                  <Text className="font-sans-bold text-[13px] text-foreground">Fatia</Text>
                  <Text
                    accessibilityLiveRegion="polite"
                    className="text-[13px] text-muted-foreground"
                  >
                    {notificationPreview(settings.data.preferences, settings.data)}
                  </Text>
                </View>
              </View>
            </View>

            <Text className="text-xs text-faint">
              Nenhum aviso mostra dado de saúde ou o texto de um post.
            </Text>
          </>
        ) : null}
      </View>
    </Screen>
  );
}
