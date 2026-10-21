import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Plus, Search } from 'lucide-react-native';
import { groupExerciseApi, workoutApi, type Exercise, type MyGroup } from '@fatia/api-client';
import {
  DrawerOption,
  NewButton,
  RowChevron,
  SectionHeader,
} from '@/components/content/content-ui';
import { GymEquipmentDrawer } from '@/components/org/gym-equipment-drawer';
import { OrgPanel, orgKeys, PanelCard } from '@/components/org/org-panel';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFlatList,
  DrawerFooter,
  DrawerHeader,
  DrawerTextInput,
  DrawerTitle,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/ui';
import { EquipmentSummary } from '@/components/workout/equipment-chooser';
import { cores } from '@/theme/cores';

/** O resumo do equipamento da academia; a lista inteira abre no drawer. */
function GymEquipmentCard({
  g,
  equipment,
  customEquipment,
  onOpen,
}: {
  g: MyGroup;
  equipment: string[];
  customEquipment: string[];
  onOpen: () => void;
}) {
  const dono = g.role === 'OWNER';
  return (
    <PanelCard title="Equipamento da academia">
      <Text className="text-xs text-muted-foreground">
        {dono
          ? 'O filtro "Na minha academia" mostra o que dá para fazer com isto. Peso corporal vale sempre.'
          : 'Só o dono muda. O filtro "Na minha academia" usa esta lista.'}
      </Text>
      <EquipmentSummary equipment={equipment} custom={customEquipment} />
      <Button size="sm" variant="outline" className="self-start" onPress={onOpen}>
        {dono ? 'Editar equipamento' : 'Ver equipamento'}
      </Button>
    </PanelCard>
  );
}

/**
 * "Novo exercício": criar um da casa ou gravar o tutorial de um do catálogo.
 * Antes eram "Exercício da casa" (que criava) e "Tutorial do catálogo" (que
 * abria e fechava uma busca no meio da tela, trocando o próprio rótulo para
 * "Fechar a busca") — nenhum dos dois dizia o que fazia.
 */
function NewExerciseDrawer({
  open,
  onOpenChange,
  onCreate,
  onPickCatalog,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: () => void;
  onPickCatalog: () => void;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Novo exercício</DrawerTitle>
          <DrawerDescription>Quem treina na comunidade vê estes primeiro.</DrawerDescription>
        </DrawerHeader>
        <View className="gap-2 px-4 pt-2">
          <DrawerOption
            icon={Plus}
            title="Exercício da casa"
            description="Do zero: nome, grupo muscular, passos, vídeo e fotos."
            onPress={onCreate}
          />
          <DrawerOption
            icon={BookOpen}
            title="Tutorial de um exercício do catálogo"
            description="O exercício já existe; a equipe grava o vídeo, as fotos e as dicas."
            onPress={onPickCatalog}
          />
        </View>
      </DrawerContent>
    </Drawer>
  );
}

