'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  ApiError,
  equipmentLabel,
  groupExerciseApi,
  MAX_GUIDE_TIPS,
  type GroupExercise,
  type GuideInput,
} from '@fatia/api-client';
import { orgKeys } from '@/components/community/query-keys';
import { VideoField, type VideoValue } from '@/components/content/video-field';
import { muscleLabelPt } from '@/components/workout/muscle-labels';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { cleanLines, FieldHead, LinesEditor, sameLines } from './exercise-guide-fields';

function apiErrorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : fallback;
}

/**
 * O guia da casa no painel lateral do catálogo (Pn-11): vídeo, passos, dica e
 * a estrela. O resto (padrão no plano, erros comuns, fotos) fica no editor
 * inteiro, pelo "Editar tudo".
 */
export function GuidePanel({
  groupId,
  exerciseId,
  editHref,
  onDone,
}: {
  groupId: string;
  exerciseId: number;
  editHref: string;
  onDone: () => void;
}) {
  const current = useQuery({
    queryKey: orgKeys.exercise(groupId, exerciseId),
    queryFn: () => groupExerciseApi.get(groupId, exerciseId),
    retry: false,
  });
  if (current.isPending) return <Skeleton className="m-4 h-64 rounded-2xl" />;
  if (!current.data) {
    return (
      <p className="p-4 text-sm text-muted-foreground">Não deu para abrir este exercício agora.</p>
    );
  }
  return (
    <GuideForm
      key={current.data.updatedAt}
      groupId={groupId}
      item={current.data}
      editHref={editHref}
      onDone={onDone}
    />
  );
}

function GuideForm({
  groupId,
  item,
  editHref,
  onDone,
}: {
  groupId: string;
  item: GroupExercise;
  editHref: string;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const canEdit = item.canEdit !== false;
  const [video, setVideo] = useState<VideoValue | null>(
    item.video ? { fileId: item.video.id, url: item.video.url } : null,
  );
  const [steps, setSteps] = useState<string[]>(item.steps.length ? item.steps : ['']);
  const [tips, setTips] = useState(item.tips ?? '');
  const [favorite, setFavorite] = useState(Boolean(item.favorite));

  const save = useMutation({
    mutationFn: async () => {
      // Só o que mudou: o guia que ainda não existe não nasce vazio.
      const patch: GuideInput = {};
      if ((video?.fileId ?? null) !== (item.video?.id ?? null)) {
        patch.videoFileId = video?.fileId ?? null;
      }
      if (!sameLines(steps, item.steps)) patch.steps = cleanLines(steps);
      if ((tips.trim() || null) !== (item.tips ?? null)) patch.tips = tips.trim() || null;
      if (Object.keys(patch).length) await groupExerciseApi.setGuide(groupId, item.exerciseId, patch);
      if (favorite !== Boolean(item.favorite)) {
        await groupExerciseApi.setFavorite(groupId, item.exerciseId, favorite);
      }
    },
    onSuccess: () => {
      toast('Guia salvo. Quem treina aqui já vê.');
      void qc.invalidateQueries({ queryKey: orgKeys.exercises(groupId) });
      onDone();
    },
    onError: (err) => toast(apiErrorMessage(err, 'Não deu para salvar agora.')),
  });

  const muscles = item.primaryMuscles.length ? item.primaryMuscles : [];

  return (
    <form
      aria-label="Guia da casa"
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <fieldset disabled={!canEdit} className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {!canEdit && (
          <p className="rounded-xl bg-muted p-3 text-sm">
            Só quem publicou, ou o dono, muda este guia.
          </p>
        )}
        <VideoField
          groupId={groupId}
          value={video}
          onChange={setVideo}
          hint="Vídeo próprio: MP4 ou MOV, até 60 s e 200 MB."
        />

        {muscles.length > 0 && (
          <div className="space-y-2">
            <FieldHead title="Músculos principais" />
            <ul className="flex flex-wrap gap-1.5">
              {muscles.map((m) => (
                <li
                  key={m}
                  className="rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1 text-sm"
                >
                  {muscleLabelPt(m)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {item.equipment && (
          <div className="space-y-2">
            <FieldHead title="Equipamento" />
            <p className="inline-flex rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1 text-sm">
              {equipmentLabel(item.equipment)}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <FieldHead title="Passos de execução" hint="aparecem em Como fazer" />
          <LinesEditor
            noun="Passo"
            addLabel="Adicionar passo"
            lines={steps}
            onChange={setSteps}
            max={12}
            disabled={!canEdit}
            placeholder={(i) => item.instructions[i]}
          />
          {item.steps.length === 0 && item.instructions.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Vazio, o membro vê os passos do catálogo geral.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor={`dica-${item.exerciseId}`} className="block text-sm font-medium">
            Dica da equipe
          </label>
          <Textarea
            id={`dica-${item.exerciseId}`}
            rows={3}
            maxLength={MAX_GUIDE_TIPS}
            value={tips}
            onChange={(e) => setTips(e.target.value)}
            placeholder="Onde fica o aparelho, a carga para começar…"
          />
        </div>

        <div className="flex items-center gap-3">
          <Star className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Favorito da equipe</span>
            <span className="block text-xs text-muted-foreground">
              aparece primeiro no editor de plano
            </span>
          </span>
          <Switch checked={favorite} onCheckedChange={setFavorite} label="Favorito da equipe" />
        </div>

        <Link href={editHref} className="inline-block text-sm font-semibold text-primary">
          Editar tudo: padrão no plano, erros comuns e fotos
        </Link>
      </fieldset>

      <div className="flex shrink-0 justify-end gap-2 border-t border-subtle p-3">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        {canEdit && (
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'Salvando…' : 'Salvar guia'}
          </Button>
        )}
      </div>
    </form>
  );
}
