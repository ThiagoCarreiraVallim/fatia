'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ApiError,
  contentApi,
  goalsProblem,
  MAX_SUGGESTED_MEALS,
  nutritionApi,
  PLAN_LEVEL_LABEL,
  PLAN_LEVELS,
  TEMPLATE_KIND_LABEL,
  workoutApi,
  type NutritionGoalsInput,
  type PlanLevel,
  type PlanTemplate,
  type TemplateKind,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

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

const formToGoals = (f: GoalsForm): Partial<Record<keyof NutritionGoalsInput, number | null>> =>
  Object.fromEntries(
    Object.entries(f).map(([k, v]) => [k, v.trim() === '' ? null : Number(v)]),
  ) as Partial<Record<keyof NutritionGoalsInput, number | null>>;

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
}

/** Abre o editor de um plano existente, ou o formulário de um novo (`/new?kind=`). */
export default function OrgPlanTemplatePage() {
  const g = useOrgGroup();
  const { templateId } = useParams<{ templateId: string }>();
  const search = useSearchParams();
  const novo = templateId === 'new';
  const kind: TemplateKind = search.get('kind') === 'NUTRITION' ? 'NUTRITION' : 'WORKOUT';

  const atual = useQuery({
    queryKey: orgKeys.contentPlan(g.id, templateId),
    queryFn: () => contentApi.plan(g.id, templateId),
    enabled: !novo,
  });

  if (novo) return <PlanEditor key="new" groupId={g.id} kind={kind} template={null} />;
  if (atual.isPending) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
  if (!atual.data) {
    return (
      <EmptyState
        title="Plano não encontrado"
        description="Ele foi apagado, ou o endereço está errado."
      />
    );
  }
  return (
    <PlanEditor key={atual.data.id} groupId={g.id} kind={atual.data.kind} template={atual.data} />
  );
}

