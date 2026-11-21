'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronLeft, Copy, House, Star } from 'lucide-react';
import {
  ApiError,
  BODYWEIGHT_EQUIPMENT,
  equipmentLabel,
  groupExerciseApi,
  groupExerciseProblem,
  MAX_GUIDE_TIPS,
  MUSCLE_GROUP_LABEL,
  MUSCLE_GROUPS,
  OTHER_EQUIPMENT,
  parseRest,
  restClock,
  usageLabel,
  type GroupExercise,
  type GuideInput,
  type PlanLoadMode,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { DeleteButton } from '@/components/content/content-ui';
import type { ImageValue } from '@/components/content/image-field';
import { PhotosField } from '@/components/content/photos-field';
import { VideoField, type VideoValue } from '@/components/content/video-field';
import { useTopBarTitle } from '@/components/layout/app-top-bar';
import { cleanLines, LinesEditor } from '@/components/org/exercise-guide-fields';
import { useOrgGroup } from '@/components/org/org-shell';
import { muscleLabelPt } from '@/components/workout/muscle-labels';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { EquipmentChooser } from '@/components/workout/equipment-chooser';
import { cn } from '@/lib/utils';

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

const NO_EQUIPMENT = 'nenhum';
const MAX_STEPS = 12;
const MAX_MISTAKES = 8;

const LOAD_MODES: { value: PlanLoadMode | ''; label: string }[] = [
  { value: '', label: 'não definir' },
  { value: 'WEIGHT', label: 'kg' },
  { value: 'BODYWEIGHT', label: 'peso do corpo' },
  { value: 'PERCENT_1RM', label: '% do 1RM' },
  { value: 'BAND', label: 'elástico' },
];

/**
 * Editar exercício (Pn-11b, #408). `/exercises/new` cria um exercício da
 * biblioteca da comunidade; qualquer outro id abre o do catálogo geral (o
 * guia da casa por cima) ou o da comunidade (os dados também).
 */
export default function OrgExercisePage() {
  const g = useOrgGroup();
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const isNew = exerciseId === 'new';
  const id = Number(exerciseId);

  const current = useQuery({
    queryKey: orgKeys.exercise(g.id, id),
    queryFn: () => groupExerciseApi.get(g.id, id),
    enabled: !isNew,
    retry: false,
  });

  if (isNew) return <ExerciseEditor key="new" groupId={g.id} groupName={g.name} item={null} />;
  if (current.isPending) return <Skeleton className="h-64 rounded-2xl" />;
  if (!current.data) {
    return (
      <EmptyState
        title="Exercício não encontrado"
        description="Ele saiu do catálogo da comunidade, ou o endereço está errado."
      />
    );
  }
  return (
    <ExerciseEditor
      key={`${id}:${current.data.updatedAt}`}
      groupId={g.id}
      groupName={g.name}
      item={current.data}
    />
  );
}

/**
 * O equipamento do exercício da comunidade: o escolhido à mostra e, ao abrir,
 * a lista inteira com busca, os próprios da academia primeiro. A API recusa o
 * equipamento próprio de outra academia, então só os desta aparecem.
 */
function EquipmentField({
  groupId,
  value,
  onChange,
}: {
  groupId: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const bench = useQuery({
    queryKey: [...orgKeys.exercises(groupId), 'equipment'],
    queryFn: () => groupExerciseApi.list(groupId, { limit: 1 }),
    enabled: open,
  });
  const chosen = value === NO_EQUIPMENT ? 'Não informar' : equipmentLabel(value);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-sm">
          {chosen}
        </span>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`Equipamento: ${chosen}. Trocar`}
          onClick={() => setOpen(!open)}
          className="h-9 rounded-lg px-2 text-sm font-semibold text-primary hover:bg-muted"
        >
          {open ? 'Fechar' : 'Trocar'}
        </button>
      </div>
      {open && (
        <div className="space-y-3">
          <Input
            aria-label="Buscar equipamento"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar: smith, polia, esteira…"
          />
          <EquipmentChooser
            single
            query={query}
            custom={bench.data?.customEquipment ?? []}
            extra={[
              { key: NO_EQUIPMENT, label: 'Não informar' },
              { key: BODYWEIGHT_EQUIPMENT, label: 'Peso corporal' },
              { key: OTHER_EQUIPMENT, label: 'Outro' },
            ]}
            isSelected={(k) => k === value}
            onPick={(k) => {
              onChange(k);
              setOpen(false);
              setQuery('');
            }}
          />
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="space-y-3 border-t border-subtle pt-5 first:border-0 first:pt-0"
    >
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function ExerciseEditor({
  groupId,
  groupName,
  item,
}: {
  groupId: string;
  groupName: string;
  /** `null` = exercício novo da comunidade. */
  item: GroupExercise | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const owned = item === null || item.ownedByCommunity;
  const canEdit = item === null || item.canEdit !== false;
  useTopBarTitle(item?.name ?? 'Novo exercício');

  const [name, setName] = useState(item?.name ?? '');
  const [muscleGroup, setMuscleGroup] = useState(item?.muscleGroup ?? '');
  const [equipment, setEquipment] = useState(item?.equipment ?? NO_EQUIPMENT);
  const [video, setVideo] = useState<VideoValue | null>(
    item?.video ? { fileId: item.video.id, url: item.video.url } : null,
  );
  const [photos, setPhotos] = useState<ImageValue[]>(
    item?.photos.map((p) => ({ fileId: p.id, url: p.url })) ?? [],
  );
  const [steps, setSteps] = useState<string[]>(item?.steps.length ? item.steps : ['']);
  const [mistakes, setMistakes] = useState<string[]>(item?.commonMistakes ?? []);
  const [tips, setTips] = useState(item?.tips ?? '');
  const [sets, setSets] = useState(item?.defaults?.sets?.toString() ?? '');
  const [reps, setReps] = useState(item?.defaults?.reps ?? '');
  const [rest, setRest] = useState(restClock(item?.defaults?.restSeconds ?? null));
  const [loadMode, setLoadMode] = useState<PlanLoadMode | ''>(item?.defaults?.loadMode ?? '');
  const [homeFriendly, setHomeFriendly] = useState(item?.homeFriendly ?? false);
  const [favorite, setFavorite] = useState(Boolean(item?.favorite));
  const [deleting, setDeleting] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });
  const base = `/org/${groupId}/exercises`;

  /** O guia inteiro, ou o recado do campo que não dá para salvar. */
  const readGuide = (): GuideInput | string => {
    const restSeconds = parseRest(rest);
    if (restSeconds === undefined) return 'Descanso: segundos (90) ou minutos (2:00).';
    const setCount = sets.trim() ? Number(sets) : null;
    if (setCount !== null && (!Number.isInteger(setCount) || setCount < 1 || setCount > 20)) {
      return 'Séries: de 1 a 20.';
    }
    return {
      videoFileId: video?.fileId ?? null,
      photoFileIds: photos.map((f) => f.fileId),
      tips: tips.trim() || null,
      steps: cleanLines(steps),
      commonMistakes: cleanLines(mistakes),
      homeFriendly,
      defaultSets: setCount,
      defaultReps: reps.trim() || null,
      defaultRestSeconds: restSeconds,
      defaultLoadMode: loadMode || null,
    };
  };
  const data = {
    name: name.trim(),
    muscleGroup,
    equipment: equipment === NO_EQUIPMENT ? null : equipment,
  };

  const save = useMutation({
    mutationFn: async (guide: GuideInput): Promise<GroupExercise> => {
      let saved: GroupExercise;
      if (!item) {
        saved = await groupExerciseApi.create(groupId, { ...data, ...guide });
      } else {
        if (item.ownedByCommunity) await groupExerciseApi.update(groupId, item.exerciseId, data);
        saved = await groupExerciseApi.setGuide(groupId, item.exerciseId, guide);
      }
      const exerciseId = item?.exerciseId ?? saved.exerciseId;
      if (favorite !== Boolean(item?.favorite)) {
        await groupExerciseApi.setFavorite(groupId, exerciseId, favorite);
      }
      return saved;
    },
    onSuccess: (saved) => {
      toast(item ? 'Exercício salvo.' : 'Exercício no catálogo da comunidade.');
      void invalidate();
      if (!item) router.replace(`${base}/${saved.exerciseId}`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar agora.')),
  });

  const duplicate = useMutation({
    mutationFn: () => groupExerciseApi.duplicate(groupId, item!.exerciseId),
    onSuccess: (copy) => {
      toast('Cópia criada, sem o vídeo e as fotos.');
      void invalidate();
      router.push(`${base}/${copy.exerciseId}`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para duplicar agora.')),
  });

  const remove = useMutation({
    mutationFn: () => groupExerciseApi.remove(groupId, item!.exerciseId),
    onSuccess: () => {
      toast(owned ? 'Exercício tirado do catálogo.' : 'Guia da casa apagado.');
      void invalidate();
      router.replace(base);
    },
    onError: (err) => {
      setDeleting(false);
      toast(apiErrorMessage(err, 'Não deu para apagar agora.'));
    },
  });

  const submit = () => {
    if (owned) {
      const problem = groupExerciseProblem(data);
      if (problem) return toast(problem);
    }
    const guide = readGuide();
    if (typeof guide === 'string') return toast(guide);
    save.mutate(guide);
  };

  const subtitle = item
    ? [
        owned ? `Exercício da biblioteca da ${groupName}` : 'Exercício do catálogo geral',
        item.usage ? usageLabel(item.usage) : null,
        'o padrão vale só para planos novos',
      ]
        .filter(Boolean)
        .join(' · ')
    : `Entra na biblioteca da ${groupName}`;
  const videoCaption =
    item?.video && item.video.durationMs
      ? `vídeo de ${item.authorName} · ${restClock(Math.round(item.video.durationMs / 1000)).replace(/^0/, '')}`
      : null;

  return (
    <form
      aria-label="Exercício"
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Link
          href={base}
          aria-label="Voltar aos exercícios"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-border text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          {owned && canEdit ? (
            <>
              <label htmlFor="nome" className="sr-only">
                Nome
              </label>
              <input
                id="nome"
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome do exercício"
                className="w-full rounded-lg bg-transparent font-display text-2xl font-bold outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring sm:text-3xl"
              />
            </>
          ) : (
            <h1 className="font-display text-2xl font-bold sm:text-3xl">{item?.name}</h1>
          )}
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {item && (
              <Button
                type="button"
                variant="outline"
                className="gap-1.5"
                disabled={duplicate.isPending}
                onClick={() => duplicate.mutate()}
              >
                <Copy className="h-4 w-4" aria-hidden />
                Duplicar
              </Button>
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : item ? 'Salvar exercício' : 'Criar exercício'}
            </Button>
          </div>
        )}
      </div>

      {!canEdit && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Só quem publicou, ou o dono, muda este exercício.
        </p>
      )}

      <fieldset
        disabled={!canEdit}
        className="grid gap-8 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]"
      >
        <div className="space-y-4">
          <VideoField
            frame
            groupId={groupId}
            value={video}
            onChange={setVideo}
            hint="MP4 ou MOV, até 60 s e 200 MB · aparece no treino de quem usa este exercício."
          />
          {videoCaption && <p className="text-xs text-muted-foreground">{videoCaption}</p>}
          <PhotosField
            groupId={groupId}
            value={photos}
            onChange={setPhotos}
            label="Fotos"
            addLabel="Foto"
            hint="Início, meio e fim do movimento. JPEG, PNG ou WebP; localização e dados da câmera são apagados."
          />
        </div>

        <div className="space-y-5">
          <Section
            title="Grupo muscular"
            hint={
              owned ? 'o principal, que organiza o catálogo' : 'do catálogo geral: não muda aqui'
            }
          >
            {owned ? (
              <div role="radiogroup" aria-label="Grupo muscular" className="flex flex-wrap gap-1.5">
                {MUSCLE_GROUPS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={muscleGroup === m}
                    onClick={() => setMuscleGroup(m)}
                    className={cn(
                      'h-9 rounded-lg border px-3 text-sm',
                      muscleGroup === m
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {MUSCLE_GROUP_LABEL[m]}
                  </button>
                ))}
              </div>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {[
                  (MUSCLE_GROUP_LABEL as Record<string, string>)[item!.muscleGroup] ??
                    item!.muscleGroup,
                  ...item!.primaryMuscles.map(muscleLabelPt),
                ].map((m, i) => (
                  <li
                    key={`${m}-${i}`}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm capitalize',
                      i === 0 ? 'border-primary/50 bg-primary/10' : 'border-border',
                    )}
                  >
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Equipamento">
            {owned ? (
              <EquipmentField groupId={groupId} value={equipment} onChange={setEquipment} />
            ) : (
              <p className="inline-flex rounded-lg border border-primary/50 bg-primary/10 px-3 py-1.5 text-sm">
                {item!.equipment ? equipmentLabel(item!.equipment) : 'Não informado'}
              </p>
            )}
          </Section>

          <Section
            title="Padrão ao entrar num plano"
            hint="quem monta o plano pode mudar; vale só para os planos montados depois"
          >
            <div className="flex flex-wrap gap-3">
              <DefaultField label="Séries" id="series" width="w-20">
                <Input
                  id="series"
                  inputMode="numeric"
                  value={sets}
                  onChange={(e) => setSets(e.target.value.replace(/\D/g, '').slice(0, 2))}
                  placeholder="3"
                  className="text-center"
                />
              </DefaultField>
              <DefaultField label="Repetições" id="reps" width="w-24">
                <Input
                  id="reps"
                  value={reps}
                  maxLength={9}
                  onChange={(e) => setReps(e.target.value)}
                  placeholder="10"
                  className="text-center"
                />
              </DefaultField>
              <DefaultField label="Descanso" id="descanso" width="w-24">
                <Input
                  id="descanso"
                  value={rest}
                  maxLength={5}
                  onChange={(e) => setRest(e.target.value)}
                  placeholder="01:30"
                  className="text-center"
                />
              </DefaultField>
              <DefaultField label="Carga em" id="carga" width="w-36">
                <select
                  id="carga"
                  value={loadMode}
                  onChange={(e) => setLoadMode(e.target.value as PlanLoadMode | '')}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-center text-sm"
                >
                  {LOAD_MODES.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </DefaultField>
            </div>
          </Section>

          <Section title="Como fazer" hint={'vira o cartão "Como fazer" na IA e no treino'}>
            <LinesEditor
              noun="Passo"
              addLabel="Adicionar passo"
              lines={steps}
              onChange={setSteps}
              max={MAX_STEPS}
              disabled={!canEdit}
              placeholder={(i) => item?.instructions[i]}
            />
            {item && item.steps.length === 0 && item.instructions.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Vazio, o membro vê os passos do catálogo geral.
              </p>
            )}
          </Section>

          <Section title="Erros comuns">
            <LinesEditor
              noun="Erro"
              addLabel="Adicionar erro"
              lines={mistakes}
              onChange={setMistakes}
              max={MAX_MISTAKES}
              disabled={!canEdit}
            />
          </Section>

          <Section title="Dica da equipe">
            <label htmlFor="dicas" className="sr-only">
              Dica da equipe
            </label>
            <Textarea
              id="dicas"
              rows={3}
              maxLength={MAX_GUIDE_TIPS}
              value={tips}
              onChange={(e) => setTips(e.target.value)}
              placeholder="Onde fica o aparelho, a carga para começar…"
            />
          </Section>

          <Section title="Onde aparece">
            <ToggleRow
              icon={<House className="h-4 w-4" aria-hidden />}
              title="Dá para fazer em casa"
              detail="ganha o selo DA CASA e entra no filtro"
              checked={homeFriendly}
              onChange={setHomeFriendly}
            />
            <ToggleRow
              icon={<Star className="h-4 w-4" aria-hidden />}
              title="Favorito da equipe"
              detail="aparece primeiro ao montar planos"
              checked={favorite}
              onChange={setFavorite}
            />
          </Section>

          {canEdit && item && (owned || item.hasGuide) && (
            <div className="border-t border-subtle pt-5">
              <DeleteButton
                label={owned ? 'Apagar exercício' : 'Apagar guia da casa'}
                pending={remove.isPending}
                onClick={() => setDeleting(true)}
              />
            </div>
          )}
        </div>
      </fieldset>

      {item && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={owned ? 'Apagar este exercício?' : 'Apagar o guia da casa?'}
          description={
            owned
              ? 'Ele sai do catálogo da comunidade, com o vídeo e as fotos. Quem já treinou com ele continua vendo o que fez.'
              : 'O vídeo, as fotos, os passos e as dicas da equipe saem. O exercício continua no catálogo geral.'
          }
          confirmLabel="Apagar"
          pendingLabel="Apagando..."
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </form>
  );
}

function DefaultField({
  label,
  id,
  width,
  children,
}: {
  label: string;
  id: string;
  width: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('space-y-1', width)}>
      <label htmlFor={id} className="block text-sm text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  detail,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} label={title} />
    </div>
  );
}
