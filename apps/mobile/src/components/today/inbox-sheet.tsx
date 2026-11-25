import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { inboxApi, relativeTime, type InboxItem } from '@fatia/api-client';
import { Drawer, DrawerScrollView } from '@/components/ui/drawer';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { ChipIcon } from './parts';

/**
 * Central de avisos do sino do Hoje, espelho de
 * `apps/web/src/components/today/inbox-sheet.tsx`. Abrir marca todos como lidos
 * e some o ponto do sino. Só abre com aviso novo.
 */
export function InboxSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: () => inboxApi.list(),
    enabled: open,
  });
  const marked = useRef(false);

  useEffect(() => {
    if (!open) {
      marked.current = false;
      return;
    }
    if (marked.current || !inbox.data || inbox.data.unread === 0) return;
    marked.current = true;
    inboxApi
      .markRead()
      .then(() => qc.invalidateQueries({ queryKey: ['dashboard'] }))
      .catch(() => {
        marked.current = false;
      });
  }, [open, inbox.data, qc]);

  function go(href: string) {
    onOpenChange(false);
    router.push(href as Href);
  }

  const items = inbox.data?.items ?? [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32, gap: 16 }}
      >
        <Text accessibilityRole="header" className="pt-1 font-display text-h2 text-foreground">
          Avisos
        </Text>
        <View className="overflow-hidden rounded-card bg-muted">
          {inbox.isLoading ? (
            <View className="px-[18px] py-4">
              <ActivityIndicator color={colors.mutedForeground} />
            </View>
          ) : inbox.isError ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void inbox.refetch()}
              className="px-[18px] py-4"
            >
              <Text className="text-b2 text-danger">Não deu para carregar. Tentar de novo</Text>
            </Pressable>
          ) : items.length === 0 ? (
            <Text className="px-[18px] py-4 text-b2 text-muted-foreground">
              Nenhum aviso por aqui.
            </Text>
          ) : (
            items.map((item, i) => (
              <InboxRow key={item.id} item={item} first={i === 0} onPress={go} />
            ))
          )}
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => go('/profile/notifications')}
          className="h-[52px] flex-row items-center justify-center gap-2 rounded-field bg-muted"
        >
          <Icon name="gear" size={16} />
          <Text className="text-[15px] font-bold text-foreground">Preferências de avisos</Text>
        </Pressable>
      </DrawerScrollView>
    </Drawer>
  );
}

function InboxRow({
  item,
  first,
  onPress,
}: {
  item: InboxItem;
  first: boolean;
  onPress: (href: string) => void;
}) {
  const internal = item.url.startsWith('/');
  return (
    <Pressable
      accessibilityRole={internal ? 'link' : 'text'}
      disabled={!internal}
      onPress={() => onPress(item.url)}
      className={
        first
          ? 'flex-row items-start gap-3.5 px-[18px] py-3.5'
          : 'flex-row items-start gap-3.5 border-t border-border px-[18px] py-3.5'
      }
    >
      <ChipIcon icon="bell" tone={item.readAt ? 'blue' : 'lime'} size={34} />
      <View className="min-w-0 flex-1">
        <Text className="text-[15px] font-semibold text-foreground">{item.title}</Text>
        <Text className="text-b2 text-muted-foreground">{item.body}</Text>
      </View>
      <Text className="text-xs text-faint">{relativeTime(item.createdAt)}</Text>
    </Pressable>
  );
}