function PlanEditor({
  groupId,
  kind,
  template,
}: {
  groupId: string;
  kind: TemplateKind;
  template: PlanTemplate | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const editavel = template === null || template.canEdit !== false;
  useTopBarTitle(template?.title ?? `Novo plano de ${TEMPLATE_KIND_LABEL[kind].toLowerCase()}`);

  const [titulo, setTitulo] = useState(template?.title ?? '');
  const [descricao, setDescricao] = useState(template?.description ?? '');
  const [nivel, setNivel] = useState<PlanLevel | 'none'>(template?.level ?? 'none');
  const [capa, setCapa] = useState<ImageValue | null>(
    template?.cover ? { fileId: template.cover.id, url: template.cover.url } : null,
  );
  const [planoFonte, setPlanoFonte] = useState(template?.sourcePlanId ?? '');
  // Plano novo começa com metas; o existente, como foi publicado.
  const [comMetas, setComMetas] = useState(template === null || template.goals !== null);
  const [metas, setMetas] = useState<GoalsForm>(goalsToForm(template?.goals));
  const [refeicoes, setRefeicoes] = useState<string[]>([]);
  const [apagando, setApagando] = useState(false);

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

  const invalidar = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });

  function montar() {
    const meta = {
      title: titulo.trim(),
      description: descricao.trim() || null,
      level: nivel === 'none' ? null : nivel,
      coverFileId: capa?.fileId ?? null,
    };
    if (kind === 'WORKOUT') return { ...meta, planId: planoFonte || undefined };
    const goals = comMetas ? (formToGoals(metas) as NutritionGoalsInput) : null;
    return {
      ...meta,
      goals,
      ...(refeicoes.length ? { mealTemplateIds: refeicoes } : {}),
    };
  }

  function problema(): string | null {
    if (!titulo.trim() && !(kind === 'WORKOUT' && template === null))
      return 'Dê um título ao plano.';
    if (kind === 'WORKOUT' && template === null && !planoFonte) {
      return 'Escolha um dos seus planos de treino.';
    }
    if (kind === 'NUTRITION') {
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
      const corpo = montar();
      if (template === null) {
        return kind === 'WORKOUT'
          ? contentApi.createWorkout(groupId, {
              ...corpo,
              title: corpo.title || undefined,
              planId: planoFonte,
            })
          : contentApi.createNutrition(groupId, { ...corpo, title: corpo.title });
      }
      // O retrato do treino só é refeito quando o plano de origem muda.
      const { planId, ...resto } = corpo as typeof corpo & { planId?: string };
      return contentApi.updatePlan(groupId, template.id, {
        ...resto,
        ...(planId && planId !== template.sourcePlanId ? { planId } : {}),
      });
    },
    onSuccess: (t) => {
      toast(
        template === null ? 'Rascunho criado. Publique quando estiver pronto.' : 'Plano salvo.',
      );
      void invalidar();
      if (template === null) router.replace(`/org/${groupId}/content/plans/${t.id}`);
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para salvar agora.')),
  });

  const refazer = useMutation({
    mutationFn: () => contentApi.updatePlan(groupId, template!.id, { planId: planoFonte }),
    onSuccess: () => {
      toast('Exercícios atualizados a partir do seu plano.');
      void invalidar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para atualizar agora.')),
  });

  const publicar = useMutation({
    mutationFn: (published: boolean) => contentApi.publishPlan(groupId, template!.id, published),
    onSuccess: (t) => {
      toast(
        t.publishedAt
          ? 'Publicado para os membros.'
          : 'Saiu do ar. Quem já adotou continua com a cópia.',
      );
      void invalidar();
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para mudar agora.')),
  });

  const apagar = useMutation({
    mutationFn: () => contentApi.deletePlan(groupId, template!.id),
    onSuccess: () => {
      toast('Plano apagado. As cópias de quem adotou continuam.');
      void invalidar();
      router.replace(`/org/${groupId}/content`);
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para apagar agora.')),
  });

  const erro = problema();

  return (
    <div className="max-w-3xl space-y-4">
      {template && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={template.publishedAt ? 'default' : 'secondary'}>
            {template.publishedAt ? 'Publicado' : 'Rascunho'}
          </Badge>
          <span className="text-xs text-muted-foreground">Por {template.authorName}</span>
        </div>
      )}
      {!editavel && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Só quem publicou, ou o dono, muda este plano.
        </p>
      )}

      <form
        className="space-y-4"
        aria-label="Plano pronto"
        onSubmit={(e) => {
          e.preventDefault();
          if (erro) {
            toast(erro);
            return;
          }
          salvar.mutate();
        }}
      >
        <fieldset
          disabled={!editavel}
          className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
        >
          <legend className="sr-only">Dados do plano</legend>
          <div className="space-y-1">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              maxLength={100}
              placeholder={
                kind === 'WORKOUT'
                  ? 'Usa o nome do plano se ficar vazio'
                  : 'Ex.: Cutting 1.800 kcal'
              }
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              maxLength={1000}
              rows={3}
              placeholder="Para quem é, quantas vezes por semana, o que esperar."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nivel">Nível</Label>
            <Select value={nivel} onValueChange={(v) => setNivel(v as PlanLevel | 'none')}>
              <SelectTrigger id="nivel" className="w-full sm:w-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sem nível</SelectItem>
                {PLAN_LEVELS.map((l) => (
                  <SelectItem key={l} value={l}>
                    {PLAN_LEVEL_LABEL[l]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {editavel && (
            <ImageField groupId={groupId} label="Capa" value={capa} onChange={setCapa} />
          )}
        </fieldset>

        {kind === 'WORKOUT' ? (
          <section
            aria-labelledby="exercicios"
            className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
          >
            <h2 id="exercicios" className="text-sm font-semibold">
              Exercícios
            </h2>
            {editavel && (
              <div className="space-y-1">
                <Label htmlFor="fonte">A partir do seu plano</Label>
                {meusPlanos.data?.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Você ainda não tem planos de treino.{' '}
                    <Link href="/workout/plans" className="font-medium text-primary underline">
                      Monte um em Treino
                    </Link>{' '}
                    e volte para publicar.
                  </p>
                ) : (
                  <Select value={planoFonte} onValueChange={setPlanoFonte}>
                    <SelectTrigger id="fonte" className="w-full sm:w-80">
                      <SelectValue placeholder="Escolha um plano" />
                    </SelectTrigger>
                    <SelectContent>
                      {(meusPlanos.data ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {`${p.name} · ${p.exercises.length} exercícios`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-xs text-muted-foreground">
                  Os exercícios são copiados como estão agora. Mudar o seu plano depois não muda o
                  publicado, até você atualizar.
                </p>
              </div>
            )}
            {template && (
              <>
                <ol className="space-y-1.5" aria-label="Exercícios publicados">
                  {template.exercises.map((e, i) => (
                    <li key={i} className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">
                        {i + 1}. {e.name}
                      </span>
                      <span className="shrink-0 text-muted-foreground">
                        {e.targetSets} × {e.targetReps || '—'}
                      </span>
                    </li>
                  ))}
                </ol>
                {editavel && planoFonte && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={refazer.isPending}
                    onClick={() => refazer.mutate()}
                  >
                    Atualizar a partir do plano
                  </Button>
                )}
              </>
            )}
          </section>
        ) : (
          <>
            <section
              aria-labelledby="metas"
              className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="metas" className="text-sm font-semibold">
                  Metas diárias
                </h2>
                {editavel && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const minhas = await nutritionApi.goals().catch(() => null);
                      if (!minhas) {
                        toast('Você ainda não tem metas definidas.');
                        return;
                      }
                      setComMetas(true);
                      setMetas(goalsToForm(minhas));
                    }}
                  >
                    Usar as minhas metas
                  </Button>
                )}
              </div>
              <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={comMetas}
                  disabled={!editavel}
                  onChange={(e) => setComMetas(e.target.checked)}
                />
                Incluir metas de calorias e macros
              </label>
              {comMetas && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {GOAL_ROWS.map(([rotulo, min, max, unidade]) => (
                    <fieldset key={min} disabled={!editavel} className="space-y-1">
                      <legend className="text-sm font-medium">{`${rotulo} (${unidade})`}</legend>
                      <div className="flex items-center gap-2">
                        <Input
                          aria-label={`${rotulo} mínimo`}
                          inputMode="numeric"
                          value={metas[min]}
                          onChange={(e) => setMetas({ ...metas, [min]: e.target.value })}
                        />
                        <span aria-hidden>–</span>
                        <Input
                          aria-label={`${rotulo} máximo`}
                          inputMode="numeric"
                          value={metas[max]}
                          onChange={(e) => setMetas({ ...metas, [max]: e.target.value })}
                        />
                      </div>
                    </fieldset>
                  ))}
                </div>
              )}
            </section>

            <section
              aria-labelledby="refeicoes"
              className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
            >
              <h2 id="refeicoes" className="text-sm font-semibold">
                Refeições sugeridas
              </h2>
              {template && template.meals.length > 0 && (
                <ul className="space-y-1 text-sm" aria-label="Refeições publicadas">
                  {template.meals.map((m, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span className="truncate">{m.name}</span>
                      <span className="shrink-0 text-muted-foreground">{m.kcal} kcal</span>
                    </li>
                  ))}
                </ul>
              )}
              {editavel && (
                <fieldset className="space-y-2">
                  <legend className="text-xs text-muted-foreground">
                    {template
                      ? 'Para trocar as refeições, marque as refeições salvas que entram no lugar.'
                      : `Escolha até ${MAX_SUGGESTED_MEALS} das suas refeições salvas.`}
                  </legend>
                  {minhasRefeicoes.data?.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Você ainda não tem refeições salvas. Salve uma pelo menu de uma refeição em
                      Nutrição.
                    </p>
                  )}
                  <ul className="space-y-1">
                    {(minhasRefeicoes.data ?? []).map((m) => {
                      const marcada = refeicoes.includes(m.id);
                      return (
                        <li key={m.id}>
                          <label className="flex min-h-11 items-center gap-3 rounded-xl border border-subtle p-2 text-sm">
                            <input
                              type="checkbox"
                              className="h-4 w-4 accent-primary"
                              checked={marcada}
                              disabled={!marcada && refeicoes.length >= MAX_SUGGESTED_MEALS}
                              onChange={() =>
                                setRefeicoes(
                                  marcada
                                    ? refeicoes.filter((id) => id !== m.id)
                                    : [...refeicoes, m.id],
                                )
                              }
                            />
                            <span className="min-w-0 flex-1 truncate">{m.name}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {Math.round(m.items.reduce((s, i) => s + i.kcal, 0))} kcal
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              )}
            </section>
          </>
        )}

        {editavel && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={salvar.isPending}>
              {template === null ? 'Criar rascunho' : 'Salvar'}
            </Button>
            {template && (
              <Button
                type="button"
                variant="outline"
                disabled={publicar.isPending}
                onClick={() => publicar.mutate(!template.publishedAt)}
              >
                {template.publishedAt ? 'Tirar do ar' : 'Publicar'}
              </Button>
            )}
            {template && (
              <Button type="button" variant="ghost" onClick={() => setApagando(true)}>
                Apagar
              </Button>
            )}
            <Link href={`/org/${groupId}/content`} className={buttonVariants({ variant: 'ghost' })}>
              Voltar
            </Link>
          </div>
        )}
      </form>

      {template && (
        <ConfirmDialog
          open={apagando}
          onOpenChange={setApagando}
          title="Apagar este plano?"
          description="Ele some para os membros. Quem já adotou continua com a cópia dele."
          confirmLabel="Apagar"
          pendingLabel="Apagando..."
          pending={apagar.isPending}
          onConfirm={() => apagar.mutate()}
        />
      )}
    </div>
  );
}
