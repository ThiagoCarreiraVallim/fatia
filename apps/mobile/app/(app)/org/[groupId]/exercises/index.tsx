import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EQUIPMENT_LABEL,
  GYM_EQUIPMENT,
  groupExerciseApi,
  workoutApi,
  type MyGroup,
} from '@fatia/api-client';
import { OrgPanel, orgKeys, PanelCard, apiMessage } from '@/components/org/org-panel';
import { Button, EmptyState, Input, LoadingState, cn } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

function Equipamento({ g, equipment }: { g: MyGroup; equipment: string[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const dono = g.role === 'OWNER';
  const [marcados, setMarcados] = useState(new Set(equipment));
  // Ajuste durante o render, e não num efeito (#187).
  const [salvo, setSalvo] = useState(equipment);
  if (salvo !== equipment) {
    setSalvo(equipment);
    setMarcados(new Set(equipment));
  }
  const mudou = marcados.size !== equipment.length || equipment.some((e) => !marcados.has(e));
  const salvar = useMutation({
    mutationFn: () => groupExerciseApi.setEquipment(g.id, [...marcados]),
    onSuccess: () => {
      toast.show({ message: 'Equipamento salvo.' });
      void qc.invalidateQueries({ queryKey: orgKeys.exercises(g.id) });
    },
    onError: (err) => toast.show({ message: apiMessage(err, 'Não deu para salvar agora.') }),
  });

  return (
    <PanelCard title="Equipamento da academia">
      <Text className="text-xs text-muted-foreground">
        {dono
          ? 'O filtro "Na minha academia" mostra o que dá para fazer com isto. Peso corporal vale sempre.'
          : 'Só o dono muda. O filtro "Na minha academia" usa esta lista.'}
      </Text>
      <View className="flex-row flex-wrap gap-2">
        {GYM_EQUIPMENT.map((e) => {
          const on = marcados.has(e);
          return (
            <Pressable
              key={e}
              disabled={!dono}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !dono }}
              onPress={() => {
                const proximo = new Set(marcados);
                if (on) proximo.delete(e);
                else proximo.add(e);
                setMarcados(proximo);
              }}
              className={cn(
                'min-h-[40px] justify-center rounded-full border px-3 active:opacity-80',
                on ? 'border-primary bg-accent' : 'border-border',
              )}
            >
              <Text
                className={cn('text-xs font-semibold', on ? 'text-primary' : 'text-foreground')}
              >
                {EQUIPMENT_LABEL[e]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {dono ? (
        <Button
          size="sm"
          className="self-start"
          disabled={!mudou}
          loading={salvar.isPending}
          onPress={() => salvar.mutate()}
        >
          Salvar equipamento
        </Button>
      ) : null}
    </PanelCard>
  );
}

/** Busca no catálogo geral para gravar o tutorial da comunidade por cima. */
function DoCatalogo({ base, existing }: { base: string; existing: Set<number> }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [termo, setTermo] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTermo(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const busca = useQuery({
    queryKey: ['workout', 'exercises', termo, 'catalog-picker'],
    queryFn: () => workoutApi.searchExercises(termo || undefined),
  });
  const itens = busca.data?.filter((e) => e.createdByUserId === null && !e.groupOwned) ?? [];
  return (
    <PanelCard title="Escolha o exercício do catálogo">
      <Input
        value={q}
        onChangeText={setQ}
        accessibilityLabel="Buscar no catálogo"
        placeholder="Ex.: supino, agachamento…"
      />
      {itens.slice(0, 15).map((e) => (
        <Pressable
          key={e.id}
          accessibilityRole="button"
          accessibilityLabel={e.name}
          onPress={() =>
            router.push(existing.has(e.id) ? `${base}/${e.id}` : `${base}/${e.id}?catalog=1`)
          }
          className="min-h-[44px] justify-center border-b border-border py-2 active:opacity-80"
        >
          <Text className="text-sm font-medium text-foreground">{e.name}</Text>
          <Text className="text-xs capitalize text-muted-foreground">
            {[e.muscleGroup, e.equipment].filter(Boolean).join(' · ')}
            {existing.has(e.id) ? ' · já tem tutorial' : ''}
          </Text>
        </Pressable>
      ))}
    </PanelCard>
  );
}

function Exercicios({ g }: { g: MyGroup }) {
  const router = useRouter();
  const [escolhendo, setEscolhendo] = useState(false);
  const lista = useQuery({
    queryKey: orgKeys.exercises(g.id),
    queryFn: () => groupExerciseApi.list(g.id),
  });
  const base = `/org/${g.id}/exercises`;

  return (
    <>
      <Text className="text-xs text-muted-foreground">
        {`Quem treina em ${g.name} vê estes exercícios primeiro, com o vídeo, as fotos e as dicas da equipe.`}
      </Text>
      {lista.data ? <Equipamento g={g} equipment={lista.data.equipment} /> : null}
      <View className="flex-row flex-wrap gap-2">
        <Button size="sm" onPress={() => router.push(`${base}/new`)}>
          Exercício da casa
        </Button>
        <Button size="sm" variant="outline" onPress={() => setEscolhendo(!escolhendo)}>
          {escolhendo ? 'Fechar a busca' : 'Tutorial do catálogo'}
        </Button>
      </View>
      {escolhendo ? (
        <DoCatalogo
          base={base}
          existing={new Set(lista.data?.items.map((e) => e.exerciseId) ?? [])}
        />
      ) : null}
      {lista.isPending ? (
        <LoadingState label="Carregando os exercícios…" />
      ) : lista.data?.items.length ? (
        lista.data.items.map((e) => (
          <Pressable
            key={e.exerciseId}
            accessibilityRole="link"
            accessibilityLabel={e.name}
            onPress={() => router.push(`${base}/${e.exerciseId}`)}
            className="gap-1 rounded-2xl border border-border bg-card p-3 active:opacity-80"
          >
            <View className="flex-row items-center justify-between gap-2">
              <Text numberOfLines={1} className="flex-1 text-sm font-semibold text-foreground">
                {e.name}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {e.ownedByCommunity ? 'Da casa' : 'Catálogo'}
              </Text>
            </View>
            <Text className="text-xs text-muted-foreground">
              {[
                e.muscleGroup,
                e.video ? 'vídeo' : null,
                e.photos.length ? `${e.photos.length} foto(s)` : null,
                `por ${e.authorName}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </Pressable>
        ))
      ) : (
        <EmptyState
          title="Nenhum exercício ainda"
          description="Crie os exercícios da casa ou grave o tutorial de um exercício do catálogo."
        />
      )}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/exercises/page.tsx`. */
export default function OrgExercisesScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  return <OrgPanel groupId={groupId}>{(g) => <Exercicios g={g} />}</OrgPanel>;
}
