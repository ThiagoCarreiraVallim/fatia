import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Search, Star } from 'lucide-react-native';
import {
  addSelectionLabel,
  MUSCLE_GROUP_LABEL,
  MUSCLE_GROUPS,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import {
  Button,
  Chip,
  cn,
  Drawer,
  DrawerDescription,
  DrawerFlatList,
  DrawerFooter,
  DrawerHeader,
  DrawerTextInput,
  DrawerTitle,
} from '@/components/ui';
import { colors } from '@/theme/colors';
import { CommunityBadge, MyGymToggle, useInCommunity } from './my-gym-filter';

/**
 * Réplica de `apps/web/src/components/workout/add-exercise-drawer.tsx` (#378).
 *
 * Três modos, como no PWA: com `planId` marca vários e grava o lote numa
 * requisição (Al-T8); com `onAddMany` devolve a seleção (Novo plano, Al-T19);
 * só com `onAdd`, um por vez em memória (treino rápido).
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Já no plano: aparece marcado e não entra de novo (um por plano; a sessão agrupa por exercício). */
  existingExerciseIds: Set<number>;
  planId?: string;
  planName?: string;
  onAddMany?: (exercises: Exercise[]) => void;
  onAdd?: (exercise: Exercise) => void;
  /** Mantido por compatibilidade: a API põe no fim sozinha. */
  nextOrder?: number;
}

type Tab = 'favoritos' | 'todos' | (typeof MUSCLE_GROUPS)[number];

const TABS: Array<{ value: Tab; label: string }> = [
  { value: 'favoritos', label: 'Favoritos' },
  { value: 'todos', label: 'Todos' },
  ...MUSCLE_GROUPS.map((g) => ({ value: g as Tab, label: MUSCLE_GROUP_LABEL[g] })),
];

