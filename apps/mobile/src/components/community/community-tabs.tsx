import { Pressable, ScrollView, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '@/components/ui/text';
import { usePathname, useRouter } from 'expo-router';
import { activeCommunityTab, communityTabs, forYouApi, groupsApi } from '@fatia/api-client';
import { forYouKey } from '@/components/feed/feed-ui';
import { cn } from '@/components/ui';

/**
 * As abas da comunidade — equivalente de `apps/web/src/components/community/community-tabs.tsx`:
 * o mural é a raiz da comunidade, e o resto mora na engrenagem. Para você leva
 * o número do que falta; a Agenda chega com a #397. Mural e Desafios somem
 * quando a comunidade os esconde (#413); só visual.
 */
export function CommunityTabs({ groupId }: { groupId: string }) {
  const router = useRouter();
  const active = activeCommunityTab(usePathname() ?? '');
  const forYou = useQuery({ queryKey: forYouKey(groupId), queryFn: () => forYouApi.get(groupId) });
  const group = useQuery({
    queryKey: ['community', 'group', groupId],
    queryFn: () => groupsApi.get(groupId),
  });
  const count = forYou.data?.count ?? 0;
  // As abas vão até a borda da tela, com o respiro dentro (#477); a linha de
  // baixo acompanha, de ponta a ponta. Quem usa tem `px-5`.
  return (
    <View className="-mx-5 border-b border-border">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        contentContainerClassName="gap-1 px-5"
      >
        {communityTabs(groupId, group.data?.hiddenSections).map((t) => {
          const on = active === t.tab;
          return (
            <Pressable
              key={t.tab}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                t.tab === 'for-you' && count > 0 ? `${t.label}, ${count} para ver` : t.label
              }
              onPress={() => !on && router.navigate(t.href as never)}
              className={cn(
                'min-h-[44px] flex-row items-center gap-1.5 border-b-2 px-3',
                on ? 'border-primary' : 'border-transparent',
              )}
            >
              <Text
                className={cn(
                  'text-sm',
                  on ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {t.label}
              </Text>
              {t.tab === 'for-you' && count > 0 ? (
                <View className="h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5">
                  <Text className="text-[11px] font-bold text-primary-foreground">{count}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
