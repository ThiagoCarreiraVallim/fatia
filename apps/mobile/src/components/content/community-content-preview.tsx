import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Pin } from 'lucide-react-native';
import { groupContentApi, markdownLitePlainText } from '@fatia/api-client';
import { cores } from '@/theme/cores';
import { TemplateCard } from './content-cards';

/** "Planos e dicas" no detalhe da comunidade, como na web. Some sem conteúdo. */
export function CommunityContentPreview({ groupId }: { groupId: string }) {
  const router = useRouter();
  const planos = useQuery({
    queryKey: ['community', 'plans', groupId],
    queryFn: () => groupContentApi.plans(groupId),
  });
  const dicas = useQuery({
    queryKey: ['community', 'tips', groupId],
    queryFn: () => groupContentApi.tips(groupId),
  });
  const fixada = dicas.data?.find((d) => d.pinned);
  const recentes = (planos.data ?? []).slice(0, 3);
  if (!fixada && recentes.length === 0 && !(dicas.data?.length ?? 0)) return null;
  const todos = `/community/${groupId}/content`;

  return (
    <View className="gap-2">
      <View className="flex-row items-center justify-between">
        <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
          Planos e dicas
        </Text>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(todos)}
          className="min-h-[44px] justify-center px-2"
        >
          <Text className="text-xs font-semibold text-primary">Ver tudo</Text>
        </Pressable>
      </View>
      {fixada ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`${todos}?tab=tips`)}
          className="flex-row items-start gap-3 rounded-2xl border border-border bg-card p-3 active:opacity-80"
        >
          <Pin size={16} color={cores.primary} />
          <View className="flex-1">
            <Text className="text-sm font-medium text-foreground">{fixada.title}</Text>
            <Text numberOfLines={2} className="text-xs text-muted-foreground">
              {markdownLitePlainText(fixada.body)}
            </Text>
          </View>
          <ChevronRight size={16} color={cores.mutedForeground} />
        </Pressable>
      ) : null}
      {recentes.map((t) => (
        <TemplateCard key={t.id} template={t} onPress={() => router.push(`${todos}/${t.id}`)} />
      ))}
    </View>
  );
}
