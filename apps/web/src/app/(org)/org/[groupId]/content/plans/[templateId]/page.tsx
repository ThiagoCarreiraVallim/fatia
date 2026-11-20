'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download } from 'lucide-react';
import {
  ApiError,
  contentApi,
  goalsProblem,
  MAX_SUGGESTED_MEALS,
  nutritionApi,
  PLAN_LEVEL_LABEL,
  PLAN_LEVELS,
  TEMPLATE_KIND_LABEL,
  type NutritionGoalsInput,
  type PlanLevel,
  type PlanTemplate,
  type TemplateKind,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { CheckableRow, DeleteButton, PublishCard } from '@/components/content/content-ui';
import { WorkoutTemplateEditor } from '@/components/org/plan-editor/workout-template-editor';
import { ImageField, type ImageValue } from '@/components/content/image-field';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { useOrgGroup } from '@/components/org/org-shell';
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
import { Switch } from '@/components/ui/selection';
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

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/** Abre o editor de um plano existente, ou o formulário de um novo (`/new?kind=`). */
export default function OrgPlanTemplatePage() {
  const g = useOrgGroup();
  const { templateId } = useParams<{ templateId: string }>();
  const search = useSearchParams();
  const isNew = templateId === 'new';
  const kind: TemplateKind = search.get('kind') === 'NUTRITION' ? 'NUTRITION' : 'WORKOUT';

  const current = useQuery({
    queryKey: orgKeys.contentPlan(g.id, templateId),
    queryFn: () => contentApi.plan(g.id, templateId),
    enabled: !isNew,
  });

  if (isNew) {
    return kind === 'WORKOUT' ? (
      <WorkoutTemplateEditor key="new" groupId={g.id} template={null} />
    ) : (
      <PlanEditor key="new" groupId={g.id} template={null} />
    );
  }
  if (current.isPending) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
  if (!current.data) {
    return (
      <EmptyState
        title="Plano não encontrado"
        description="Ele foi apagado, ou o endereço está errado."
      />
    );
  }
  // O treino tem o editor de sessões (#406); a alimentação segue neste.
  if (current.data.kind === 'WORKOUT') {
    return <WorkoutTemplateEditor key={current.data.id} groupId={g.id} template={current.data} />;
  }
  return <PlanEditor key={current.data.id} groupId={g.id} template={current.data} />;
}

/** O editor do plano alimentar. */
function PlanEditor({ groupId, template }: { groupId: string; template: PlanTemplate | null }) {
  const kind: TemplateKind = 'NUTRITION';
  const router = useRouter();
  const qc = useQueryClient();
  const canEdit = template === null || template.canEdit !== false;
  useTopBarTitle(template?.title ?? `Novo plano de ${TEMPLATE_KIND_LABEL[kind].toLowerCase()}`);

  const [title, setTitle] = useState(template?.title ?? '');
  const [description, setDescription] = useState(template?.description ?? '');
  const [level, setLevel] = useState<PlanLevel | 'none'>(template?.level ?? 'none');
  const [cover, setCover] = useState<ImageValue | null>(
    template?.cover ? { fileId: template.cover.id, url: template.cover.url } : null,
  );
  // Plano novo começa com metas; o existente, como foi publicado.
  const [withGoals, setWithGoals] = useState(template === null || template.goals !== null);
  const [goals, setGoals] = useState<GoalsForm>(goalsToForm(template?.goals));
  const [mealIds, setMealIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [unpublishing, setUnpublishing] = useState(false);

  // O que está na tela, comparado com o que foi salvo por último: liga o
  // "Salvar" só quando há o que salvar, e segura "Publicar" até salvar —
  // publicar manda a versão salva, não a da tela.
  const form = {
    title,
    description,
    level,
    cover: cover?.fileId,
    withGoals,
    goals,
    mealIds,
  };
  const [saved, setSaved] = useState(form);
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const myMeals = useQuery({
    queryKey: ['nutrition', 'meal-templates'],
    queryFn: () => nutritionApi.mealTemplates(),
    enabled: canEdit,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });

  function buildBody() {
    const meta = {
      title: title.trim(),
      description: description.trim() || null,
      level: level === 'none' ? null : level,
      coverFileId: cover?.fileId ?? null,
    };
    return {
      ...meta,
      goals: withGoals ? (formToGoals(goals) as NutritionGoalsInput) : null,
      ...(mealIds.length ? { mealTemplateIds: mealIds } : {}),
    };
  }

  function problem(): string | null {
    if (!title.trim()) return 'Dê um título ao plano.';
    if (withGoals) {
      const p = goalsProblem(formToGoals(goals));
      if (p) return p;
    }
    if (!withGoals && !mealIds.length && !(template?.meals.length ?? 0)) {
      return 'Inclua metas ou ao menos uma refeição salva.';
    }
    return null;
  }

  const save = useMutation({
    // O retrato vai como variável para marcar como salvo o que foi enviado, e
    // não o que a pessoa digitou enquanto a resposta não chegava.
    mutationFn: async (_sent: typeof form) => {
      const body = buildBody();
      if (template === null) {
        return contentApi.createNutrition(groupId, { ...body, title: body.title });
      }
      return contentApi.updatePlan(groupId, template.id, body);
    },
    onSuccess: (t, sent) => {
      setSaved(sent);
      toast(
        template === null
          ? 'Plano criado. Já dá para enviar para alunos; a comunidade é à parte.'
          : 'Plano salvo.',
      );
      void invalidate();
      if (template === null) router.replace(`/org/${groupId}/content/plans/${t.id}`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar agora.')),
  });

  const publish = useMutation({
    mutationFn: (published: boolean) => contentApi.publishPlan(groupId, template!.id, published),
    onSuccess: (t) => {
      setUnpublishing(false);
      toast(
        t.publishedAt
          ? 'Publicado para os membros.'
          : 'Saiu do ar. Quem já adotou continua com a cópia.',
      );
      void invalidate();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para mudar agora.')),
  });

  // Rascunho (#405): não vai para alunos nem para a comunidade até terminar.
  const draft = useMutation({
    mutationFn: (on: boolean) => contentApi.updatePlan(groupId, template!.id, { draft: on }),
    onSuccess: (t) => {
      toast(
        t.draft
          ? 'Marcado como rascunho. Não se envia nem se publica até terminar.'
          : 'Rascunho terminado. Já dá para enviar e publicar.',
      );
      void invalidate();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para mudar agora.')),
  });

  const remove = useMutation({
    mutationFn: () => contentApi.deletePlan(groupId, template!.id),
    onSuccess: () => {
      toast('Plano apagado. As cópias de quem adotou continuam.');
      void invalidate();
      router.replace(`/org/${groupId}/content`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para apagar agora.')),
  });

  return (
    <div className="max-w-3xl space-y-4">
      {template && (
        <PublishCard
          published={Boolean(template.publishedAt)}
          authorName={template.authorName}
          canEdit={canEdit}
          dirty={dirty}
          pending={publish.isPending}
          publishedHint="Os membros veem e podem adotar. Mudanças salvas valem para quem adotar daqui em diante."
          draftHint="Só a equipe vê e envia para alunos. Publique se quiser que os membros adotem."
          onPublish={() => publish.mutate(true)}
          onUnpublish={() => setUnpublishing(true)}
          blockedReason={template.draft ? 'Termine o rascunho antes de publicar ou enviar.' : null}
        >
          {canEdit && !template.publishedAt && (
            <div className="flex items-start gap-3 border-t border-subtle pt-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Rascunho</span>
                <span className="block text-xs text-muted-foreground">
                  Enquanto for rascunho, não se envia para alunos nem vai para a comunidade.
                </span>
              </span>
              <Switch
                checked={template.draft === true}
                disabled={draft.isPending}
                onCheckedChange={(on) => draft.mutate(on)}
                label="Rascunho"
              />
            </div>
          )}
        </PublishCard>
      )}
      {!canEdit && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Só quem publicou, ou o dono, muda este plano.
        </p>
      )}

      <form
        className="space-y-4"
        aria-label="Plano pronto"
        onSubmit={(e) => {
          e.preventDefault();
          const p = problem();
          if (p) {
            toast(p);
            return;
          }
          save.mutate(form);
        }}
      >
        <fieldset
          disabled={!canEdit}
          aria-label="Dados do plano"
          className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
        >
          <div className="space-y-1">
            <Label htmlFor="titulo">Título</Label>
            <Input
              id="titulo"
              maxLength={100}
              placeholder="Ex.: Cutting 1.800 kcal"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="descricao">Descrição</Label>
            <Textarea
              id="descricao"
              maxLength={1000}
              rows={3}
              placeholder="Para quem é, quantas vezes por semana, o que esperar."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="nivel">Nível</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as PlanLevel | 'none')}>
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
          {canEdit && (
            <ImageField groupId={groupId} label="Capa" value={cover} onChange={setCover} />
          )}
        </fieldset>

        <>
          <section
            aria-labelledby="metas"
            className="space-y-3 rounded-2xl border border-subtle bg-card p-4"
          >
            <h2 id="metas" className="text-sm font-semibold">
              Metas diárias
            </h2>
            {canEdit && (
              <>
                <CheckableRow
                  role="checkbox"
                  label="Incluir metas de calorias e macros"
                  checked={withGoals}
                  onChange={() => setWithGoals(!withGoals)}
                />
                {/* Contorno com ícone: o `ghost` de antes era texto solto, e o
                      clique sobrescreve os oito campos abaixo — tem que parecer ação. */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const mine = await nutritionApi.goals().catch(() => null);
                    if (!mine) {
                      toast('Você ainda não tem metas definidas.');
                      return;
                    }
                    setWithGoals(true);
                    setGoals(goalsToForm(mine));
                  }}
                >
                  <Download aria-hidden />
                  Preencher com as minhas metas
                </Button>
              </>
            )}
            {withGoals && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {GOAL_ROWS.map(([label, min, max, unit]) => (
                  <fieldset key={min} disabled={!canEdit} className="space-y-1">
                    <legend className="text-sm font-medium">{`${label} (${unit})`}</legend>
                    <div className="flex items-center gap-2">
                      <Input
                        aria-label={`${label} mínimo`}
                        inputMode="numeric"
                        value={goals[min]}
                        onChange={(e) => setGoals({ ...goals, [min]: e.target.value })}
                      />
                      <span aria-hidden>–</span>
                      <Input
                        aria-label={`${label} máximo`}
                        inputMode="numeric"
                        value={goals[max]}
                        onChange={(e) => setGoals({ ...goals, [max]: e.target.value })}
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
            {canEdit && (
              <fieldset className="space-y-2">
                <legend className="pb-1 text-xs text-muted-foreground">
                  {template
                    ? 'Para trocar as refeições, marque as refeições salvas que entram no lugar.'
                    : `Escolha até ${MAX_SUGGESTED_MEALS} das suas refeições salvas.`}
                </legend>
                {myMeals.data?.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Você ainda não tem refeições salvas. Salve uma pelo menu de uma refeição em
                    Nutrição.
                  </p>
                )}
                {(myMeals.data ?? []).map((m) => {
                  const checked = mealIds.includes(m.id);
                  return (
                    <CheckableRow
                      key={m.id}
                      role="checkbox"
                      label={m.name}
                      detail={`${Math.round(m.items.reduce((s, i) => s + i.kcal, 0))} kcal`}
                      checked={checked}
                      disabled={!checked && mealIds.length >= MAX_SUGGESTED_MEALS}
                      onChange={() =>
                        setMealIds(
                          checked ? mealIds.filter((id) => id !== m.id) : [...mealIds, m.id],
                        )
                      }
                    />
                  );
                })}
              </fieldset>
            )}
          </section>
        </>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={save.isPending || (template !== null && !dirty)}>
              {template === null ? 'Criar plano' : dirty ? 'Salvar mudanças' : 'Tudo salvo'}
            </Button>
            <Link href={`/org/${groupId}/content`} className={buttonVariants({ variant: 'ghost' })}>
              Voltar
            </Link>
          </div>
        )}
      </form>

      {/* Longe do "Salvar", com cor e ícone de perigo: antes era um "Apagar"
          fantasma entre "Publicar" e "Voltar". */}
      {canEdit && template && (
        <div className="border-t border-subtle pt-4">
          <DeleteButton
            label="Apagar plano"
            pending={remove.isPending}
            onClick={() => setDeleting(true)}
          />
        </div>
      )}

      {template && (
        <>
          <ConfirmDialog
            open={unpublishing}
            onOpenChange={setUnpublishing}
            title="Tirar este plano do ar?"
            description="Ele some para os membros. Quem já adotou continua com a cópia."
            confirmLabel="Tirar do ar"
            pendingLabel="Tirando do ar..."
            pending={publish.isPending}
            onConfirm={() => publish.mutate(false)}
          />
          <ConfirmDialog
            open={deleting}
            onOpenChange={setDeleting}
            title="Apagar este plano?"
            description="Ele some para os membros. Quem já adotou continua com a cópia dele."
            confirmLabel="Apagar"
            pendingLabel="Apagando..."
            pending={remove.isPending}
            onConfirm={() => remove.mutate()}
          />
        </>
      )}
    </div>
  );
}
