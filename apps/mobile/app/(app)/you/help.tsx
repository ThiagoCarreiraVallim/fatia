import { useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { searchTutorials, tutorialsApi, tutorialSubtitle, type Tutorial } from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerScrollView,
  DrawerTitle,
} from '@/components/ui';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

const SEEN_KEY = ['you', 'tutorials', 'seen'] as const;

/**
 * Ajuda e tutoriais (pranchas Al-V12/V12b) — réplica de
 * `apps/web/src/components/you/help-screen.tsx`. O texto vem no pacote, então
 * funciona sem internet. O app não tem leitor de rede no Expo Go; "sem
 * conexão" é a lista de assistidos que não chegou — o mesmo pedido que o
 * vídeo faria.
 */
export default function HelpScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Tutorial | null>(null);

  const seen = useQuery({ queryKey: SEEN_KEY, queryFn: () => tutorialsApi.seen(), retry: false });
  const online = !seen.isError;
  const markSeen = useMutation({
    mutationFn: (id: string) => tutorialsApi.markSeen(id),
    onSuccess: (data) => qc.setQueryData(SEEN_KEY, data),
  });
  const seenIds = new Set(seen.data?.seen ?? []);
  const areas = searchTutorials(query);

  const openTutorial = (t: Tutorial) => {
    setOpen(t);
    if (online && !seenIds.has(t.id)) markSeen.mutate(t.id);
  };

  return (
    <>
      <Screen>
        <View className="gap-3.5 px-6 pb-8 pt-2">
          {!online ? (
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
                  Os vídeos voltam quando a internet voltar. Os textos estão salvos.
                </Text>
              </View>
            </View>
          ) : null}

          <View className="h-12 flex-row items-center gap-2 rounded-field bg-card px-3.5">
            <Icon name="search" size={16} color={colors.faintForeground} />
            <TextInput
              accessibilityLabel="Buscar ajuda"
              placeholder="Buscar: foto do prato, metas, comunidade…"
              placeholderTextColor={colors.placeholder}
              selectionColor={colors.primaryText}
              value={query}
              onChangeText={setQuery}
              className="flex-1 font-sans text-[15px] text-foreground"
            />
          </View>

          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/onboarding' as never)}
            className="flex-row items-center gap-3 rounded-card border border-primary/35 bg-card p-3.5 active:opacity-80"
          >
            <View className="h-10 w-10 items-center justify-center rounded-[12px] bg-primary/15">
              <Icon name="repeat" size={16} color={colors.primaryText} />
            </View>
            <View className="flex-1">
              <Text className="font-sans-bold text-[15px] text-foreground">
                Repetir primeiros passos
              </Text>
              <Text className="text-[13px] text-muted-foreground">O guia do começo, de novo</Text>
            </View>
            <Icon name="chevR" size={16} color={colors.faintForeground} />
          </Pressable>

          {areas.length === 0 ? (
            <Text className="py-6 text-center text-[15px] text-muted-foreground">
              Nada encontrado para “{query.trim()}”.
            </Text>
          ) : null}

          {areas.map((area) => (
            <View key={area.title} className="gap-2">
              <Text
                accessibilityRole="header"
                className="font-sans-bold text-[11px] uppercase tracking-widest text-muted-foreground"
              >
                {area.title}
              </Text>
              <View className="overflow-hidden rounded-card bg-card">
                {area.items.map((t, i) => (
                  <View key={t.id}>
                    {i > 0 ? <View className="h-px bg-border" /> : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t.title}. ${tutorialSubtitle(t, online)}${seenIds.has(t.id) ? '. assistido' : ''}`}
                      onPress={() => openTutorial(t)}
                      className="min-h-[60px] flex-row items-center gap-3 px-4 py-3 active:bg-surface-3"
                    >
                      <View className="h-9 w-[52px] items-center justify-center rounded-[10px] bg-muted">
                        <Icon
                          name={t.videoUrl && online ? 'play' : 'file'}
                          size={16}
                          color={colors.mutedForeground}
                        />
                      </View>
                      <View className="flex-1">
                        <Text className="font-sans-semibold text-[15px] text-foreground">
                          {t.title}
                        </Text>
                        <Text className="text-[13px] text-muted-foreground">
                          {tutorialSubtitle(t, online)}
                        </Text>
                      </View>
                      {seenIds.has(t.id) ? (
                        <View className="rounded-full border border-success/45 px-2">
                          <Text className="font-sans-semibold text-[10px] text-success">
                            assistido
                          </Text>
                        </View>
                      ) : null}
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      </Screen>

      <Drawer open={open !== null} onOpenChange={(o) => (o ? undefined : setOpen(null))}>
        <DrawerContent className="px-6 pb-8">
          {open ? (
            <>
              <DrawerHeader className="px-0">
                <DrawerTitle>{open.title}</DrawerTitle>
                <DrawerDescription>{tutorialSubtitle(open, online)}</DrawerDescription>
              </DrawerHeader>
              <DrawerScrollView>
                <View className="gap-3">
                  {open.body.map((p) => (
                    <Text key={p} className="text-[15px] text-foreground">
                      {p}
                    </Text>
                  ))}
                  {open.videoUrl && online ? (
                    <Button
                      variant="secondary"
                      onPress={() => void Linking.openURL(open.videoUrl!)}
                    >
                      Ver o vídeo
                    </Button>
                  ) : null}
                </View>
              </DrawerScrollView>
            </>
          ) : null}
        </DrawerContent>
      </Drawer>
    </>
  );
}
