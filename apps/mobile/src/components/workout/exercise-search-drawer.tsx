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
 * Réplica de `apps/web/src/components/workout/exercise-search-drawer.tsx`.
 *
 * Registra uma série mínima do exercício escolhido na sessão em andamento — é
 * como o PWA faz o exercício "aparecer" no treino livre.
 */

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
}

export function ExerciseSearchDrawer({ open, onOpenChange, sessionId }: Props) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');

  // Ajuste durante o render, e não num efeito (#187). A comparação é a mesma que
  // estava no array de dependências, então a limpeza acontece no mesmo fechamento
  // — só que antes de pintar. Não há passagem de montagem porque os campos já
  // nascem vazios: no efeito, a rodada de montagem era um no-op.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (!open) {
      setQ('');
      setDebounced('');
    }
  }

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ['workout', 'exercises', debounced],
    queryFn: () => workoutApi.searchExercises(debounced || undefined),
    enabled: open,
  });

  const logSet = useMutation({
    mutationFn: (exercise: Exercise) =>
      workoutApi.logSet(sessionId, {
        exerciseId: exercise.id,
        ...(isCardioExercise(exercise) ? { durationSeconds: 60 } : { reps: 1 }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout', 'active'] });
      qc.invalidateQueries({ queryKey: ['workout', 'session', sessionId] });
      onOpenChange(false);
    },
  });

  const filtered =
    debounced.trim().length < 2
      ? search.data
      : search.data?.filter((e) => e.name.toLowerCase().includes(debounced.toLowerCase()));

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <DrawerHeader>
        <DrawerTitle>Adicionar exercício</DrawerTitle>
        <DrawerDescription>Busque um exercício para registrar.</DrawerDescription>
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
            disabled={logSet.isPending}
            onPress={() => logSet.mutate(item)}
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
