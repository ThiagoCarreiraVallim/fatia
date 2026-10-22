import { Pressable, ScrollView, Text } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { activeCommunityTab, communityTabs } from '@fatia/api-client';
import { cn } from '@/components/ui';

/**
 * As abas da comunidade — equivalente de `apps/web/src/components/community/community-tabs.tsx`:
 * o mural é a raiz da comunidade, e o resto mora na engrenagem.
 */
export function CommunityTabs({ groupId }: { groupId: string }) {
  const router = useRouter();
  const active = activeCommunityTab(usePathname() ?? '');
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityRole="tablist"
      contentContainerClassName="gap-1 border-b border-border"
    >
      {communityTabs(groupId).map((t) => {
        const on = active === t.tab;
        return (
          <Pressable
            key={t.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => !on && router.navigate(t.href as never)}
            className={cn(
              'min-h-[44px] justify-center border-b-2 px-3',
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
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
