import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Play, Search, Star, X } from 'lucide-react-native';
import {
  addSelectionLabel,
  MUSCLE_GROUP_LABEL,
  MUSCLE_GROUPS,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import {
  cn,
  DiscardGuard,
  Drawer,
  DrawerDescription,
  DrawerFlatList,
  DrawerFooter,
  DrawerHeader,
  DrawerTextInput,
  DrawerTitle,
  useConfirm,
} from '@/components/ui';
import { colors } from '@/theme/colors';
import { headerButtonClass } from '@/components/layout/tab-header';
import { CommunityBadge, MyGymToggle, useInCommunity } from './my-gym-filter';
import { ExerciseGroupLine, ExerciseThumb } from './plan-exercise-row';
import { groupColorName } from './workout-home';

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
  /** A aba que abre (o "Só cardio" do treino livre abre em Cardio, #381). */
  initialTab?: Tab;
}

export type AddExerciseTab = 'favoritos' | 'todos' | (typeof MUSCLE_GROUPS)[number];
type Tab = AddExerciseTab;

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
  initialTab,
}: Props) {
  const qc = useQueryClient();
  const ask = useConfirm();
  const multi = !!planId || !!onAddMany;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [naAcademia, setNaAcademia] = useState(false);
  const firstTab: Tab = initialTab ?? (multi ? 'favoritos' : 'todos');
  const [tab, setTab] = useState<Tab>(firstTab);
  const [selected, setSelected] = useState<Map<number, Exercise>>(new Map());
  const emComunidade = useInCommunity(open);

  // Ajuste durante o render, e não num efeito (#187): limpa ao fechar.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    // Ao abrir, a aba pedida agora (ela muda: o "Só cardio" só vale na primeira vez).
    if (open) setTab(firstTab);
    if (!open) {
      setQ('');
      setDebounced('');
      setNaAcademia(false);
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

  const count = selected.size;

  return (
    // Al-T8: tela cheia, abaixo só da área segura; a barra de baixo some com a folha.
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      {/* Exercícios marcados e não adicionados: fechar pergunta antes (#483). */}
      <DiscardGuard
        dirty={count > 0 && !addBatch.isPending}
        description="Os exercícios marcados ainda não entraram no plano."
      />
      <DrawerHeader>
        <View className="flex-row items-center gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Fechar"
            onPress={() => {
              if (count === 0) return onOpenChange(false);
              ask({
                title: 'Descartar alterações?',
                description: 'Os exercícios marcados ainda não entraram no plano.',
                confirmLabel: 'Descartar',
                cancelLabel: 'Continuar editando',
                destructive: true,
                onConfirm: () => onOpenChange(false),
              });
            }}
            className={headerButtonClass()}
          >
            <X size={22} color={colors.foreground} />
          </Pressable>
          <View className="min-w-0 flex-1">
            <DrawerTitle className="text-center font-display-semibold text-[17px]">
              {planName ? `Adicionar ao ${planName}` : 'Adicionar exercício'}
            </DrawerTitle>
          </View>
          {multi ? (
            <View
              accessibilityLabel={`${count} ${count === 1 ? 'selecionado' : 'selecionados'}`}
              className={cn(
                'h-[22px] min-w-11 items-center justify-center rounded-pill px-[9px]',
                !count && 'bg-muted',
              )}
              style={count ? { backgroundColor: `${colors.primary}1f` } : undefined}
            >
              <Text
                className={cn(
                  'font-sans-extrabold text-[11px]',
                  count ? 'text-primary' : 'text-muted-foreground',
                )}
              >
                {count}
              </Text>
            </View>
          ) : (
            <View className="w-11" />
          )}
        </View>
        <DrawerDescription className="sr-only h-0 opacity-0">
          {multi
            ? 'Marque quantos quiser. Eles entram no fim do plano, na ordem em que você marcou.'
            : 'Busque e selecione um exercício.'}
        </DrawerDescription>
      </DrawerHeader>

      <View className="gap-3 px-4 pb-3">
        <View className="h-14 flex-row items-center gap-2.5 rounded-pill bg-card px-4">
          <Search size={18} color={colors.mutedForeground} />
          <DrawerTextInput
            value={q}
            onChangeText={setQ}
            accessibilityLabel="Buscar exercício"
            placeholder="Supino, remada, agachamento..."
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.primaryText}
            className="min-h-[44px] flex-1 bg-transparent text-base text-foreground"
          />
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          className="-mx-4"
          contentContainerClassName="gap-2 px-4"
          accessibilityLabel="Filtrar por grupo"
        >
          {TABS.map((t) => {
            const on = tab === t.value;
            const dot = t.value !== 'favoritos' && t.value !== 'todos';
            return (
              <Pressable
                key={t.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setTab(t.value)}
                className={cn(
                  'h-9 flex-row items-center gap-1.5 rounded-[12px] px-3.5 active:opacity-80',
                  on ? 'bg-foreground' : 'bg-card',
                )}
              >
                {t.value === 'favoritos' ? (
                  <Star size={14} color={on ? colors.background : colors.mutedForeground} />
                ) : null}
                {dot ? (
                  <View
                    className="h-[7px] w-[7px] rounded-[2px]"
                    style={{ backgroundColor: colors[groupColorName(t.value)] }}
                  />
                ) : null}
                <Text
                  className={cn(
                    'font-sans-semibold text-sm',
                    on ? 'text-background' : 'text-muted-foreground',
                  )}
                >
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        {emComunidade ? <MyGymToggle checked={naAcademia} onChange={setNaAcademia} /> : null}
      </View>

      <DrawerFlatList
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerClassName="px-4"
        data={search.isFetching ? [] : results}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item: Exercise) => String(item.id)}
        ListEmptyComponent={
          search.isFetching ? (
            <Text className="px-1 py-3 text-sm text-faint">Buscando...</Text>
          ) : favEmpty ? (
            <View className="items-center gap-2 rounded-card bg-card px-6 py-8">
              <View
                className="mb-1 h-12 w-12 items-center justify-center rounded-2xl"
                style={{ backgroundColor: `${colors.warning}29` }}
              >
                <Star size={20} color={colors.steps} />
              </View>
              <Text className="font-display text-base text-foreground">Nenhum favorito ainda</Text>
              <Text className="text-center text-sm text-muted-foreground">
                Toque em Favoritar no Como fazer de um exercício. Ele aparece aqui e primeiro nas
                sugestões.
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setTab('todos')}
                className="mt-1 h-11 flex-row items-center gap-2 rounded-[12px] bg-muted px-[18px] active:opacity-80"
              >
                <Play size={16} color={colors.foreground} />
                <Text className="font-sans-bold text-sm text-foreground">
                  Ver todos os exercícios
                </Text>
              </Pressable>
            </View>
          ) : (
            <View className="items-center rounded-card bg-card px-4 py-6">
              <Text className="font-sans-semibold text-sm text-foreground">
                {term ? `Nada com “${term}”` : 'Nenhum exercício aqui.'}
              </Text>
              {term ? (
                <Text className="text-xs text-faint">Tente outro nome ou o grupo muscular</Text>
              ) : null}
            </View>
          )
        }
        renderItem={({ item, index }: { item: Exercise; index: number }) => {
          const on = selected.has(item.id);
          const inPlan = existingExerciseIds.has(item.id);
          const last = index === results.length - 1;
          const sub = [item.muscleGroup, item.equipment, inPlan ? 'já no plano' : null]
            .filter(Boolean)
            .join(' · ');
          return (
            // O card único da lista (Al-T8): cada linha leva o pedaço do fundo
            // e os cantos da primeira e da última.
            <View
              className={cn(
                'bg-card px-4',
                index === 0 && 'rounded-t-card',
                last && 'rounded-b-card',
              )}
            >
              <Pressable
                accessibilityRole={multi ? 'checkbox' : 'button'}
                accessibilityLabel={`${item.name}${item.favorite ? ', favorito' : ''}, ${sub}`}
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
                  'min-h-[84px] flex-row items-center gap-3 py-2.5 active:opacity-80',
                  index > 0 && 'border-t border-border',
                  inPlan && 'opacity-50',
                )}
              >
                <ExerciseThumb group={item.muscleGroup} />
                <View className="min-w-0 flex-1 gap-0.5">
                  <View className="flex-row items-center gap-1.5">
                    <Text className="shrink font-sans-semibold text-[15px] text-foreground">
                      {item.name}
                    </Text>
                    {item.favorite ? (
                      <Star
                        size={14}
                        color={colors.mutedForeground}
                        fill={colors.mutedForeground}
                      />
                    ) : null}
                  </View>
                  <View className="flex-row flex-wrap items-center gap-x-2 gap-y-1">
                    <ExerciseGroupLine
                      group={item.muscleGroup}
                      detail={inPlan ? 'já no plano' : item.equipment}
                    />
                    {item.communityName ? (
                      <CommunityBadge name={item.communityName} />
                    ) : item.source === 'CUSTOM' ? (
                      <View className="rounded-pill bg-muted px-2 py-0.5">
                        <Text className="font-sans-bold text-[11px] text-foreground">custom</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                {multi ? (
                  <View
                    className={cn(
                      'h-7 w-7 items-center justify-center rounded-full',
                      on || inPlan ? 'bg-primary' : 'border-2 border-border-strong',
                    )}
                  >
                    {on || inPlan ? <Check size={16} color={colors.primaryForeground} /> : null}
                  </View>
                ) : null}
              </Pressable>
            </View>
          );
        }}
      />

      <DrawerFooter className="pb-8">
        {addBatch.isError ? (
          <Text accessibilityRole="alert" className="text-sm text-danger">
            Não foi possível adicionar. Tente de novo.
          </Text>
        ) : null}
        {multi ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: count === 0 || addBatch.isPending }}
            disabled={count === 0 || addBatch.isPending}
            onPress={confirm}
            className={cn(
              'h-14 items-center justify-center rounded-pill active:opacity-80',
              count ? 'bg-primary' : 'bg-card',
            )}
          >
            <Text
              className={cn(
                'font-sans-bold text-[15px]',
                count ? 'text-primary-foreground' : 'text-faint',
              )}
            >
              {addBatch.isPending ? 'Adicionando...' : addSelectionLabel(count)}
            </Text>
          </Pressable>
        ) : null}
      </DrawerFooter>
    </Drawer>
  );
}
