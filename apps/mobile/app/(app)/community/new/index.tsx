import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  canCreateCommunity,
  COMMUNITY_KIND_OPTIONS,
  COMMUNITY_SHORT_HOST,
  communitySlug,
  orgApi,
  setupApi,
  type CommunityKindOption,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { CreateSteps } from '@/components/org/setup-guide';
import { apiMessage } from '@/components/org/org-panel';
import { Button, Icon, Input, cn } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';

/** Espera a pessoa parar de digitar antes de perguntar o endereço à API. */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Criar uma comunidade, passo 1 (#372, prancha Onb-C1) — equivalente de
 * `apps/web/src/app/(app)/community/new/page.tsx`: o tipo, o nome e o
 * endereço `fat.ia.br/<slug>`. "Criar" só com tipo e nome; segue para a Marca.
 */
export default function NewCommunityScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [kind, setKind] = useState<CommunityKindOption | null>(null);
  const [name, setName] = useState('');
  const asked = useDebounced(name.trim(), 350);
  const slug = useQuery({
    queryKey: ['community', 'slug-check', asked],
    queryFn: () => setupApi.slugCheck(asked),
    enabled: asked.length >= 2,
    staleTime: 30_000,
  });
  const current = slug.data && asked === name.trim() ? slug.data : null;
  const shown = current ? current.slug : communitySlug(name || 'sua comunidade');

  const create = useMutation({
    mutationFn: async () => {
      const o = COMMUNITY_KIND_OPTIONS.find((x) => x.key === kind)!;
      const nome = name.trim();
      const livre = current ?? (await setupApi.slugCheck(nome));
      return orgApi.create({
        name: nome,
        type: o.type,
        ...(o.kind ? { kind: o.kind } : {}),
        slug: livre.slug,
        joinPolicy: 'APPROVAL',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
    },
    onSuccess: (g) => {
      void qc.invalidateQueries({ queryKey: ['community'] });
      router.replace(`/community/new/${g.id}`);
    },
  });

  return (
    <Screen
      footer={
        <Button
          size="xl"
          className="flex-1"
          disabled={!canCreateCommunity(kind, name)}
          loading={create.isPending}
          onPress={() => create.mutate()}
        >
          Criar
        </Button>
      }
    >
      <View className="gap-5 px-5 pb-4 pt-2">
        <CreateSteps step={1} />
        <Text accessibilityRole="header" className="font-display text-[32px] text-foreground">
          Que tipo de comunidade?
        </Text>
        <View
          accessibilityRole="radiogroup"
          accessibilityLabel="Tipo de comunidade"
          className="gap-2.5"
        >
          {COMMUNITY_KIND_OPTIONS.map((o) => {
            const on = kind === o.key;
            return (
              <Pressable
                key={o.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={`${o.title}. ${o.sub}`}
                onPress={() => setKind(o.key)}
                className={cn(
                  'flex-row items-center gap-4 rounded-card bg-card p-4 active:opacity-80',
                  on && 'border-2 border-primary bg-primary/15',
                )}
              >
                <View className="h-12 w-12 items-center justify-center rounded-2xl bg-primary/15">
                  <Icon name={o.icon} size={22} color={colors.primaryText} />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold text-foreground">{o.title}</Text>
                  <Text className="text-[13.5px] text-muted-foreground">{o.sub}</Text>
                </View>
                <View
                  className={cn(
                    'h-6 w-6 items-center justify-center rounded-full border-2',
                    on ? 'border-primary bg-primary' : 'border-border-strong',
                  )}
                >
                  {on ? <Icon name="check" size={14} color={colors.primaryForeground} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View className="gap-1.5">
          <Text className="text-[13px] font-semibold text-muted-foreground">Nome</Text>
          <Input
            value={name}
            onChangeText={setName}
            maxLength={120}
            placeholder="Academia Demo"
            accessibilityLabel="Nome"
          />
          <Text className="text-[13px] text-muted-foreground" accessibilityLiveRegion="polite">
            {COMMUNITY_SHORT_HOST}/<Text className="font-semibold text-foreground">{shown}</Text>
          </Text>
          {current?.taken ? (
            <Text className="text-[13px] text-muted-foreground">
              O endereço do nome já é de outra comunidade.
            </Text>
          ) : null}
        </View>
        {create.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-destructive">
            {apiMessage(create.error, 'Não deu para criar agora. Tente de novo.')}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