/** Busca no catálogo geral para gravar o tutorial da comunidade por cima. */
function CatalogPickerDrawer({
  open,
  onOpenChange,
  existing,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existing: Set<number>;
  onPick: (exercise: Exercise) => void;
}) {
  const [q, setQ] = useState('');
  const [termo, setTermo] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setTermo(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);
  const busca = useQuery({
    queryKey: ['workout', 'exercises', termo, 'catalog-picker'],
    queryFn: () => workoutApi.searchExercises(termo || undefined),
    enabled: open,
  });
  const itens = busca.data?.filter((e) => e.createdByUserId === null && !e.groupOwned) ?? [];

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <DrawerHeader>
        <DrawerTitle>Tutorial do catálogo</DrawerTitle>
        <DrawerDescription>
          Escolha o exercício que vai ganhar o tutorial da equipe.
        </DrawerDescription>
      </DrawerHeader>
      <View className="px-4 py-3">
        <View className="relative justify-center">
          <View className="absolute left-3 z-10">
            <Search size={16} color={cores.mutedForeground} />
          </View>
          <DrawerTextInput
            value={q}
            onChangeText={setQ}
            accessibilityLabel="Buscar no catálogo"
            placeholder="Ex.: supino, agachamento…"
            placeholderTextColor={cores.placeholder}
            selectionColor={cores.primary}
            className="min-h-[44px] rounded-md border border-input bg-transparent py-2 pl-9 pr-3 text-sm text-foreground"
          />
        </View>
      </View>
      <DrawerFlatList
        className="flex-1"
        data={itens.slice(0, 30)}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(e: Exercise) => String(e.id)}
        ItemSeparatorComponent={() => <View className="h-px bg-border" />}
        ListEmptyComponent={
          <Text className="px-4 py-3 text-sm text-muted-foreground">
            {busca.isFetching ? 'Buscando…' : 'Nenhum exercício do catálogo com esse nome.'}
          </Text>
        }
        renderItem={({ item: e }: { item: Exercise }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${e.name}${existing.has(e.id) ? ', já tem tutorial' : ''}`}
            onPress={() => onPick(e)}
            className="min-h-[52px] flex-row items-center gap-3 px-4 py-3 active:bg-accent"
          >
            <View className="flex-1">
              <Text className="text-sm font-medium text-foreground">{e.name}</Text>
              <Text className="text-xs capitalize text-muted-foreground">
                {[e.muscleGroup, e.equipment].filter(Boolean).join(' · ')}
                {existing.has(e.id) ? ' · já tem tutorial' : ''}
              </Text>
            </View>
            <RowChevron />
          </Pressable>
        )}
      />
      <DrawerFooter>
        <Button variant="ghost" onPress={() => onOpenChange(false)}>
          Cancelar
        </Button>
      </DrawerFooter>
    </Drawer>
  );
}

function ExerciseList({
  g,
  onNew,
  onEditEquipment,
}: {
  g: MyGroup;
  onNew: () => void;
  onEditEquipment: () => void;
}) {
  const router = useRouter();
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
      <SectionHeader
        title="Exercícios"
        count={lista.data?.items.length}
        action={<NewButton label="Novo exercício" onPress={onNew} />}
      />
      {lista.isPending ? (
        <LoadingState label="Carregando os exercícios…" />
      ) : lista.isError ? (
        <ErrorState error={lista.error} onRetry={() => void lista.refetch()} />
      ) : lista.data.items.length ? (
        lista.data.items.map((e) => (
          <Pressable
            key={e.exerciseId}
            accessibilityRole="link"
            accessibilityLabel={`${e.name}, ${e.ownedByCommunity ? 'da casa' : 'do catálogo'}`}
            onPress={() => router.push(`${base}/${e.exerciseId}`)}
            className="flex-row items-center gap-3 rounded-2xl border border-border bg-card p-3 active:opacity-80"
          >
            <View className="flex-1 gap-1">
              <Text numberOfLines={1} className="text-sm font-semibold text-foreground">
                {e.name}
              </Text>
              <Text className="text-xs text-muted-foreground">
                {[
                  e.ownedByCommunity ? 'Da casa' : 'Catálogo',
                  e.muscleGroup,
                  e.video ? 'vídeo' : null,
                  e.photos.length ? `${e.photos.length} foto(s)` : null,
                  `por ${e.authorName}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <RowChevron />
          </Pressable>
        ))
      ) : (
        <EmptyState
          title="Nenhum exercício ainda"
          description="Crie os exercícios da casa ou grave o tutorial de um exercício do catálogo."
          action={<NewButton label="Novo exercício" onPress={onNew} />}
        />
      )}
      {lista.data ? (
        <GymEquipmentCard
          g={g}
          equipment={lista.data.equipment}
          customEquipment={lista.data.customEquipment}
          onOpen={onEditEquipment}
        />
      ) : null}
    </>
  );
}

/** Equivalente de `apps/web/src/app/(org)/org/[groupId]/exercises/page.tsx`. */
export default function OrgExercisesScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const router = useRouter();
  const [novoAberto, setNovoAberto] = useState(false);
  const [catalogoAberto, setCatalogoAberto] = useState(false);
  const [equipmentOpen, setEquipmentOpen] = useState(false);
  // A mesma consulta da lista (o React Query não repete a requisição): o drawer
  // mora fora dela e precisa saber o que já tem tutorial.
  const lista = useQuery({
    queryKey: orgKeys.exercises(groupId),
    queryFn: () => groupExerciseApi.list(groupId),
  });
  const existentes = new Set(lista.data?.items.map((e) => e.exerciseId) ?? []);
  return (
    <OrgPanel
      groupId={groupId}
      drawers={(g) => {
        const base = `/org/${g.id}/exercises`;
        return (
          <>
            <NewExerciseDrawer
              open={novoAberto}
              onOpenChange={setNovoAberto}
              onCreate={() => {
                setNovoAberto(false);
                router.push(`${base}/new`);
              }}
              onPickCatalog={() => {
                setNovoAberto(false);
                setCatalogoAberto(true);
              }}
            />
            <CatalogPickerDrawer
              open={catalogoAberto}
              onOpenChange={setCatalogoAberto}
              existing={existentes}
              onPick={(e) => {
                setCatalogoAberto(false);
                router.push(existentes.has(e.id) ? `${base}/${e.id}` : `${base}/${e.id}?catalog=1`);
              }}
            />
            <GymEquipmentDrawer
              groupId={g.id}
              open={equipmentOpen}
              onOpenChange={setEquipmentOpen}
            />
          </>
        );
      }}
    >
      {(g) => (
        <ExerciseList
          g={g}
          onNew={() => setNovoAberto(true)}
          onEditEquipment={() => setEquipmentOpen(true)}
        />
      )}
    </OrgPanel>
  );
}
