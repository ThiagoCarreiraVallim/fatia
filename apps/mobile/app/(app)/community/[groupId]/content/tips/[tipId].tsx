import { useState } from 'react';
import { Image, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Droplet, Dumbbell } from 'lucide-react-native';
import { groupContentApi, tipByline, tipShortcut, TIP_CATEGORY_LABEL } from '@fatia/api-client';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { Screen } from '@/components/layout/screen';
import { LogWaterDrawer } from '@/components/progress';
import { Badge } from '@/components/ui/badge';
import { Button, DrawerLayer, EmptyState, LoadingState } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { deviceTimezone } from '@/components/workout/offer-view';
import { colors } from '@/theme/colors';

/**
 * Uma dica da equipe (Cm-15, #396), equivalente de
 * `apps/web/src/app/(app)/community/[groupId]/content/tips/[tipId]/page.tsx`:
 * imagem, fixada e categoria, quem escreveu e quando, o texto e o atalho do
 * que ela pede ("Registrar água" abre o registro aqui; dica de treino leva ao treino).
 */
export default function CommunityTipScreen() {
  const { groupId, tipId } = useLocalSearchParams<{ groupId: string; tipId: string }>();
  const router = useRouter();
  const [agua, setAgua] = useState(false);
  const dica = useQuery({
    queryKey: ['community', 'tips', groupId, tipId],
    queryFn: () => groupContentApi.tip(groupId, tipId),
    retry: false,
  });

  if (dica.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando a dica…" />
      </Screen>
    );
  }
  if (!dica.data) {
    return (
      <Screen>
        <View className="px-5 pt-4">
          <EmptyState
            title="Dica indisponível"
            description="A equipe tirou esta dica do ar, ou o endereço está errado."
          />
        </View>
      </Screen>
    );
  }
  const d = dica.data;
  const atalho = tipShortcut(d);

  return (
    <>
      <Screen
        onRefresh={() => void dica.refetch()}
        refreshing={dica.isRefetching}
        footer={
          atalho === 'water' ? (
            <Button
              variant="outline"
              accessibilityLabel="Registrar água"
              className="flex-1 flex-row gap-2"
              onPress={() => setAgua(true)}
            >
              <Droplet size={18} color={colors.foreground} />
              <Text className="font-sans-semibold text-sm text-foreground">Registrar água</Text>
            </Button>
          ) : atalho === 'workout' ? (
            <Button
              variant="outline"
              accessibilityLabel="Ir para o treino"
              className="flex-1 flex-row gap-2"
              onPress={() => router.push('/workout')}
            >
              <Dumbbell size={18} color={colors.foreground} />
              <Text className="font-sans-semibold text-sm text-foreground">Ir para o treino</Text>
            </Button>
          ) : undefined
        }
      >
        <View className="gap-3 px-5 pb-6 pt-4">
          {d.image?.url ? (
            <Image
              source={{ uri: d.image.url }}
              accessibilityIgnoresInvertColors
              className="aspect-video w-full rounded-3xl"
            />
          ) : null}
          <View className="flex-row flex-wrap gap-1.5">
            {d.pinned ? <Badge variant="done">fixada</Badge> : null}
            <Badge variant="pending">{TIP_CATEGORY_LABEL[d.category].toLowerCase()}</Badge>
          </View>
          <Text accessibilityRole="header" className="font-display text-2xl text-foreground">
            {d.title}
          </Text>
          <Text className="text-sm text-muted-foreground">{tipByline(d, deviceTimezone())}</Text>
          <MarkdownLite source={d.body} />
        </View>
      </Screen>
      <DrawerLayer>
        <LogWaterDrawer open={agua} onClose={() => setAgua(false)} />
      </DrawerLayer>
    </>
  );
}