export function AddExerciseDrawer({
  open,
  onOpenChange,
  existingExerciseIds,
  planId,
  planName,
  onAddMany,
  onAdd,
}: Props) {
  const qc = useQueryClient();
  const multi = !!planId || !!onAddMany;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [naAcademia, setNaAcademia] = useState(false);
  const [tab, setTab] = useState<Tab>(multi ? 'favoritos' : 'todos');
  const [selected, setSelected] = useState<Map<number, Exercise>>(new Map());
  const emComunidade = useInCommunity(open);

  // Ajuste durante o render, e não num efeito (#187): limpa ao fechar.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setQ('');
      setDebounced('');
      setNaAcademia(false);
      setTab(multi ? 'favoritos' : 'todos');
      setSelected(new Map());
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const group = tab === 'favoritos' || tab === 'todos' ? undefined : tab;
  const search = useQuery({
    queryKey: ['workout', 'exercises', debounced, naAcademia, tab],
    queryFn: () =>
      workoutApi.searchExercises(debounced || undefined, group, {
        ...(naAcademia ? { onlyMyGym: true } : {}),
        ...(tab === 'favoritos' ? { favoritesOnly: true } : {}),
      }),
    enabled: open,
  });

  const addBatch = useMutation({
    mutationFn: (ids: number[]) => {
      if (!planId) throw new Error('planId required');
      return workoutApi.addPlanExercises(planId, ids);
    },
    onSuccess: (plan) => {
      if (planId) {
        if (plan?.exercises) qc.setQueryData(['workout', 'plan', planId], plan);
        qc.invalidateQueries({ queryKey: ['workout', 'plan', planId] });
        qc.invalidateQueries({ queryKey: ['workout', 'plans'] });
      }
      onOpenChange(false);
    },
  });

  function toggle(exercise: Exercise) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(exercise.id)) next.delete(exercise.id);
      else next.set(exercise.id, exercise);
      return next;
    });
  }

  function confirm() {
    // Duplo toque não vira dois lotes.
    if (selected.size === 0 || addBatch.isPending) return;
    const chosen = [...selected.values()];
    if (planId) addBatch.mutate(chosen.map((e) => e.id));
    else {
      onAddMany?.(chosen);
      onOpenChange(false);
    }
  }

  const results = search.data ?? [];
  const term = debounced.trim();
  const favEmpty = tab === 'favoritos' && !term && !search.isFetching && results.length === 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['90%']}>
      <DrawerHeader>
        <DrawerTitle>{planName ? `Adicionar ao ${planName}` : 'Adicionar exercício'}</DrawerTitle>
        <DrawerDescription>
          {multi
            ? 'Marque quantos quiser. Eles entram no fim do plano, na ordem em que você marcou.'
            : 'Busque e selecione um exercício.'}
        </DrawerDescription>
      </DrawerHeader>

      <View className="gap-2 px-4 py-3">
        <View className="relative justify-center">
          <View className="absolute left-3 z-10">
            <Search size={16} color={colors.mutedForeground} />
          </View>
          <DrawerTextInput
            value={q}
            onChangeText={setQ}
            accessibilityLabel="Buscar exercício"
            placeholder="Ex.: supino, corrida, agachamento..."
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.primaryText}
            className="min-h-[44px] rounded-md border border-input bg-transparent py-2 pl-9 pr-3 text-sm text-foreground"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="gap-2"
          accessibilityLabel="Filtrar por grupo"
        >
          {TABS.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              selected={tab === t.value}
              onPress={() => setTab(t.value)}
            />
          ))}
        </ScrollView>
        {emComunidade ? <MyGymToggle checked={naAcademia} onChange={setNaAcademia} /> : null}
      </View>

      <DrawerFlatList
        className="flex-1"
        data={search.isFetching ? [] : results}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item: Exercise) => String(item.id)}
        ItemSeparatorComponent={() => <View className="h-px bg-border" />}
        ListEmptyComponent={
          search.isFetching ? (
            <Text className="px-4 py-3 text-sm text-muted-foreground">Buscando...</Text>
          ) : favEmpty ? (
            <View className="items-center gap-2 px-6 py-8">
              <Star size={28} color={colors.mutedForeground} />
              <Text className="text-base font-semibold text-foreground">Nenhum favorito ainda</Text>
              <Text className="text-center text-sm text-muted-foreground">
                Toque em Favoritar no Como fazer de um exercício. Ele aparece aqui e primeiro nas
                sugestões.
              </Text>
              <Button variant="outline" size="sm" onPress={() => setTab('todos')}>
                Ver todos os exercícios
              </Button>
            </View>
          ) : (
            <View className="items-center px-4 py-6">
              <Text className="text-sm font-semibold text-foreground">
                {term ? `Nada com “${term}”` : 'Nenhum exercício aqui.'}
              </Text>
              {term ? (
                <Text className="text-xs text-muted-foreground">
                  Tente outro nome ou o grupo muscular
                </Text>
              ) : null}
            </View>
          )
        }
        renderItem={({ item }: { item: Exercise }) => {
          const on = selected.has(item.id);
          const inPlan = existingExerciseIds.has(item.id);
          const sub = [item.muscleGroup, item.equipment, inPlan ? 'já no plano' : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <Pressable
              accessibilityRole={multi ? 'checkbox' : 'button'}
              accessibilityLabel={`${item.name}, ${sub}`}
              accessibilityState={
                multi ? { checked: on || inPlan, disabled: inPlan } : { disabled: inPlan }
              }
              disabled={inPlan}
              onPress={() => {
                if (multi) toggle(item);
                else {
                  onAdd?.(item);
                  onOpenChange(false);
                }
              }}
              className={cn(
                'min-h-14 flex-row items-center gap-3 px-4 py-2 active:bg-accent',
                inPlan && 'opacity-50',
              )}
            >
              {multi ? (
                <View
                  className={cn(
                    'h-6 w-6 items-center justify-center rounded-[8px]',
                    on || inPlan ? 'bg-primary' : 'border-2 border-border-strong',
                  )}
                >
                  {on || inPlan ? <Check size={16} color={colors.primaryForeground} /> : null}
                </View>
              ) : null}
              <View className="flex-1 pr-2">
                <View className="flex-row items-center gap-1.5">
                  {item.favorite ? (
                    <Star size={12} color={colors.primaryText} fill={colors.primaryText} />
                  ) : null}
                  <Text numberOfLines={1} className="text-sm font-medium text-foreground">
                    {item.name}
                  </Text>
                </View>
                <Text className="text-xs capitalize text-muted-foreground">{sub}</Text>
              </View>
              {item.communityName ? (
                <CommunityBadge name={item.communityName} />
              ) : item.source === 'CUSTOM' ? (
                <View className="rounded bg-muted px-2 py-0.5">
                  <Text className="text-xs text-foreground">custom</Text>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />

      <DrawerFooter>
        {addBatch.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            Não foi possível adicionar. Tente de novo.
          </Text>
        ) : null}
        {multi ? (
          <Button
            className="h-12 rounded-full"
            disabled={selected.size === 0}
            loading={addBatch.isPending}
            onPress={confirm}
          >
            {addSelectionLabel(selected.size)}
          </Button>
        ) : (
          <Button variant="ghost" onPress={() => onOpenChange(false)}>
            Cancelar
          </Button>
        )}
      </DrawerFooter>
    </Drawer>
  );
}
