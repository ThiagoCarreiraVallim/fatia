'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  ApiError,
  BODYWEIGHT_EQUIPMENT,
  equipmentLabel,
  groupExerciseApi,
  groupExerciseProblem,
  instructionsFromText,
  MAX_GUIDE_TIPS,
  MUSCLE_GROUP_LABEL,
  MUSCLE_GROUPS,
  OTHER_EQUIPMENT,
  workoutApi,
  type Exercise,
  type GroupExercise,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { DeleteButton, WritePreviewTabs } from '@/components/content/content-ui';
import type { ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { PhotosField } from '@/components/content/photos-field';
import { VideoField, type VideoValue } from '@/components/content/video-field';
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
import { Textarea } from '@/components/ui/textarea';
import { EquipmentChooser } from '@/components/workout/equipment-chooser';

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

const NO_EQUIPMENT = 'nenhum';

/**
 * Exercício da casa novo (`/exercises/new`), o tutorial novo de um exercício
 * do catálogo (`/exercises/<id>?catalog=1`) ou a edição de um que já está no
 * catálogo da comunidade.
 */
export default function OrgExercisePage() {
  const g = useOrgGroup();
  const { exerciseId } = useParams<{ exerciseId: string }>();
  const fromCatalog = useSearchParams().get('catalog') === '1';
  const isNew = exerciseId === 'new';
  const id = Number(exerciseId);

  const current = useQuery({
    queryKey: orgKeys.exercise(g.id, id),
    queryFn: () => groupExerciseApi.get(g.id, id),
    enabled: !isNew && !fromCatalog,
    retry: false,
  });
  const catalogExercise = useQuery({
    queryKey: ['workout', 'exercise', id],
    queryFn: () => workoutApi.getExercise(id),
    enabled: fromCatalog,
  });

  if (isNew) return <ExerciseEditor key="new" groupId={g.id} item={null} catalog={null} />;
  if (fromCatalog) {
    if (catalogExercise.isPending) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
    if (!catalogExercise.data) return <NotFound />;
    return (
      <ExerciseEditor key={`c${id}`} groupId={g.id} item={null} catalog={catalogExercise.data} />
    );
  }
  if (current.isPending) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
  if (!current.data) return <NotFound />;
  return <ExerciseEditor key={id} groupId={g.id} item={current.data} catalog={null} />;
}

function NotFound() {
  return (
    <EmptyState
      title="Exercício não encontrado"
      description="Ele saiu do catálogo da comunidade, ou o endereço está errado."
    />
  );
}

/**
 * O equipamento do exercício da casa: o escolhido à mostra e, ao abrir, a
 * lista inteira com busca — os próprios da academia primeiro, depois a geral
 * por categoria. Na página, e não num modal, porque o editor já rola. A API
 * recusa o equipamento próprio de outra academia, então só os desta aparecem.
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
  // A mesma consulta da lista do painel: em geral já está no cache.
  const bench = useQuery({
    queryKey: orgKeys.exercises(groupId),
    queryFn: () => groupExerciseApi.list(groupId),
  });
  const chosen = value === NO_EQUIPMENT ? 'Não informar' : equipmentLabel(value);

  return (
    <div className="space-y-1 sm:col-span-2">
      <Label htmlFor="equipamento">Equipamento</Label>
      <button
        id="equipamento"
        type="button"
        aria-expanded={open}
        aria-label={`Equipamento: ${chosen}. Trocar`}
        onClick={() => setOpen(!open)}
        className="flex h-9 w-full items-center justify-between rounded-md border border-input px-3 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-default disabled:opacity-70"
      >
        <span>{chosen}</span>
        <span className="text-xs font-semibold text-primary">{open ? 'Fechar' : 'Trocar'}</span>
      </button>
      {open && (
        <div className="space-y-3 pt-2">
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

function ExerciseEditor({
  groupId,
  item,
  catalog,
}: {
  groupId: string;
  /** O que já está no catálogo da comunidade. */
  item: GroupExercise | null;
  /** Exercício do catálogo geral que ganha o primeiro tutorial agora. */
  catalog: Exercise | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const houseMade = item ? item.ownedByCommunity : catalog === null;
  const canEdit = item === null || item.canEdit !== false;
  const baseName = item?.name ?? catalog?.name ?? '';
  useTopBarTitle(baseName || 'Exercício da casa');

  const [name, setName] = useState(baseName);
  const [muscleGroup, setMuscleGroup] = useState(item?.muscleGroup ?? catalog?.muscleGroup ?? '');
  const [equipment, setEquipment] = useState(item?.equipment ?? NO_EQUIPMENT);
  const [instructions, setInstructions] = useState((item?.instructions ?? []).join('\n'));
  const [video, setVideo] = useState<VideoValue | null>(
    item?.video ? { fileId: item.video.id, url: item.video.url } : null,
  );
  const [photos, setPhotos] = useState<ImageValue[]>(
    item?.photos.map((p) => ({ fileId: p.id, url: p.url })) ?? [],
  );
  const [tips, setTips] = useState(item?.tips ?? '');
  const [deleting, setDeleting] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });
  const guide = {
    videoFileId: video?.fileId ?? null,
    photoFileIds: photos.map((f) => f.fileId),
    tips: tips.trim() || null,
  };
  const data = {
    name: name.trim(),
    muscleGroup,
    equipment: equipment === NO_EQUIPMENT ? null : equipment,
    instructions: instructionsFromText(instructions),
  };

  const save = useMutation({
    mutationFn: async (): Promise<GroupExercise> => {
      if (!item && houseMade) return groupExerciseApi.create(groupId, { ...data, ...guide });
      const exerciseId = item?.exerciseId ?? catalog!.id;
      if (item?.ownedByCommunity) await groupExerciseApi.update(groupId, exerciseId, data);
      return groupExerciseApi.setGuide(groupId, exerciseId, guide);
    },
    onSuccess: (saved) => {
      toast(item ? 'Exercício salvo.' : 'Exercício no catálogo da comunidade.');
      void invalidate();
      if (!item) router.replace(`/org/${groupId}/exercises/${saved.exerciseId}`);
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar agora.')),
  });

  const remove = useMutation({
    mutationFn: () => groupExerciseApi.remove(groupId, item!.exerciseId),
    onSuccess: () => {
      toast(houseMade ? 'Exercício tirado do catálogo.' : 'Tutorial apagado.');
      void invalidate();
      router.replace(`/org/${groupId}/exercises`);
    },
    onError: (err) => {
      setDeleting(false);
      toast(apiErrorMessage(err, 'Não deu para apagar agora.'));
    },
  });

  return (
    <div className="max-w-3xl space-y-4">
      {/* Texto, e não selo cheio: não é coisa de clicar. */}
      <p className="text-xs text-muted-foreground">
        {`${houseMade ? 'Exercício da casa' : 'Exercício do catálogo'}${item ? ` · por ${item.authorName}` : ''}`}
      </p>
      {!canEdit && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Só quem publicou, ou o dono, muda este exercício.
        </p>
      )}

      <form
        aria-label="Exercício"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const problem = houseMade ? groupExerciseProblem(data) : null;
          if (problem) {
            toast(problem);
            return;
          }
          save.mutate();
        }}
      >
        {houseMade ? (
          <fieldset
            disabled={!canEdit}
            aria-label="Dados do exercício"
            className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
          >
            <div className="space-y-1">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="grupo">Grupo muscular</Label>
                <Select value={muscleGroup} onValueChange={setMuscleGroup}>
                  <SelectTrigger id="grupo">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {MUSCLE_GROUPS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {MUSCLE_GROUP_LABEL[m]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <EquipmentField groupId={groupId} value={equipment} onChange={setEquipment} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="instrucoes">Como executar</Label>
              <Textarea
                id="instrucoes"
                rows={5}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder={'Um passo por linha\nAjuste o banco na altura do peito\n…'}
              />
            </div>
          </fieldset>
        ) : (
          <div className="rounded-2xl border border-subtle bg-card p-4">
            <p className="text-sm font-semibold">{baseName}</p>
            <p className="text-xs text-muted-foreground">
              Exercício do catálogo geral: o nome e os passos são os mesmos para todo mundo. A
              comunidade muda o vídeo, as fotos e as dicas.
            </p>
          </div>
        )}

        <fieldset
          disabled={!canEdit}
          aria-label="Tutorial da comunidade"
          className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
        >
          <VideoField groupId={groupId} value={video} onChange={setVideo} />
          <PhotosField groupId={groupId} value={photos} onChange={setPhotos} />
          <div className="space-y-1">
            <WritePreviewTabs
              write={
                <div className="space-y-1">
                  <Label htmlFor="dicas">Dicas</Label>
                  <Textarea
                    id="dicas"
                    rows={4}
                    maxLength={MAX_GUIDE_TIPS}
                    value={tips}
                    onChange={(e) => setTips(e.target.value)}
                  />
                </div>
              }
              preview={
                <div
                  className="min-h-24 rounded-xl border border-subtle p-3"
                  aria-label="Prévia das dicas"
                >
                  <MarkdownLite source={tips || 'Nada escrito ainda.'} />
                </div>
              }
            />
            <p className="text-xs text-muted-foreground">
              {`**negrito**, *itálico* e listas com "- ". ${tips.length}/${MAX_GUIDE_TIPS}`}
            </p>
          </div>
        </fieldset>

        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {/* O verbo diz o que acontece: "Pôr no catálogo" servia aos dois casos e
                não dizia nenhum. */}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending
                ? 'Salvando…'
                : item
                  ? 'Salvar'
                  : houseMade
                    ? 'Criar exercício'
                    : 'Salvar tutorial'}
            </Button>
            <Link
              href={`/org/${groupId}/exercises`}
              className={buttonVariants({ variant: 'ghost' })}
            >
              Voltar
            </Link>
          </div>
        )}
      </form>

      {/* Longe do "Salvar", com cor e ícone de perigo — antes era um fantasma
          entre ele e o "Voltar". */}
      {canEdit && item && (
        <div className="border-t border-subtle pt-4">
          <DeleteButton
            label={houseMade ? 'Apagar exercício' : 'Apagar tutorial'}
            pending={remove.isPending}
            onClick={() => setDeleting(true)}
          />
        </div>
      )}

      {item && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={houseMade ? 'Apagar este exercício?' : 'Apagar este tutorial?'}
          description={
            houseMade
              ? 'Ele sai do catálogo da comunidade, com o vídeo e as fotos. Quem já treinou com ele continua vendo o que fez.'
              : 'O vídeo, as fotos e as dicas saem. O exercício continua no catálogo geral.'
          }
          confirmLabel="Apagar"
          pendingLabel="Apagando..."
          pending={remove.isPending}
          onConfirm={() => remove.mutate()}
        />
      )}
    </div>
  );
}
