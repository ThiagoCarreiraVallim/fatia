import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search } from 'lucide-react-native';
import { isCardioExercise, workoutApi, type Exercise } from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFlatList,
  DrawerFooter,
  DrawerHeader,
  DrawerTextInput,
  DrawerTitle,
} from '@/components/ui';

/**
 * Réplica de `apps/web/src/components/workout/add-exercise-drawer.tsx`.
 *
 * Dois modos, como no PWA: com `planId` grava no plano pela API; sem ele
 * devolve o exercício por `onAdd` para quem guarda a lista em memória (a tela de
 * treino rápido, que só materializa o plano ao iniciar).
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingExerciseIds: Set<number>;
  planId?: string;
  nextOrder?: number;
  onAdd?: (exercise: Exercise) => void;
}

export function AddExerciseDrawer({
  open,
  onOpenChange,
  existingExerciseIds,
  planId,
  nextOrder,
  onAdd,
}: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    if (!open) {
      setQ('');
      setDebounced('');
    }
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ['workout', 'exercises', debounced],
    queryFn: () => workoutApi.searchExercises(debounced || undefined),
    enabled: open,
  });

  const add = useMutation({
    mutationFn: (exercise: Exercise) => {
      if (!planId) throw new Error('planId required for API mode');
      const cardio = isCardioExercise(exercise);
      return workoutApi.addPlanExercise(planId, {
        exerciseId: exercise.id,
        order: nextOrder ?? 1,
        targetSets: cardio ? 1 : 3,
        targetReps: cardio ? '—' : '8-12',
      });
    },
    onSuccess: () => {
      if (planId) qc.invalidateQueries({ queryKey: ['workout', 'plan', planId] });
      onOpenChange(false);
    },
  });

  function handleSelect(exercise: Exercise) {
    if (planId) {
      add.mutate(exercise);
    } else {
      onAdd?.(exercise);
      onOpenChange(false);
    }
  }

  const filtered = search.data?.filter((e) => !existingExerciseIds.has(e.id));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <DrawerHeader>
        <DrawerTitle>Adicionar exercício</DrawerTitle>
        <DrawerDescription>Busque e selecione um exercício para o plano.</DrawerDescription>
      </DrawerHeader>

      <View className="px-4 py-3">
        <View className="relative justify-center">
          <View className="absolute left-3 z-10">
            <Search size={16} color="#baccaf" />
          </View>
          <DrawerTextInput
            value={q}
            onChangeText={setQ}
            accessibilityLabel="Buscar exercício"
            placeholder="Ex.: supino, corrida, agachamento..."
            placeholderTextColor="#8a8a8a"
            selectionColor="#2ce500"
            className="min-h-[44px] rounded-md border border-input bg-transparent py-2 pl-9 pr-3 text-sm text-foreground"
          />
        </View>
      </View>

      <DrawerFlatList
        className="flex-1"
        data={filtered ?? []}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item: Exercise) => String(item.id)}
        ItemSeparatorComponent={() => <View className="h-px bg-border" />}
        ListEmptyComponent={
          <Text className="px-4 py-3 text-sm text-muted-foreground">
            {search.isFetching
              ? 'Buscando...'
              : debounced.trim().length > 0
                ? 'Nenhum resultado.'
                : 'Todos os exercícios carregados.'}
          </Text>
        }
        renderItem={({ item }: { item: Exercise }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.muscleGroup}`}
            disabled={add.isPending}
            onPress={() => handleSelect(item)}
            className="min-h-[44px] flex-row items-center justify-between px-4 py-3 active:bg-accent"
          >
            <View className="flex-1 pr-2">
              <Text className="text-sm font-medium text-foreground">{item.name}</Text>
              <Text className="text-xs text-muted-foreground">{item.muscleGroup}</Text>
            </View>
            {item.source === 'CUSTOM' ? (
              <View className="rounded bg-muted px-2 py-0.5">
                <Text className="text-xs text-foreground">custom</Text>
              </View>
            ) : null}
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
