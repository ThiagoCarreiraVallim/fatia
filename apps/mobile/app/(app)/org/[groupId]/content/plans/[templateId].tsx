import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
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
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { apiMessage, Choice, OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState, cn } from '@/components/ui';
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

/** Linha marcável (radio ou checkbox) com 44 pt de altura. */
function Marcavel({
  label,
  detalhe,
  marcada,
  papel,
  desabilitada,
  onPress,
}: {
  label: string;
  detalhe?: string;
  marcada: boolean;
  papel: 'radio' | 'checkbox';
  desabilitada?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={papel}
      accessibilityState={{ checked: marcada, disabled: desabilitada }}
      accessibilityLabel={detalhe ? `${label}, ${detalhe}` : label}
      disabled={desabilitada}
      onPress={onPress}
      className={cn(
        'min-h-[44px] flex-row items-center gap-3 rounded-xl border px-3 py-2 active:opacity-80',
        marcada ? 'border-primary bg-primary/10' : 'border-border',
        desabilitada && 'opacity-50',
      )}
    >
      <View
        className={cn(
          'h-4 w-4 border-2',
          papel === 'radio' ? 'rounded-full' : 'rounded',
          marcada ? 'border-primary bg-primary' : 'border-muted-foreground',
        )}
      />
      <Text className="flex-1 text-sm text-foreground" numberOfLines={1}>
        {label}
      </Text>
      {detalhe ? <Text className="text-xs text-muted-foreground">{detalhe}</Text> : null}
    </Pressable>
  );
}

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
    mutationFn: async () => {
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
    onSuccess: (t) => {
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
      router.replace(`/org/${g.id}/content`);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para apagar agora.') }),
  });

  return (
    <>
      {template ? (
        <Text className="text-xs text-muted-foreground">
          {`${template.publishedAt ? 'Publicado' : 'Rascunho'} · por ${template.authorName}`}
        </Text>
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
              <Text className="text-sm text-muted-foreground">
                Você ainda não tem planos de treino. Monte um em Treino e volte para publicar.
              </Text>
            ) : (
              <View
                className="gap-2"
                accessibilityRole="radiogroup"
                accessibilityLabel="A partir do seu plano"
              >
                <Text className="text-xs text-muted-foreground">A partir do seu plano</Text>
                {(meusPlanos.data ?? []).map((p) => (
                  <Marcavel
                    key={p.id}
                    papel="radio"
                    label={p.name}
                    detalhe={`${p.exercises.length} exercícios`}
                    marcada={planoFonte === p.id}
                    onPress={() => setPlanoFonte(p.id)}
                  />
                ))}
              </View>
            )
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
              <View className="flex-row flex-wrap gap-2">
                <Marcavel
                  papel="checkbox"
                  label="Incluir metas de calorias e macros"
                  marcada={comMetas}
                  onPress={() => setComMetas(!comMetas)}
                />
                <Button
                  size="sm"
                  variant="ghost"
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
                  Usar as minhas metas
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
                {(minhasRefeicoes.data ?? []).map((m) => {
                  const marcada = refeicoes.includes(m.id);
                  return (
                    <Marcavel
                      key={m.id}
                      papel="checkbox"
                      label={m.name}
                      detalhe={`${Math.round(m.items.reduce((s, i) => s + i.kcal, 0))} kcal`}
                      marcada={marcada}
                      desabilitada={!marcada && refeicoes.length >= MAX_SUGGESTED_MEALS}
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
        <View className="gap-2">
          <Button
            loading={salvar.isPending}
            onPress={() => {
              const p = problema();
              if (p) toast.show({ message: p });
              else salvar.mutate();
            }}
          >
            {template === null ? 'Criar rascunho' : 'Salvar'}
          </Button>
          {template ? (
            <Button
              variant="outline"
              loading={publicar.isPending}
              onPress={() => publicar.mutate(!template.publishedAt)}
            >
              {template.publishedAt ? 'Tirar do ar' : 'Publicar'}
            </Button>
          ) : null}
          {template ? (
            <Button
              variant="ghost"
              onPress={() =>
                Alert.alert(
                  'Apagar este plano?',
                  'Ele some para os membros. Quem já adotou continua com a cópia.',
                  [
                    { text: 'Voltar', style: 'cancel' },
                    { text: 'Apagar', style: 'destructive', onPress: () => apagar.mutate() },
                  ],
                )
              }
            >
              Apagar
            </Button>
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
