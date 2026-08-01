import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { cn } from '@/components/ui';

/** Réplica do `MenuItem` de `apps/web/src/app/(app)/profile/page.tsx`. */
export function MenuItem({
  icon,
  title,
  subtitle,
  onPress,
  last = false,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      onPress={onPress}
      className={cn(
        'min-h-[44px] flex-row items-center gap-4 px-4 py-4 active:opacity-80',
        !last && 'border-b border-border',
      )}
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl bg-muted">{icon}</View>
      <View className="min-w-0 flex-1">
        <Text className="text-base font-bold leading-tight text-foreground">{title}</Text>
        <Text className="text-xs text-muted-foreground">{subtitle}</Text>
      </View>
      <ChevronRight size={18} color="#baccaf" />
    </Pressable>
  );
}
