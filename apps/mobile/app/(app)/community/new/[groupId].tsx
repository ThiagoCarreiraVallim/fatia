import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { vars } from 'nativewind';
import { hexToHslTriplet } from '@fatia/design';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BRAND_CONTRAST_OK,
  BRAND_SWATCHES,
  brandChoice,
  contentApi,
  groupsApi,
  initialsOf,
  orgApi,
  panelHref,
  type MyGroup,
} from '@fatia/api-client';
import { ImageField } from '@/components/content/image-field';
import { Screen } from '@/components/layout/screen';
import { apiMessage, orgKeys } from '@/components/org/org-panel';
import { CreateSteps } from '@/components/org/setup-guide';
import { Button, EmptyState, Icon, LoadingState, cn } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';

/**
 * Criar uma comunidade, passo 2 (#372, prancha Onb-C2) — equivalente de
 * `apps/web/src/app/(app)/community/new/[groupId]/page.tsx`: capa, logo e cor
 * com a prévia (Mural, Desafios). Sem 4,5:1, o editor avisa e salva o tom
 * corrigido; o verde do Fatia é recusado. No app, as 6 cores da prancha (o
 * seletor livre fica na web).
 */
export default function BrandStepScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const group = useQuery({
    queryKey: orgKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
    retry: false,
  });
  if (group.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando…" />
      </Screen>
    );
  }
  if (!group.data || group.data.role !== 'OWNER') {
    return (
      <Screen>
        <View className="px-5 pt-6">
          <EmptyState
            title="Marca indisponível"
            description="Só quem criou a comunidade escolhe a marca dela."
          />
        </View>
      </Screen>
    );
  }
  return <BrandStep g={group.data} />;
}

function BrandStep({ g }: { g: MyGroup }) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [picked, setPicked] = useState(g.brandColor ?? BRAND_SWATCHES[0]!.color);
  const choice = brandChoice(picked);
  const bg = choice.color ?? BRAND_SWATCHES[0]!.color;
  const ink = choice.ink ?? '#ffffff';
  const refresh = () => void qc.invalidateQueries({ queryKey: ['community'] });
  const fail = (err: unknown) =>
    toast.show({ message: apiMessage(err, 'Não deu para trocar a imagem agora.') });
  const cover = useMutation({
    mutationFn: (fileId: string | null) => orgApi.setCover(g.id, fileId),
    onSuccess: refresh,
    onError: fail,
  });
  const avatar = useMutation({
    mutationFn: (fileId: string | null) => contentApi.setAvatar(g.id, fileId),
    onSuccess: refresh,
    onError: fail,
  });
  const save = useMutation({
    mutationFn: () => orgApi.update(g.id, { brandColor: choice.color }),
    onSuccess: () => {
      refresh();
      router.replace(panelHref(g.id) as never);
    },
    onError: (err) =>
      toast.show({ message: apiMessage(err, 'Não deu para salvar a marca agora.') }),
  });

  return (
    <Screen
      footer={
        <View
          className="flex-1"
          style={vars({
            '--brand': hexToHslTriplet(bg),
            '--brand-foreground': hexToHslTriplet(ink),
          })}
        >
          <Button
            size="xl"
            variant="brand"
            disabled={!choice.color}
            loading={save.isPending}
            onPress={() => save.mutate()}
          >
            Salvar e abrir o painel
          </Button>
        </View>
      }
    >
      <View className="gap-5 px-5 pb-4 pt-2">
        <CreateSteps step={2} />
        <Text accessibilityRole="header" className="font-display text-[32px] text-foreground">
          A cara da sua comunidade
        </Text>

        <View
          accessibilityLabel="Prévia da comunidade"
          className="overflow-hidden rounded-card bg-card"
        >
          <View className="h-[120px]" style={{ backgroundColor: bg }}>
            {g.coverUrl ? (
              <Image
                source={{ uri: g.coverUrl }}
                accessibilityIgnoresInvertColors
                className="absolute inset-0"
                resizeMode="cover"
              />
            ) : null}
          </View>
          <View className="flex-row items-end gap-3 px-4 pb-4">
            <View
              className="-mt-8 h-[60px] w-[60px] items-center justify-center overflow-hidden rounded-[16px] border-4 border-card"
              style={{ backgroundColor: bg }}
            >
              {g.avatarUrl ? (
                <Image
                  source={{ uri: g.avatarUrl }}
                  accessibilityIgnoresInvertColors
                  className="h-full w-full"
                />
              ) : (
                <Text className="font-display text-xl" style={{ color: ink }}>
                  {initialsOf(g.name)}
                </Text>
              )}
            </View>
            <View className="flex-1 pt-2">
              <Text className="text-base font-bold text-foreground" numberOfLines={1}>
                {g.name}
              </Text>
              <View className="mt-1 flex-row gap-4" importantForAccessibility="no-hide-descendants">
                <View className="border-b-2 pb-1" style={{ borderColor: bg }}>
                  <Text className="text-[13.5px] font-semibold text-foreground">Mural</Text>
                </View>
                <Text className="pb-1 text-[13.5px] text-muted-foreground">Desafios</Text>
              </View>
            </View>
          </View>
        </View>

        <View className="gap-2.5">
          <Text className="text-[13px] font-semibold text-muted-foreground">Cor</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Cor"
            className="flex-row flex-wrap gap-3"
          >
            {BRAND_SWATCHES.map((s) => {
              const on = picked.toLowerCase() === s.color;
              return (
                <Pressable
                  key={s.color}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={s.label}
                  onPress={() => setPicked(s.color)}
                  className={cn('h-11 w-11 rounded-[14px]', on && 'border-[3px] border-foreground')}
                  style={{ backgroundColor: s.color }}
                />
              );
            })}
          </View>
          <View className="flex-row items-start gap-2" accessibilityLiveRegion="polite">
            <Icon
              name={choice.warning ? 'alert' : 'check'}
              size={16}
              color={choice.warning ? colors.warning : colors.mutedForeground}
            />
            <Text
              className={cn(
                'flex-1 text-[13px]',
                choice.warning ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {choice.warning ?? BRAND_CONTRAST_OK}
            </Text>
          </View>
        </View>

        <ImageField
          groupId={g.id}
          purpose="group_cover"
          label="Capa"
          value={null}
          onChange={(v) => cover.mutate(v?.fileId ?? null)}
        />
        <ImageField
          groupId={g.id}
          purpose="group_avatar"
          label="Logo"
          square
          value={null}
          onChange={(v) => avatar.mutate(v?.fileId ?? null)}
        />
      </View>
    </Screen>
  );
}
