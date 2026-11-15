import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { IconName } from '@fatia/design';
import {
  IDEA_MAX,
  ideasApi,
  newsApi,
  newsCountLabel,
  newsDate,
  type NewsFeed,
  type NewsItem,
  type NewsTone,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTextInput,
  DrawerTitle,
  LoadingState,
  useToast,
} from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { cn } from '@/components/ui/utils';
import {
  NEWS_QUERY_KEY,
  offlineFeed,
  readNewsCache,
  writeNewsCache,
} from '@/components/you/news-cache';
import { colors } from '@/theme/colors';

const TONE: Record<NewsTone, { box: string; color: keyof typeof colors }> = {
  lime: { box: 'bg-primary/15', color: 'primaryText' },
  amber: { box: 'bg-warning/15', color: 'warning' },
  blue: { box: 'bg-info/15', color: 'info' },
  neutral: { box: 'bg-muted', color: 'mutedForeground' },
};

/**
 * Novidades (pranchas Al-V11/V11b) — réplica de
 * `apps/web/src/components/you/news-screen.tsx`. Sem internet, a última lista
 * salva no aparelho, com o aviso e "Tentar de novo".
 */
export default function NewsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [ideaOpen, setIdeaOpen] = useState(false);
  const news = useQuery({
    queryKey: NEWS_QUERY_KEY,
    queryFn: async () => {
      const feed = await newsApi.list();
      writeNewsCache(feed);
      return feed;
    },
    retry: false,
  });

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => newsApi.markRead(ids),
    onSuccess: (feed, ids) => {
      qc.setQueryData(NEWS_QUERY_KEY, feed);
      writeNewsCache(feed);
      if (!ids) toast.show({ message: 'Tudo marcado como lido' });
    },
  });

  const cached = news.isError ? readNewsCache() : null;
  const offline = news.isError && cached !== null;
  const feed: NewsFeed | undefined = news.data ?? (cached ? offlineFeed(cached) : undefined);

  const retry = async () => {
    const r = await news.refetch();
    if (r.isError) toast.show({ message: 'Ainda sem conexão' });
  };

  const open = (item: NewsItem) => {
    if (item.unread && !offline) markRead.mutate([item.id]);
    if (item.href) router.push(item.href as never);
  };

  return (
    <>
      <Screen>
        <View className="gap-3.5 px-6 pb-8 pt-2">
          {offline ? (
            <View
              accessibilityLiveRegion="polite"
              className="flex-row items-center gap-3 rounded-field bg-warning/10 p-3"
            >
              <View className="h-8 w-8 items-center justify-center rounded-[10px] bg-warning/20">
                <Icon name="alert" size={16} color={colors.warning} />
              </View>
              <View className="flex-1">
                <Text className="font-sans-bold text-sm text-foreground">Sem conexão</Text>
                <Text className="text-[13px] text-muted-foreground">
                  Mostrando o que já estava salvo
                </Text>
              </View>
              <Button size="xs" variant="secondary" onPress={() => void retry()}>
                Tentar de novo
              </Button>
            </View>
          ) : null}

          {news.isPending ? <LoadingState /> : null}

          {news.isError && !offline ? (
            <View className="items-start gap-2 rounded-card bg-card p-4">
              <Text className="font-sans-bold text-foreground">
                Não deu para carregar as novidades.
              </Text>
              <Button size="xs" variant="secondary" onPress={() => void retry()}>
                Tentar de novo
              </Button>
            </View>
          ) : null}

          {feed ? (
            <>
              <View className="flex-row items-center justify-between">
                <Text className="text-[13px] text-muted-foreground">
                  {newsCountLabel(feed.unreadCount, offline ? cached?.savedAt : null)}
                </Text>
                {!offline && feed.unreadCount > 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={markRead.isPending}
                    onPress={() => markRead.mutate(undefined)}
                    className="min-h-[44px] justify-center px-1"
                  >
                    <Text className="font-sans-bold text-[13px] text-primary-text">
                      Marcar tudo como lido
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <View className="overflow-hidden rounded-card bg-card">
                {feed.items.map((item, i) => (
                  <View key={item.id}>
                    {i > 0 ? <View className="h-px bg-border" /> : null}
                    <Pressable
                      accessibilityRole={item.href ? 'link' : 'text'}
                      accessibilityLabel={`${item.title}${item.unread ? ', novo' : ''}. ${item.body}`}
                      onPress={() => open(item)}
                      className="min-h-[76px] flex-row items-start gap-3 px-4 py-3.5 active:bg-surface-3"
                    >
                      {item.unread ? (
                        <View className="absolute bottom-0 left-0 top-0 w-[3px] bg-primary" />
                      ) : null}
                      <View
                        className={cn(
                          'h-9 w-9 items-center justify-center rounded-[12px]',
                          TONE[item.tone].box,
                        )}
                      >
                        <Icon
                          name={item.icon as IconName}
                          size={16}
                          color={colors[TONE[item.tone].color]}
                        />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center gap-1.5">
                          <Text className="font-sans-semibold text-[15px] text-foreground">
                            {item.title}
                          </Text>
                          {item.unread ? (
                            <View className="rounded-full bg-primary px-1.5">
                              <Text className="font-sans-bold text-[10px] text-primary-foreground">
                                novo
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text className="text-[13px] text-muted-foreground">{item.body}</Text>
                        <Text className="mt-0.5 text-[13px] text-faint">{newsDate(item.date)}</Text>
                      </View>
                    </Pressable>
                  </View>
                ))}
              </View>
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={() => setIdeaOpen(true)}
            className="flex-row items-center gap-3 rounded-card bg-muted p-4 active:opacity-80"
          >
            <View className="h-9 w-9 items-center justify-center rounded-[12px] bg-primary/15">
              <Icon name="spark" size={16} color={colors.primaryText} />
            </View>
            <View className="flex-1">
              <Text className="font-sans-bold text-[15px] text-foreground">Sugerir uma ideia</Text>
              <Text className="text-[13px] text-muted-foreground">Lemos todas</Text>
            </View>
            <Icon name="chevR" size={16} color={colors.faintForeground} />
          </Pressable>
        </View>
      </Screen>
      <IdeaSheet open={ideaOpen} onOpenChange={setIdeaOpen} />
    </>
  );
}

function IdeaSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const toast = useToast();
  const [text, setText] = useState('');
  const send = useMutation({
    mutationFn: () => ideasApi.send(text.trim()),
    onSuccess: () => {
      setText('');
      onOpenChange(false);
      toast.show({ message: 'Ideia enviada. Obrigado!' });
    },
    onError: () => toast.show({ message: 'Não deu para enviar. Tente de novo.' }),
  });
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="px-6 pb-6">
        <DrawerHeader className="px-0">
          <DrawerTitle>Sugerir uma ideia</DrawerTitle>
          <DrawerDescription>O que faria o Fatia melhor para você? Lemos todas.</DrawerDescription>
        </DrawerHeader>
        <DrawerTextInput
          accessibilityLabel="Sua ideia"
          multiline
          textAlignVertical="top"
          maxLength={IDEA_MAX}
          placeholder="Ex.: ver a carga sugerida na próxima série"
          placeholderTextColor={colors.placeholder}
          selectionColor={colors.primaryText}
          value={text}
          onChangeText={setText}
          className="h-32 rounded-field bg-card px-3.5 py-3 font-sans text-[15px] text-foreground"
        />
        <Button
          size="xl"
          className="mt-4 w-full"
          disabled={!text.trim()}
          loading={send.isPending}
          onPress={() => send.mutate()}
        >
          Enviar
        </Button>
      </DrawerContent>
    </Drawer>
  );
}
