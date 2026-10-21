import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  contentApi,
  goalsProblem,
  MAX_SUGGESTED_MEALS,
  nutritionApi,
  PLAN_LEVEL_LABEL,
  PLAN_LEVELS,
  TEMPLATE_KIND_LABEL,
  workoutApi,
  type MyGroup,
  type NutritionGoalsInput,
  type PlanLevel,
  type PlanTemplate,
  type TemplateKind,
} from '@fatia/api-client';
import { Download } from 'lucide-react-native';
import {
  CheckableRow,
  DeleteButton,
  IconLabel,
  PublishCard,
} from '@/components/content/content-ui';
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { apiMessage, Choice, OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

type GoalsForm = Record<keyof NutritionGoalsInput, string>;

const GOAL_ROWS: [string, keyof NutritionGoalsInput, keyof NutritionGoalsInput, string][] = [
  ['Calorias', 'kcalMin', 'kcalMax', 'kcal'],
  ['Proteína', 'proteinMinG', 'proteinMaxG', 'g'],
  ['Carboidrato', 'carbsMinG', 'carbsMaxG', 'g'],
  ['Gordura', 'fatMinG', 'fatMaxG', 'g'],
];

const goalsToForm = (g: NutritionGoalsInput | null | undefined): GoalsForm =>
  Object.fromEntries(
    GOAL_ROWS.flatMap(([, min, max]) => [
      [min, g ? String(g[min]) : ''],
      [max, g ? String(g[max]) : ''],
    ]),
  ) as GoalsForm;

const formToGoals = (f: GoalsForm) =>
  Object.fromEntries(
    Object.entries(f).map(([k, v]) => [k, v.trim() === '' ? null : Number(v)]),
  ) as Partial<Record<keyof NutritionGoalsInput, number | null>>;

function Editor({
  g,
  kind,
  template,
}: {
  g: MyGroup;
  kind: TemplateKind;
  template: PlanTemplate | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const editavel = template === null || template.canEdit !== false;

  const [titulo, setTitulo] = useState(template?.title ?? '');
  const [descricao, setDescricao] = useState(template?.description ?? '');
  const [nivel, setNivel] = useState<PlanLevel | 'none'>(template?.level ?? 'none');
  const [capa, setCapa] = useState<ImageValue | null>(
    template?.cover ? { fileId: template.cover.id, url: template.cover.url } : null,
  );
  const [planoFonte, setPlanoFonte] = useState(template?.sourcePlanId ?? '');
  const [comMetas, setComMetas] = useState(template === null || template.goals !== null);
  const [metas, setMetas] = useState<GoalsForm>(goalsToForm(template?.goals));
  const [refeicoes, setRefeicoes] = useState<string[]>([]);

  // O que está na tela, comparado com o que foi salvo por último: liga o
  // "Salvar" só quando há o que salvar, e segura "Publicar" até salvar.
  const snapshot = JSON.stringify([
    titulo,
    descricao,
    nivel,
    capa?.fileId,
    planoFonte,
    comMetas,
    metas,
    refeicoes,
  ]);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot);
  const dirty = snapshot !== savedSnapshot;

  const meusPlanos = useQuery({
    queryKey: ['workout', 'plans'],
    queryFn: () => workoutApi.listPlans(),
    enabled: kind === 'WORKOUT' && editavel,
  });
  const minhasRefeicoes = useQuery({
    queryKey: ['nutrition', 'meal-templates'],
    queryFn: () => nutritionApi.mealTemplates(),
    enabled: kind === 'NUTRITION' && editavel,
  });
  const invalidar = () => qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });

  function problema(): string | null {
    if (kind === 'WORKOUT' && template === null && !planoFonte) {
      return 'Escolha um dos seus planos de treino.';
    }
    if (kind === 'NUTRITION') {
      if (!titulo.trim()) return 'Dê um título ao plano.';
      if (comMetas) {
        const p = goalsProblem(formToGoals(metas));
        if (p) return p;
      }
      if (!comMetas && !refeicoes.length && !(template?.meals.length ?? 0)) {
        return 'Inclua metas ou ao menos uma refeição salva.';
      }
    }
    return null;
  }

  const salvar = useMutation({
    // O retrato vai como variável para marcar como salvo o que foi enviado, e
    // não o que a pessoa digitou enquanto a resposta não chegava.
    mutationFn: async (_saved: string) => {
      const meta = {
        title: titulo.trim() || undefined,
        description: descricao.trim() || null,
        level: nivel === 'none' ? null : nivel,
        coverFileId: capa?.fileId ?? null,
      };
      if (kind === 'WORKOUT') {
        if (template === null)
          return contentApi.createWorkout(g.id, { ...meta, planId: planoFonte });
        return contentApi.updatePlan(g.id, template.id, {
          ...meta,
          ...(planoFonte && planoFonte !== template.sourcePlanId ? { planId: planoFonte } : {}),
        });
      }
      const nutricao = {
        ...meta,
        title: titulo.trim(),
        goals: comMetas ? (formToGoals(metas) as NutritionGoalsInput) : null,
        ...(refeicoes.length ? { mealTemplateIds: refeicoes } : {}),
      };
      return template === null
        ? contentApi.createNutrition(g.id, nutricao)
        : contentApi.updatePlan(g.id, template.id, nutricao);
    },
    onSuccess: (t, saved) => {
      setSavedSnapshot(saved);
      toast.show({
        message:
          template === null ? 'Rascunho criado. Publique quando estiver pronto.' : 'Plano salvo.',
      });
      void invalidar();
      if (template === null) router.replace(`/org/${g.id}/content/plans/${t.id}`);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para salvar agora.') }),
  });
  const publicar = useMutation({
    mutationFn: (published: boolean) => contentApi.publishPlan(g.id, template!.id, published),
    onSuccess: (t) => {
      toast.show({
        message: t.publishedAt
          ? 'Publicado para os membros.'
          : 'Saiu do ar. Quem já adotou continua com a cópia.',
      });
      void invalidar();
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para mudar agora.') }),
  });
  const apagar = useMutation({
    mutationFn: () => contentApi.deletePlan(g.id, template!.id),
    onSuccess: () => {
      toast.show({ message: 'Plano apagado. As cópias de quem adotou continuam.' });
      void invalidar();
      // Voltar, e não empilhar outra lista por cima da que já está atrás.
      if (router.canGoBack()) router.back();
      else router.replace(`/org/${g.id}/content`);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para apagar agora.') }),
  });

  return (
    <>
      {template ? (
        <PublishCard
          published={Boolean(template.publishedAt)}
          authorName={template.authorName}
          canEdit={editavel}
          dirty={dirty}
          loading={publicar.isPending}
          publishedHint="Os membros veem e podem adotar. Mudanças salvas valem para quem adotar daqui em diante."
          draftHint="Só a equipe vê. Publique quando estiver pronto."
          onPublish={() => publicar.mutate(true)}
          onUnpublish={() =>
            Alert.alert(
              'Tirar este plano do ar?',
              'Ele some para os membros. Quem já adotou continua com a cópia.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Tirar do ar',
                  style: 'destructive',
                  onPress: () => publicar.mutate(false),
                },
              ],
            )
          }
        />
      ) : null}
      {!editavel ? (
        <Text className="rounded-xl bg-muted p-3 text-sm text-foreground">
          Só quem publicou, ou o dono, muda este plano.
        </Text>
      ) : null}

      <PanelCard
        title={template ? 'Plano' : `Novo plano de ${TEMPLATE_KIND_LABEL[kind].toLowerCase()}`}
      >
        <Input
          value={titulo}
          onChangeText={setTitulo}
          editable={editavel}
          maxLength={100}
          accessibilityLabel="Título"
          placeholder={kind === 'WORKOUT' ? 'Título (vazio usa o nome do plano)' : 'Título'}
        />
        <Input
          value={descricao}
          onChangeText={setDescricao}
          editable={editavel}
          maxLength={1000}
          multiline
          className="min-h-[80px]"
          textAlignVertical="top"
          accessibilityLabel="Descrição"
          placeholder="Para quem é, quantas vezes por semana"
        />
        {editavel ? (
          <Choice
            label="Nível"
            options={[
              { value: 'none' as const, label: 'Sem nível' },
              ...PLAN_LEVELS.map((l) => ({ value: l, label: PLAN_LEVEL_LABEL[l] })),
            ]}
            value={nivel}
            onChange={setNivel}
          />
        ) : null}
        {editavel ? (
          <ImageField groupId={g.id} label="Capa" value={capa} onChange={setCapa} />
        ) : null}
      </PanelCard>

      {kind === 'WORKOUT' ? (
        <PanelCard title="Exercícios">
          {editavel ? (
            meusPlanos.data?.length === 0 ? (
              <View className="gap-2">
                <Text className="text-sm text-muted-foreground">
                  Você ainda não tem planos de treino. Monte um em Treino e volte para publicar.
                </Text>
                <Button
                  variant="outline"
                  className="self-start"
                  onPress={() => router.push('/workout/plans')}
                >
                  Ir para Treino
                </Button>
              </View>
            ) : (
              <View
                className="gap-2"
                accessibilityRole="radiogroup"
                accessibilityLabel="A partir do seu plano"
              >
                <Text className="text-xs text-muted-foreground">
                  {template
                    ? 'A partir do seu plano. Trocar substitui os exercícios ao salvar.'
                    : 'A partir do seu plano'}
                </Text>
                {(meusPlanos.data ?? []).map((p) => (
                  <CheckableRow
                    key={p.id}
                    role="radio"
                    label={p.name}
                    detail={`${p.exercises.length} exercícios`}
                    checked={planoFonte === p.id}
                    onPress={() => setPlanoFonte(p.id)}
                  />
                ))}
              </View>
            )
          ) : null}
          {template ? (
            <Text className="pt-1 text-xs text-muted-foreground">
              {editavel ? 'Exercícios publicados agora' : 'Exercícios'}
            </Text>
          ) : null}
          {template
            ? template.exercises.map((e, i) => (
                <View key={i} className="flex-row justify-between gap-3">
                  <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                    {`${i + 1}. ${e.name}`}
                  </Text>
                  <Text className="text-sm text-muted-foreground">{`${e.targetSets} × ${e.targetReps || '—'}`}</Text>
                </View>
              ))
            : null}
        </PanelCard>
      ) : (
        <>
          <PanelCard title="Metas diárias">
            {editavel ? (
              <View className="gap-2">
                <CheckableRow
                  role="checkbox"
                  label="Incluir metas de calorias e macros"
                  checked={comMetas}
                  onPress={() => setComMetas(!comMetas)}
                />
                {/* Contorno com ícone: o `ghost` de antes era texto solto, e o toque
                    sobrescreve os seis campos abaixo — tem que parecer ação. */}
                <Button
                  size="sm"
                  variant="outline"
                  className="self-start"
                  accessibilityLabel="Preencher com as minhas metas"
                  onPress={async () => {
                    const minhas = await nutritionApi.goals().catch(() => null);
                    if (!minhas) {
                      toast.show({ message: 'Você ainda não tem metas definidas.' });
                      return;
                    }
                    setComMetas(true);
                    setMetas(goalsToForm(minhas));
                  }}
                >
                  <IconLabel icon={Download} label="Preencher com as minhas metas" />
                </Button>
              </View>
            ) : null}
            {comMetas
              ? GOAL_ROWS.map(([rotulo, min, max, unidade]) => (
                  <View key={min} className="gap-1">
                    <Text className="text-xs text-muted-foreground">{`${rotulo} (${unidade})`}</Text>
                    <View className="flex-row items-center gap-2">
                      <Input
                        className="flex-1"
                        keyboardType="number-pad"
                        editable={editavel}
                        accessibilityLabel={`${rotulo} mínimo`}
                        value={metas[min]}
                        onChangeText={(v) => setMetas({ ...metas, [min]: v })}
                      />
                      <Text className="text-foreground">–</Text>
                      <Input
                        className="flex-1"
                        keyboardType="number-pad"
                        editable={editavel}
                        accessibilityLabel={`${rotulo} máximo`}
                        value={metas[max]}
                        onChangeText={(v) => setMetas({ ...metas, [max]: v })}
                      />
                    </View>
                  </View>
                ))
              : null}
          </PanelCard>
          <PanelCard title="Refeições sugeridas">
            {template?.meals.map((m, i) => (
              <View key={i} className="flex-row justify-between gap-3">
                <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
                  {m.name}
                </Text>
                <Text className="text-sm text-muted-foreground">{`${m.kcal} kcal`}</Text>
              </View>
            ))}
            {editavel ? (
              <View className="gap-2">
                <Text className="text-xs text-muted-foreground">
                  {template
                    ? 'Para trocar as refeições, marque as refeições salvas que entram no lugar.'
                    : `Escolha até ${MAX_SUGGESTED_MEALS} das suas refeições salvas.`}
                </Text>
                {minhasRefeicoes.data?.length === 0 ? (
                  <Text className="text-sm text-muted-foreground">
                    Você ainda não tem refeições salvas. Salve uma em Nutrição e volte aqui.
                  </Text>
                ) : null}
                {(minhasRefeicoes.data ?? []).map((m) => {
                  const marcada = refeicoes.includes(m.id);
                  return (
                    <CheckableRow
                      key={m.id}
                      role="checkbox"
                      label={m.name}
                      detail={`${Math.round(m.items.reduce((s, i) => s + i.kcal, 0))} kcal`}
                      checked={marcada}
                      disabled={!marcada && refeicoes.length >= MAX_SUGGESTED_MEALS}
                      onPress={() =>
                        setRefeicoes(
                          marcada ? refeicoes.filter((id) => id !== m.id) : [...refeicoes, m.id],
                        )
                      }
                    />
                  );
                })}
              </View>
            ) : null}
          </PanelCard>
        </>
      )}

      {editavel ? (
        <View className="gap-6">
          <Button
            loading={salvar.isPending}
            disabled={template !== null && !dirty}
            onPress={() => {
              const p = problema();
              if (p) toast.show({ message: p });
              else salvar.mutate(snapshot);
            }}
          >
            {template === null ? 'Criar rascunho' : dirty ? 'Salvar mudanças' : 'Tudo salvo'}
          </Button>
          {/* Longe do "Salvar", com cor e ícone de perigo: antes era um "Apagar"
              em texto branco colado nele. */}
          {template ? (
            <DeleteButton
              label="Apagar plano"
              loading={apagar.isPending}
              onPress={() =>
                Alert.alert(
                  'Apagar este plano?',
                  'Ele some para os membros. Quem já adotou continua com a cópia.',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Apagar', style: 'destructive', onPress: () => apagar.mutate() },
                  ],
                )
              }
            />
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function Carregar({ g, templateId, kind }: { g: MyGroup; templateId: string; kind: TemplateKind }) {
  const novo = templateId === 'new';
  const atual = useQuery({
    queryKey: orgKeys.contentPlan(g.id, templateId),
    queryFn: () => contentApi.plan(g.id, templateId),
    enabled: !novo,
  });
  if (novo) return <Editor key="new" g={g} kind={kind} template={null} />;
  if (atual.isPending) return <LoadingState label="Carregando o plano…" />;
  if (!atual.data) {
    return (
      <EmptyState
        title="Plano não encontrado"
        description="Ele foi apagado, ou o endereço está errado."
      />
    );
  }
  return <Editor key={atual.data.id} g={g} kind={atual.data.kind} template={atual.data} />;
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/content/plans/[templateId]/page.tsx`. */
export default function OrgPlanTemplateScreen() {
  const { groupId, templateId, kind } = useLocalSearchParams<{
    groupId: string;
    templateId: string;
    kind?: string;
  }>();
  return (
    <OrgPanel groupId={groupId}>
      {(g) => (
        <Carregar
          g={g}
          templateId={templateId}
          kind={kind === 'NUTRITION' ? 'NUTRITION' : 'WORKOUT'}
        />
      )}
    </OrgPanel>
  );
}
