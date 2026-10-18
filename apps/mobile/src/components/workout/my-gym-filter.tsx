import { Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { groupsApi } from '@fatia/api-client';
import { cn } from '@/components/ui';

/** A pessoa está em alguma comunidade? Só então o filtro da academia faz sentido. */
export function useInCommunity(enabled = true): boolean {
  const mine = useQuery({
    queryKey: ['community', 'mine'],
    queryFn: () => groupsApi.mine(),
    enabled,
    staleTime: 60_000,
  });
  return Boolean(mine.data?.some((g) => g.status === 'ACTIVE'));
}

/** "Na minha academia" — equivalente de `apps/web/src/components/workout/my-gym-filter.tsx`. */
export function MyGymToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      className={cn(
        'min-h-[36px] self-start justify-center rounded-full border px-3 active:opacity-80',
        checked ? 'border-primary bg-accent' : 'border-border',
      )}
    >
      <Text className={cn('text-xs font-semibold', checked ? 'text-primary' : 'text-foreground')}>
        Na minha academia
      </Text>
    </Pressable>
  );
}

/** Marca o exercício que a comunidade da pessoa criou ou gravou. */
export function CommunityBadge({ name }: { name: string }) {
  return (
    <View className="rounded bg-accent px-2 py-0.5">
      <Text className="text-xs font-semibold text-primary">{name}</Text>
    </View>
  );
}
