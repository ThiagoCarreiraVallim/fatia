import { useState } from 'react';
import { Image, Text, View } from 'react-native';
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
import { CheckableRow } from '@/components/content/content-ui';
import { Screen } from '@/components/layout/screen';
import { apiMessage } from '@/components/org/org-panel';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerLayer,
  DrawerTitle,
  EmptyState,
  LoadingState,
  cn,
} from '@/components/ui';
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

function SectionTitle({ children }: { children: string }) {
  return (
    <Text accessibilityRole="header" className="text-sm font-bold text-foreground">
      {children}
    </Text>
  );
}

/**
 * "O que entra na sua conta?" num drawer. Antes o cartão aparecia no fim da
 * página, no lugar do botão, depois de toda a lista de refeições — quem tocou
 * em "Adotar" no topo não via nada acontecer.
 */
function AdoptNutritionDrawer({
  t,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  t: PlanTemplate;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onConfirm: (i: AdoptInput) => void;
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
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>O que entra na sua conta?</DrawerTitle>
          <DrawerDescription>Marque o que quer levar deste plano.</DrawerDescription>
        </DrawerHeader>
        <View className="gap-2 px-4 pt-2">
          {t.meals.length > 0 ? (
            <CheckableRow
              role="checkbox"
              label="Salvar as refeições sugeridas"
              checked={refeicoes}
              onPress={() => setRefeicoes(!refeicoes)}
            >
              <Text className="pl-8 text-xs text-muted-foreground">
                {`${t.meals.length} ${t.meals.length === 1 ? 'refeição' : 'refeições'} em Refeições salvas.`}
              </Text>
            </CheckableRow>
          ) : null}
          {t.goals ? (
            <CheckableRow
              role="checkbox"
              label="Trocar minhas metas pelas do plano"
              checked={metas}
              onPress={() => setMetas(!metas)}
            >
              {diff.map((l) => (
                <View key={l.label} className="flex-row gap-2 pl-8">
                  <Text className="w-24 text-xs text-muted-foreground">{l.label}</Text>
                  <Text className="flex-1 text-xs text-foreground">{`${l.current} → `}</Text>
                  <Text className={cn('text-xs text-foreground', l.changed && 'font-bold')}>
                    {l.next}
                  </Text>
                </View>
              ))}
            </CheckableRow>
          ) : null}
        </View>
        <DrawerFooter className="flex-row pt-4">
          <Button variant="outline" className="flex-1" onPress={() => onOpenChange(false)}>
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
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
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

  // A ação principal logo depois da descrição, e não no fim de uma lista de
  // exercícios ou refeições que podia passar de uma tela.
  const acao = t.adoptedPlanId ? (
    <View className="gap-2">
      <Text className="text-sm text-foreground">Você já adotou este plano.</Text>
      <Button onPress={() => router.push(`/workout/plans/${t.adoptedPlanId}`)}>
        Abrir meu plano
      </Button>
    </View>
  ) : (
    <View className="gap-2">
      <Button
        loading={adotar.isPending && t.kind === 'WORKOUT'}
        onPress={() => (t.kind === 'WORKOUT' ? adotar.mutate({}) : setEscolhendo(true))}
      >
        Adotar plano
      </Button>
      <Text className="text-center text-xs text-muted-foreground">
        Uma cópia vai para a sua conta e é sua: muda só quando você mudar.
      </Text>
    </View>
  );

  return (
    <>
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
          {acao}

          {t.kind === 'WORKOUT' ? (
            <View className="gap-2">
              <SectionTitle>Exercícios</SectionTitle>
              <View className="overflow-hidden rounded-2xl border border-border bg-card">
                {t.exercises.map((e, i) => (
                  <View
                    key={i}
                    className={cn(i < t.exercises.length - 1 && 'border-b border-border')}
                  >
                    <Linha
                      esquerda={`${i + 1}. ${e.name}`}
                      direita={`${e.targetSets} × ${e.targetReps || '—'}`}
                    />
                  </View>
                ))}
              </View>
            </View>
          ) : (
            <>
              {t.goals ? (
                <View className="gap-2">
                  <SectionTitle>Metas diárias</SectionTitle>
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
                </View>
              ) : null}
              {t.meals.length ? (
                <View className="gap-2">
                  <SectionTitle>Refeições sugeridas</SectionTitle>
                  {t.meals.map((m, i) => (
                    <View key={i} className="gap-1 rounded-2xl border border-border bg-card p-3">
                      <View className="flex-row justify-between gap-3">
                        <Text className="flex-1 text-sm font-medium text-foreground">{m.name}</Text>
                        <Text className="text-sm text-muted-foreground">{`${m.kcal} kcal`}</Text>
                      </View>
                      <Text className="text-xs text-muted-foreground">
                        {m.items
                          .map((it) => `${it.foodName} (${Math.round(it.grams)} g)`)
                          .join(', ')}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>
      </Screen>
      {t.kind === 'NUTRITION' ? (
        <DrawerLayer>
          <AdoptNutritionDrawer
            t={t}
            open={escolhendo}
            onOpenChange={setEscolhendo}
            pending={adotar.isPending}
            onConfirm={(i) => adotar.mutate(i)}
          />
        </DrawerLayer>
      ) : null}
    </>
  );
}
