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
import type { ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { PhotosField } from '@/components/content/photos-field';
import { VideoField, type VideoValue } from '@/components/content/video-field';
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
import { EquipmentChooser } from '@/components/workout/equipment-chooser';

function erroDaApi(err: unknown, padrao: string): string {
  return err instanceof ApiError && err.status < 500 && err.message ? err.message : padrao;
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
  const novoDoCatalogo = useSearchParams().get('catalog') === '1';
  const nova = exerciseId === 'new';
  const id = Number(exerciseId);

  const atual = useQuery({
    queryKey: orgKeys.exercise(g.id, id),
    queryFn: () => groupExerciseApi.get(g.id, id),
    enabled: !nova && !novoDoCatalogo,
    retry: false,
  });
  const base = useQuery({
    queryKey: ['workout', 'exercise', id],
    queryFn: () => workoutApi.getExercise(id),
    enabled: novoDoCatalogo,
  });

  if (nova) return <ExerciseEditor key="new" groupId={g.id} item={null} catalog={null} />;
  if (novoDoCatalogo) {
    if (base.isPending) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
    if (!base.data) return <NaoEncontrado />;
    return <ExerciseEditor key={`c${id}`} groupId={g.id} item={null} catalog={base.data} />;
  }
  if (atual.isPending) return <Skeleton className="h-64 max-w-3xl rounded-2xl" />;
  if (!atual.data) return <NaoEncontrado />;
  return <ExerciseEditor key={id} groupId={g.id} item={atual.data} catalog={null} />;
}

function NaoEncontrado() {
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
  const daCasa = item ? item.ownedByCommunity : catalog === null;
  const editavel = item === null || item.canEdit !== false;
  const nomeBase = item?.name ?? catalog?.name ?? '';
  useTopBarTitle(nomeBase || 'Exercício da casa');

  const [nome, setNome] = useState(nomeBase);
  const [grupo, setGrupo] = useState(item?.muscleGroup ?? catalog?.muscleGroup ?? '');
  const [equipment, setEquipment] = useState(item?.equipment ?? NO_EQUIPMENT);
  const [instrucoes, setInstrucoes] = useState((item?.instructions ?? []).join('\n'));
  const [video, setVideo] = useState<VideoValue | null>(
    item?.video ? { fileId: item.video.id, url: item.video.url } : null,
  );
  const [fotos, setFotos] = useState<ImageValue[]>(
    item?.photos.map((p) => ({ fileId: p.id, url: p.url })) ?? [],
  );
  const [dicas, setDicas] = useState(item?.tips ?? '');
  const [previa, setPrevia] = useState(false);
  const [apagando, setApagando] = useState(false);

  const invalidar = () => qc.invalidateQueries({ queryKey: orgKeys.all(groupId) });
  const guia = {
    videoFileId: video?.fileId ?? null,
    photoFileIds: fotos.map((f) => f.fileId),
    tips: dicas.trim() || null,
  };
  const dados = {
    name: nome.trim(),
    muscleGroup: grupo,
    equipment: equipment === NO_EQUIPMENT ? null : equipment,
    instructions: instructionsFromText(instrucoes),
  };

  const salvar = useMutation({
    mutationFn: async (): Promise<GroupExercise> => {
      if (!item && daCasa) return groupExerciseApi.create(groupId, { ...dados, ...guia });
      const exerciseId = item?.exerciseId ?? catalog!.id;
      if (item?.ownedByCommunity) await groupExerciseApi.update(groupId, exerciseId, dados);
      return groupExerciseApi.setGuide(groupId, exerciseId, guia);
    },
    onSuccess: (salvo) => {
      toast(item ? 'Exercício salvo.' : 'Exercício no catálogo da comunidade.');
      void invalidar();
      if (!item) router.replace(`/org/${groupId}/exercises/${salvo.exerciseId}`);
    },
    onError: (err) => toast(erroDaApi(err, 'Não deu para salvar agora.')),
  });

  const apagar = useMutation({
    mutationFn: () => groupExerciseApi.remove(groupId, item!.exerciseId),
    onSuccess: () => {
      toast(daCasa ? 'Exercício tirado do catálogo.' : 'Tutorial apagado.');
      void invalidar();
      router.replace(`/org/${groupId}/exercises`);
    },
    onError: (err) => {
      setApagando(false);
      toast(erroDaApi(err, 'Não deu para apagar agora.'));
    },
  });

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={daCasa ? 'default' : 'secondary'}>
          {daCasa ? 'Exercício da casa' : 'Exercício do catálogo'}
        </Badge>
        {item && <span className="text-xs text-muted-foreground">Por {item.authorName}</span>}
      </div>
      {!editavel && (
        <p className="rounded-xl bg-muted p-3 text-sm">
          Só quem publicou, ou o dono, muda este exercício.
        </p>
      )}

      <form
        aria-label="Exercício"
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const problema = daCasa ? groupExerciseProblem(dados) : null;
          if (problema) {
            toast(problema);
            return;
          }
          salvar.mutate();
        }}
      >
        {daCasa ? (
          <fieldset
            disabled={!editavel}
            aria-label="Dados do exercício"
            className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
          >
            <div className="space-y-1">
              <Label htmlFor="nome">Nome</Label>
              <Input
                id="nome"
                maxLength={200}
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="grupo">Grupo muscular</Label>
                <Select value={grupo} onValueChange={setGrupo}>
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
                value={instrucoes}
                onChange={(e) => setInstrucoes(e.target.value)}
                placeholder={'Um passo por linha\nAjuste o banco na altura do peito\n…'}
              />
            </div>
          </fieldset>
        ) : (
          <div className="rounded-2xl border border-subtle bg-card p-4">
            <p className="text-sm font-semibold">{nomeBase}</p>
            <p className="text-xs text-muted-foreground">
              Exercício do catálogo geral: o nome e os passos são os mesmos para todo mundo. A
              comunidade muda o vídeo, as fotos e as dicas.
            </p>
          </div>
        )}

        <fieldset
          disabled={!editavel}
          aria-label="Tutorial da comunidade"
          className="space-y-4 rounded-2xl border border-subtle bg-card p-4"
        >
          <VideoField groupId={groupId} value={video} onChange={setVideo} />
          <PhotosField groupId={groupId} value={fotos} onChange={setFotos} />
          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="dicas">Dicas</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() => setPrevia(!previa)}>
                {previa ? 'Editar' : 'Ver prévia'}
              </Button>
            </div>
            {previa ? (
              <div
                className="min-h-24 rounded-xl border border-subtle p-3"
                aria-label="Prévia das dicas"
              >
                <MarkdownLite source={dicas || 'Nada escrito ainda.'} />
              </div>
            ) : (
              <Textarea
                id="dicas"
                rows={4}
                maxLength={MAX_GUIDE_TIPS}
                value={dicas}
                onChange={(e) => setDicas(e.target.value)}
              />
            )}
            <p className="text-xs text-muted-foreground">
              {`**negrito**, *itálico* e listas com "- ". ${dicas.length}/${MAX_GUIDE_TIPS}`}
            </p>
          </div>
        </fieldset>

        {editavel && (
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? 'Salvando…' : item ? 'Salvar' : 'Pôr no catálogo'}
            </Button>
            {item && (
              <Button type="button" variant="ghost" onClick={() => setApagando(true)}>
                {daCasa ? 'Apagar exercício' : 'Apagar tutorial'}
              </Button>
            )}
            <Link
              href={`/org/${groupId}/exercises`}
              className={buttonVariants({ variant: 'ghost' })}
            >
              Voltar
            </Link>
          </div>
        )}
      </form>

      {item && (
        <ConfirmDialog
          open={apagando}
          onOpenChange={setApagando}
          title={daCasa ? 'Apagar este exercício?' : 'Apagar este tutorial?'}
          description={
            daCasa
              ? 'Ele sai do catálogo da comunidade, com o vídeo e as fotos. Quem já treinou com ele continua vendo o que fez.'
              : 'O vídeo, as fotos e as dicas saem. O exercício continua no catálogo geral.'
          }
          confirmLabel="Apagar"
          pendingLabel="Apagando..."
          pending={apagar.isPending}
          onConfirm={() => apagar.mutate()}
        />
      )}
    </div>
  );
}
