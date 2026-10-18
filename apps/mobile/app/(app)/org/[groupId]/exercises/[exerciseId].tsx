import { useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EXERCISE_EQUIPMENT,
  groupExerciseApi,
  groupExerciseProblem,
  instructionsFromText,
  MAX_GUIDE_TIPS,
  MUSCLE_GROUP_LABEL,
  MUSCLE_GROUPS,
  workoutApi,
  type Exercise,
  type GroupExercise,
  type MyGroup,
} from '@fatia/api-client';
import type { ImageValue } from '@/components/content/image-field';
import { MarkdownLite } from '@/components/content/markdown-lite';
import { PhotosField } from '@/components/content/photos-field';
import { VideoField, type VideoValue } from '@/components/content/video-field';
import { apiMessage, Choice, OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

const SEM = 'nenhum';

function Editor({
  g,
  item,
  catalog,
}: {
  g: MyGroup;
  item: GroupExercise | null;
  catalog: Exercise | null;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const daCasa = item ? item.ownedByCommunity : catalog === null;
  const editavel = item === null || item.canEdit !== false;
  const nomeBase = item?.name ?? catalog?.name ?? '';

  const [nome, setNome] = useState(nomeBase);
  const [grupo, setGrupo] = useState(item?.muscleGroup ?? '');
  const [equipamento, setEquipamento] = useState(item?.equipment ?? SEM);
  const [instrucoes, setInstrucoes] = useState((item?.instructions ?? []).join('\n'));
  const [video, setVideo] = useState<VideoValue | null>(
    item?.video ? { fileId: item.video.id, url: item.video.url } : null,
  );
  const [fotos, setFotos] = useState<ImageValue[]>(
    item?.photos.map((p) => ({ fileId: p.id, url: p.url })) ?? [],
  );
  const [dicas, setDicas] = useState(item?.tips ?? '');
  const [previa, setPrevia] = useState(false);

  const invalidar = () => qc.invalidateQueries({ queryKey: orgKeys.all(g.id) });
  const guia = {
    videoFileId: video?.fileId ?? null,
    photoFileIds: fotos.map((f) => f.fileId),
    tips: dicas.trim() || null,
  };
  const dados = {
    name: nome.trim(),
    muscleGroup: grupo,
    equipment: equipamento === SEM ? null : equipamento,
    instructions: instructionsFromText(instrucoes),
  };

  const salvar = useMutation({
    mutationFn: async (): Promise<GroupExercise> => {
      if (!item && daCasa) return groupExerciseApi.create(g.id, { ...dados, ...guia });
      const id = item?.exerciseId ?? catalog!.id;
      if (item?.ownedByCommunity) await groupExerciseApi.update(g.id, id, dados);
      return groupExerciseApi.setGuide(g.id, id, guia);
    },
    onSuccess: (salvo) => {
      toast.show({ message: item ? 'Exercício salvo.' : 'Exercício no catálogo da comunidade.' });
      void invalidar();
      if (!item) router.replace(`/org/${g.id}/exercises/${salvo.exerciseId}`);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para salvar agora.') }),
  });
  const apagar = useMutation({
    mutationFn: () => groupExerciseApi.remove(g.id, item!.exerciseId),
    onSuccess: () => {
      toast.show({ message: daCasa ? 'Exercício tirado do catálogo.' : 'Tutorial apagado.' });
      void invalidar();
      router.replace(`/org/${g.id}/exercises`);
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para apagar agora.') }),
  });

  return (
    <>
      <Text className="text-xs text-muted-foreground">
        {`${daCasa ? 'Exercício da casa' : 'Exercício do catálogo'}${item ? ` · por ${item.authorName}` : ''}`}
      </Text>
      {!editavel ? (
        <Text className="rounded-xl bg-muted p-3 text-sm text-foreground">
          Só quem publicou, ou o dono, muda este exercício.
        </Text>
      ) : null}

      {daCasa ? (
        <PanelCard title="Exercício">
          <Input
            value={nome}
            onChangeText={setNome}
            editable={editavel}
            maxLength={200}
            accessibilityLabel="Nome"
            placeholder="Nome"
          />
          {editavel ? (
            <>
              <Choice
                label="Grupo muscular"
                options={MUSCLE_GROUPS.map((m) => ({ value: m, label: MUSCLE_GROUP_LABEL[m] }))}
                value={grupo as (typeof MUSCLE_GROUPS)[number]}
                onChange={setGrupo}
              />
              <Choice
                label="Equipamento"
                options={[
                  { value: SEM, label: 'Não informar' },
                  ...EXERCISE_EQUIPMENT.map((e) => ({ value: e, label: e })),
                ]}
                value={equipamento}
                onChange={setEquipamento}
              />
            </>
          ) : null}
          <Input
            value={instrucoes}
            onChangeText={setInstrucoes}
            editable={editavel}
            multiline
            className="min-h-[120px]"
            textAlignVertical="top"
            accessibilityLabel="Como executar"
            placeholder="Um passo por linha"
          />
        </PanelCard>
      ) : (
        <PanelCard title={nomeBase}>
          <Text className="text-xs text-muted-foreground">
            Exercício do catálogo geral: o nome e os passos são os mesmos para todo mundo. A
            comunidade muda o vídeo, as fotos e as dicas.
          </Text>
        </PanelCard>
      )}

      <PanelCard title="Tutorial da comunidade">
        {editavel ? (
          <>
            <VideoField groupId={g.id} value={video} onChange={setVideo} />
            <PhotosField groupId={g.id} value={fotos} onChange={setFotos} />
          </>
        ) : null}
        {previa ? (
          <View
            accessibilityLabel="Prévia das dicas"
            className="rounded-xl border border-border p-3"
          >
            <MarkdownLite source={dicas || 'Nada escrito ainda.'} />
          </View>
        ) : (
          <Input
            value={dicas}
            onChangeText={setDicas}
            editable={editavel}
            maxLength={MAX_GUIDE_TIPS}
            multiline
            className="min-h-[100px]"
            textAlignVertical="top"
            accessibilityLabel="Dicas"
            placeholder="Dicas da equipe"
          />
        )}
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-xs text-muted-foreground">
            {`**negrito**, *itálico*, listas com "- ". ${dicas.length}/${MAX_GUIDE_TIPS}`}
          </Text>
          <Button size="sm" variant="ghost" onPress={() => setPrevia(!previa)}>
            {previa ? 'Editar' : 'Ver prévia'}
          </Button>
        </View>
      </PanelCard>

      {editavel ? (
        <View className="gap-2">
          <Button
            loading={salvar.isPending}
            onPress={() => {
              const problema = daCasa ? groupExerciseProblem(dados) : null;
              if (problema) toast.show({ message: problema });
              else salvar.mutate();
            }}
          >
            {item ? 'Salvar' : 'Pôr no catálogo'}
          </Button>
          {item ? (
            <Button
              variant="ghost"
              onPress={() =>
                Alert.alert(
                  daCasa ? 'Apagar este exercício?' : 'Apagar este tutorial?',
                  daCasa
                    ? 'Ele sai do catálogo da comunidade, com o vídeo e as fotos. Quem já treinou com ele continua vendo o que fez.'
                    : 'O vídeo, as fotos e as dicas saem. O exercício continua no catálogo geral.',
                  [
                    { text: 'Voltar', style: 'cancel' },
                    { text: 'Apagar', style: 'destructive', onPress: () => apagar.mutate() },
                  ],
                )
              }
            >
              {daCasa ? 'Apagar exercício' : 'Apagar tutorial'}
            </Button>
          ) : null}
        </View>
      ) : null}
    </>
  );
}

function Carregar({
  g,
  exerciseId,
  catalogo,
}: {
  g: MyGroup;
  exerciseId: string;
  catalogo: boolean;
}) {
  const nova = exerciseId === 'new';
  const id = Number(exerciseId);
  const atual = useQuery({
    queryKey: orgKeys.exercise(g.id, id),
    queryFn: () => groupExerciseApi.get(g.id, id),
    enabled: !nova && !catalogo,
    retry: false,
  });
  const base = useQuery({
    queryKey: ['workout', 'exercise', id],
    queryFn: () => workoutApi.getExercise(id),
    enabled: catalogo,
  });
  const naoAchou = (
    <EmptyState
      title="Exercício não encontrado"
      description="Ele saiu do catálogo da comunidade, ou o endereço está errado."
    />
  );
  if (nova) return <Editor key="new" g={g} item={null} catalog={null} />;
  if (catalogo) {
    if (base.isPending) return <LoadingState label="Carregando o exercício…" />;
    return base.data ? <Editor key={`c${id}`} g={g} item={null} catalog={base.data} /> : naoAchou;
  }
  if (atual.isPending) return <LoadingState label="Carregando o exercício…" />;
  return atual.data ? <Editor key={id} g={g} item={atual.data} catalog={null} /> : naoAchou;
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/exercises/[exerciseId]/page.tsx`. */
export default function OrgExerciseScreen() {
  const { groupId, exerciseId, catalog } = useLocalSearchParams<{
    groupId: string;
    exerciseId: string;
    catalog?: string;
  }>();
  return (
    <OrgPanel groupId={groupId}>
      {(g) => <Carregar g={g} exerciseId={exerciseId} catalogo={catalog === '1'} />}
    </OrgPanel>
  );
}
