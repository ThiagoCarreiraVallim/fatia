import { Image, Text, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { Play, Users } from 'lucide-react-native';
import type { CommunityGuide } from '@fatia/api-client';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { Button } from '@/components/ui';
import { cores } from '@/theme/cores';

/**
 * O tutorial que a comunidade da pessoa gravou para o exercício — equivalente
 * de `apps/web/src/components/workout/community-guide.tsx`. O vídeo abre no
 * navegador do sistema, que toca MP4 e MOV sem dependência nativa nova (o
 * mesmo motivo de o YouTube abrir fora do app).
 */
export function CommunityGuideSection({
  guide,
  exerciseName,
}: {
  guide: CommunityGuide;
  exerciseName: string;
}) {
  const fotos = guide.photos.filter((f) => f.url);
  const vazio = !guide.video?.url && fotos.length === 0 && !guide.tips;
  return (
    <View className="gap-3" accessibilityLabel={`Tutorial de ${guide.groupName}`}>
      <View className="flex-row items-center gap-1.5">
        <Users size={14} color={cores.primary} />
        <Text className="text-xs font-bold uppercase tracking-wide text-primary">
          {vazio ? `Exercício de ${guide.groupName}` : `Tutorial de ${guide.groupName}`}
        </Text>
      </View>
      {guide.video?.url ? (
        <Button
          accessibilityLabel={`Assistir a demonstração de ${exerciseName}`}
          onPress={() => void WebBrowser.openBrowserAsync(guide.video!.url!)}
        >
          <Play size={16} color={cores.primaryForeground} />
          <Text className="text-sm font-semibold text-primary-foreground">Assistir o vídeo</Text>
        </Button>
      ) : null}
      {fotos.length > 0 ? (
        <View className="flex-row flex-wrap gap-2">
          {fotos.map((f, i) => (
            <Image
              key={f.id}
              source={{ uri: f.url! }}
              accessibilityLabel={`${exerciseName}, foto ${i + 1}`}
              accessibilityIgnoresInvertColors
              className="h-36 w-[48%] rounded-xl"
            />
          ))}
        </View>
      ) : null}
      {guide.tips ? (
        <View className="rounded-xl bg-muted p-3">
          <MarkdownLite source={guide.tips} />
        </View>
      ) : null}
    </View>
  );
}
