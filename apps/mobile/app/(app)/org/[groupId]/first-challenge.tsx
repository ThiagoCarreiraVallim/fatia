import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHALLENGE_TEMPLATES,
  challengePublishedText,
  challengesApi,
  challengeTemplateInput,
  groupCan,
  groupsApi,
  mondayLabel,
  nextMondayIso,
  panelHref,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { apiMessage, orgKeys } from '@/components/org/org-panel';
import { Button, EmptyState, Icon, LoadingState, Segmented, Switch, cn } from '@/components/ui';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { colors } from '@/theme/colors';

type Start = 'monday' | 'today';

/**
 * Primeiro desafio com modelo (#372, prancha Onb-C5) — equivalente de
 * `apps/web/src/app/(org)/org/[groupId]/challenges/first/page.tsx`: o
 * "Constância 30 dias" pronto, segunda ou hoje, push opcional. "Aberto para não
 * membros" depende da página pública (#416) e fica fora.
 */
export default function FirstChallengeScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [pick, setPick] = useState(0);
  const [others, setOthers] = useState(false);
  const [start, setStart] = useState<Start>('monday');
  const [push, setPush] = useState(true);
  const group = useQuery({
    queryKey: orgKeys.group(groupId),
    queryFn: () => groupsApi.get(groupId),
  });
  const pode = group.data ? groupCan(group.data, 'challenge.manage') : false;
  const list = useQuery({
    queryKey: [...orgKeys.all(groupId), 'challenges', 'today'],
    queryFn: () => challengesApi.list(groupId),
    enabled: pode,
  });
  const t = CHALLENGE_TEMPLATES[pick]!;
  const today = list.data?.today ?? '';
  const monday = today ? nextMondayIso(today) : '';
  const startDate = start === 'monday' ? monday : today;
  const startLabel = start === 'monday' && monday ? mondayLabel(monday).toLowerCase() : 'hoje';
  const publish = useMutation({
    mutationFn: () => challengesApi.create(groupId, challengeTemplateInput(t, startDate, push)),
    onSuccess: () => void qc.invalidateQueries({ queryKey: orgKeys.all(groupId) }),
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para publicar agora.') }),
  });
  const voltar = () => router.replace(panelHref(groupId) as never);

  if (group.isPending || (pode && list.isPending)) {
    return (
      <Screen title="Primeiro desafio">
        <LoadingState label="Carregando…" />
      </Screen>
    );
  }
  if (!pode) {
    return (
      <Screen title="Primeiro desafio">
        <View className="px-5 pt-6">
          <EmptyState
            title="Desafio indisponível"
            description="Só quem cuida dos desafios da comunidade publica um desafio."
          />
        </View>
      </Screen>
    );
  }
  if (publish.isSuccess) {
    return (
      <Screen
        title="Primeiro desafio"
        footer={
          <Button size="xl" className="flex-1" onPress={voltar}>
            Voltar ao checklist
          </Button>
        }
      >
        <View className="items-center gap-3 px-5 pt-16">
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-primary/15">
            <Icon name="trophy" size={24} color={colors.primaryText} />
          </View>
          <Text accessibilityRole="header" className="font-display text-2xl text-foreground">
            Desafio publicado
          </Text>
          <Text className="text-center text-sm text-muted-foreground">
            {challengePublishedText(t, startLabel, push)}
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      title="Primeiro desafio"
      footer={
        <View className="flex-1 gap-2">
          <Button
            size="xl"
            disabled={!startDate}
            loading={publish.isPending}
            onPress={() => publish.mutate()}
          >
            Publicar desafio
          </Button>
          <Button variant="text" onPress={() => setOthers((v) => !v)}>
            Ver outros modelos
          </Button>
        </View>
      }
    >
      <View className="gap-5 px-5 pb-4 pt-2">
        <View className="gap-2 rounded-card border border-brand/50 bg-brand/15 p-5">
          <View className="self-start rounded-full bg-brand px-3 py-1">
            <Text className="text-xs font-bold uppercase text-brand-foreground">Modelo</Text>
          </View>
          <Text accessibilityRole="header" className="font-display text-[32px] text-foreground">
            {t.title}
          </Text>
          <Text className="text-sm text-muted-foreground">{t.description}</Text>
          <View className="mt-2 flex-row gap-8">
            <View>
              <Text className="font-display text-3xl text-foreground">{t.days}</Text>
              <Text className="text-[13px] text-muted-foreground">dias</Text>
            </View>
            <View>
              <Text className="font-display text-3xl text-foreground">{t.rule.value}</Text>
              <Text className="text-[13px] text-muted-foreground">{t.rule.label}</Text>
            </View>
          </View>
        </View>

        {others ? (
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel="Modelos de desafio"
            className="gap-2"
          >
            {CHALLENGE_TEMPLATES.map((m, i) => (
              <Pressable
                key={m.key}
                accessibilityRole="radio"
                accessibilityState={{ checked: i === pick }}
                onPress={() => {
                  setPick(i);
                  setOthers(false);
                }}
                className={cn(
                  'rounded-card bg-card p-4 active:opacity-80',
                  i === pick && 'border-2 border-primary',
                )}
              >
                <Text className="font-bold text-foreground">{m.title}</Text>
                <Text className="text-[13px] text-muted-foreground">
                  {`${m.days} dias · ${m.rule.value} ${m.rule.label}`}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View className="gap-2">
          <Text className="text-[13px] font-semibold text-muted-foreground">Começa</Text>
          <Segmented<Start>
            label="Começa"
            value={start}
            onChange={setStart}
            options={[
              { value: 'monday', label: monday ? mondayLabel(monday) : 'Segunda' },
              { value: 'today', label: 'Hoje' },
            ]}
          />
        </View>
        <View className="flex-row items-center justify-between gap-3 rounded-card bg-card px-4 py-4">
          <Text className="text-[15px] text-foreground">Avisar todos por push</Text>
          <Switch label="Avisar todos por push" checked={push} onCheckedChange={setPush} />
        </View>
      </View>
    </Screen>
  );
}
