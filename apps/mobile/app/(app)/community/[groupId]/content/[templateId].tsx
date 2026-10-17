import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  adoptResultMessage,
  ApiError,
  groupContentApi,
  nutritionApi,
  nutritionDiff,
  planTemplateSummary,
  type AdoptInput,
  type PlanTemplate,
} from '@fatia/api-client';
import { Screen } from '@/components/layout/screen';
import { apiMessage } from '@/components/org/org-panel';
import { Button, EmptyState, LoadingState, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

function Linha({ esquerda, direita }: { esquerda: string; direita: string }) {
  return (
    <View className="flex-row justify-between gap-3 px-4 py-3">
      <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
        {esquerda}
      </Text>
      <Text className="text-sm text-muted-foreground">{direita}</Text>
    </View>
  );
}

/** Caixa marcável do "o que entra na sua conta". */
function Opcao({
  titulo,
  detalhe,
  marcada,
  onPress,
  children,
}: {
  titulo: string;
  detalhe?: string;
  marcada: boolean;
  onPress: () => void;
  children?: React.ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: marcada }}
      accessibilityLabel={titulo}
      onPress={onPress}
      className={cn(
        'gap-2 rounded-xl border p-3 active:opacity-80',
        marcada ? 'border-primary bg-primary/10' : 'border-border',
      )}
    >
      <View className="flex-row items-center gap-3">
        <View
          className={cn(
            'h-4 w-4 rounded border-2',
            marcada ? 'border-primary bg-primary' : 'border-muted-foreground',
          )}
        />
        <Text className="flex-1 text-sm font-medium text-foreground">{titulo}</Text>
      </View>
      {detalhe ? <Text className="text-xs text-muted-foreground">{detalhe}</Text> : null}
      {children}
    </Pressable>
  );
}

function AdotarNutricao({
  t,
  pending,
  onConfirm,
  onCancel,
}: {
  t: PlanTemplate;
  pending: boolean;
  onConfirm: (i: AdoptInput) => void;
  onCancel: () => void;
}) {
  const [metas, setMetas] = useState(false);
  const [refeicoes, setRefeicoes] = useState(t.meals.length > 0);
  const atuais = useQuery({
    queryKey: ['nutrition', 'goals'],
    queryFn: () => nutritionApi.goals(),
    enabled: t.goals !== null,
  });
  const diff = t.goals ? nutritionDiff(atuais.data, t.goals) : [];
  return (
    <View className="gap-3 rounded-2xl border border-border bg-card p-4">
      <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
        O que entra na sua conta?
      </Text>
      {t.meals.length > 0 ? (
        <Opcao
          titulo="Salvar as refeições sugeridas"
          detalhe={`${t.meals.length} ${t.meals.length === 1 ? 'refeição' : 'refeições'} em Refeições salvas.`}
          marcada={refeicoes}
          onPress={() => setRefeicoes(!refeicoes)}
        />
      ) : null}
      {t.goals ? (
        <Opcao
          titulo="Trocar minhas metas pelas do plano"
          marcada={metas}
          onPress={() => setMetas(!metas)}
        >
          {diff.map((l) => (
            <View key={l.label} className="flex-row gap-2">
              <Text className="w-24 text-xs text-muted-foreground">{l.label}</Text>
              <Text className="flex-1 text-xs text-foreground">{`${l.current} → `}</Text>
              <Text className={cn('text-xs text-foreground', l.changed && 'font-bold')}>
                {l.next}
              </Text>
            </View>
          ))}
        </Opcao>
      ) : null}
      <View className="flex-row gap-2">
        <Button variant="ghost" className="flex-1" onPress={onCancel}>
          Cancelar
        </Button>
        <Button
          className="flex-1"
          disabled={!metas && !refeicoes}
          loading={pending}
          onPress={() => onConfirm({ applyGoals: metas, saveMeals: refeicoes })}
        >
          Adotar
        </Button>
      </View>
    </View>
  );
}

