import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react-native';
import { forYouApi, groupsApi, relativeTime, type ForYouItem } from '@fatia/api-client';
import { CommunityTabs } from '@/components/community/community-tabs';
import { forYouKey } from '@/components/feed/feed-ui';
import { Screen } from '@/components/layout/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

const KIND_LABEL: Record<ForYouItem['kind'], string> = {
  PLAN_OFFER: 'Plano de treino',
  NUTRITION_PLAN: 'Plano alimentar',
};

function Titulo({ children, count }: { children: string; count?: number }) {
  return (
    <View className="flex-row items-center gap-2">
      <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">
        {children}
      </Text>
      {count ? (
        <Text className="rounded-full bg-primary/15 px-2 text-xs text-primary">{count}</Text>
      ) : null}
    </View>
  );
}

function Item({ item, done, onPress }: { item: ForYouItem; done?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      className="flex-row items-start gap-3 rounded-2xl border border-border bg-card p-4"
    >
      <View className="flex-1 gap-1">
        <Text className="text-[11px] font-bold uppercase text-primary">
          {KIND_LABEL[item.kind]}
        </Text>
        <Text className="font-semibold text-foreground">{item.title}</Text>
        {item.note && !done ? (
          <Text className="text-sm text-muted-foreground">{item.note}</Text>
        ) : null}
        <Text className="text-xs text-muted-foreground">
          {[item.from, relativeTime(item.at)].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

/** A aba Para você (prancha Cm-20) — equivalente de `apps/web/src/app/(app)/community/[groupId]/for-you/page.tsx`. */
export default function CommunityForYouScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const group = useQuery({
    queryKey: ['community', 'group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });
  const data = useQuery({ queryKey: forYouKey(groupId), queryFn: () => forYouApi.get(groupId) });
  const ir = (href: string) => router.push(href as never);

  if (data.isPending) {
    return (
      <Screen title={group.data?.name}>
        <LoadingState label="Carregando…" />
      </Screen>
    );
  }
  if (data.isError) {
    return (
      <Screen title={group.data?.name}>
        <ErrorState error={data.error} onRetry={() => void data.refetch()} />
      </Screen>
    );
  }
  const v = data.data;
  const vazio = v.todo.length + v.recommended.length + v.fromTeam.length + v.done.length === 0;

  return (
    <Screen
      title={group.data?.name}
      onRefresh={() => void data.refetch()}
      refreshing={data.isRefetching}
    >
      <View className="gap-5 px-5 pb-6 pt-4">
        <CommunityTabs groupId={groupId} />
        <Text className="text-sm text-muted-foreground">
          {group.data
            ? `O que a equipe da ${group.data.name} mandou só para você.`
            : 'O que a equipe mandou só para você.'}
        </Text>
        {vazio ? (
          <EmptyState
            title="Nada para você agora"
            description="Quando a equipe mandar um plano ou um comunicado, aparece aqui."
          />
        ) : null}
        {v.todo.length > 0 ? (
          <View className="gap-2">
            <Titulo count={v.todo.length}>Para fazer</Titulo>
            {v.todo.map((i) => (
              <Item key={`${i.kind}-${i.id}`} item={i} onPress={() => ir(i.href)} />
            ))}
          </View>
        ) : null}
        {v.recommended.length > 0 ? (
          <View className="gap-2">
            <Titulo>Recomendado para você</Titulo>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-5"
              contentContainerClassName="gap-3 px-5"
            >
              {v.recommended.map((r) => (
                <Pressable
                  key={`${r.kind}-${r.id}`}
                  accessibilityRole="link"
                  onPress={() => ir(r.href)}
                  className="w-56 gap-1 rounded-2xl border border-border bg-card p-4"
                >
                  <Text className="text-[11px] font-bold uppercase text-primary">{r.meta}</Text>
                  <Text className="font-semibold text-foreground">{r.title}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        ) : null}
        {v.fromTeam.length > 0 ? (
          <View className="gap-2">
            <Titulo>Da equipe</Titulo>
            {v.fromTeam.map((n) => (
              <Pressable
                key={n.postId}
                accessibilityRole="link"
                onPress={() => ir(`/community/${groupId}`)}
                className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-4"
              >
                <View className="flex-1">
                  <Text className="font-semibold text-foreground">{`Comunicado: ${n.title}`}</Text>
                  <Text className="text-xs text-muted-foreground">
                    {`${n.from} · ${n.unread ? 'não lido' : relativeTime(n.at)}`}
                  </Text>
                </View>
                {n.unread ? <View className="h-2 w-2 rounded-full bg-primary" /> : null}
              </Pressable>
            ))}
          </View>
        ) : null}
        {v.done.length > 0 ? (
          <View className="gap-2 opacity-80">
            <Titulo>Já resolvido</Titulo>
            {v.done.map((i) => (
              <Item key={`${i.kind}-${i.id}`} item={i} done onPress={() => ir(i.href)} />
            ))}
          </View>
        ) : null}
      </View>
    </Screen>
  );
}