/** Equivalente de `apps/web/src/app/(app)/community/[groupId]/content/[templateId]/page.tsx`. */
export default function CommunityTemplateScreen() {
  const { groupId, templateId } = useLocalSearchParams<{ groupId: string; templateId: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [escolhendo, setEscolhendo] = useState(false);

  const modelo = useQuery({
    queryKey: ['community', 'plans', groupId, templateId],
    queryFn: () => groupContentApi.plan(groupId, templateId),
    retry: false,
  });
  const adotar = useMutation({
    mutationFn: (input: AdoptInput) => groupContentApi.adopt(groupId, templateId, input),
    onSuccess: (r) => {
      toast.show({ message: adoptResultMessage(r) });
      setEscolhendo(false);
      void qc.invalidateQueries({ queryKey: ['community', 'plans', groupId] });
      void qc.invalidateQueries({ queryKey: ['workout'] });
      void qc.invalidateQueries({ queryKey: ['nutrition'] });
      if (r.planId) router.push(`/workout/plans/${r.planId}`);
    },
    onError: (err) => {
      const planId =
        err instanceof ApiError && err.isConflict
          ? (err.body as { planId?: string } | undefined)?.planId
          : undefined;
      if (planId) {
        toast.show({ message: 'Você já adotou este plano.' });
        router.push(`/workout/plans/${planId}`);
        return;
      }
      toast.show({ message: apiMessage(err, 'Não deu para adotar agora.') });
    },
  });

  if (modelo.isPending) {
    return (
      <Screen>
        <LoadingState label="Carregando o plano…" />
      </Screen>
    );
  }
  if (!modelo.data) {
    return (
      <Screen>
        <View className="px-5 pt-4">
          <EmptyState
            title="Plano indisponível"
            description="A equipe tirou este plano do ar, ou o endereço está errado."
          />
        </View>
      </Screen>
    );
  }
  const t = modelo.data;

  return (
    <Screen
      title={t.title}
      onRefresh={() => void modelo.refetch()}
      refreshing={modelo.isRefetching}
    >
      <View className="gap-4 px-5 pb-6 pt-4">
        {t.cover?.url ? (
          <Image
            source={{ uri: t.cover.url }}
            accessibilityIgnoresInvertColors
            className="aspect-video w-full rounded-2xl"
          />
        ) : null}
        <View className="gap-1">
          <Text className="text-xs text-muted-foreground">{planTemplateSummary(t)}</Text>
          <Text className="text-xs text-muted-foreground">{`Por ${t.authorName}`}</Text>
        </View>
        {t.description ? <Text className="text-sm text-foreground">{t.description}</Text> : null}

        {t.kind === 'WORKOUT' ? (
          <View className="overflow-hidden rounded-2xl border border-border bg-card">
            {t.exercises.map((e, i) => (
              <View key={i} className={cn(i < t.exercises.length - 1 && 'border-b border-border')}>
                <Linha
                  esquerda={`${i + 1}. ${e.name}`}
                  direita={`${e.targetSets} × ${e.targetReps || '—'}`}
                />
              </View>
            ))}
          </View>
        ) : (
          <>
            {t.goals ? (
              <View className="flex-row flex-wrap gap-2">
                {nutritionDiff(null, t.goals).map((l) => (
                  <View
                    key={l.label}
                    className="min-w-[45%] flex-1 rounded-xl border border-border bg-card p-3"
                  >
                    <Text className="text-xs text-muted-foreground">{l.label}</Text>
                    <Text className="text-sm font-medium text-foreground">{l.next}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {t.meals.map((m, i) => (
              <View key={i} className="gap-1 rounded-2xl border border-border bg-card p-3">
                <View className="flex-row justify-between gap-3">
                  <Text className="flex-1 text-sm font-medium text-foreground">{m.name}</Text>
                  <Text className="text-sm text-muted-foreground">{`${m.kcal} kcal`}</Text>
                </View>
                <Text className="text-xs text-muted-foreground">
                  {m.items.map((it) => `${it.foodName} (${Math.round(it.grams)} g)`).join(', ')}
                </Text>
              </View>
            ))}
          </>
        )}

        {escolhendo && t.kind === 'NUTRITION' ? (
          <AdotarNutricao
            t={t}
            pending={adotar.isPending}
            onConfirm={(i) => adotar.mutate(i)}
            onCancel={() => setEscolhendo(false)}
          />
        ) : t.adoptedPlanId ? (
          <Button onPress={() => router.push(`/workout/plans/${t.adoptedPlanId}`)}>
            Abrir meu plano
          </Button>
        ) : (
          <Button
            loading={adotar.isPending}
            onPress={() => (t.kind === 'WORKOUT' ? adotar.mutate({}) : setEscolhendo(true))}
          >
            Adotar plano
          </Button>
        )}
        <Text className="text-center text-xs text-muted-foreground">
          Uma cópia vai para a sua conta e é sua: muda só quando você mudar.
        </Text>
      </View>
    </Screen>
  );
}
