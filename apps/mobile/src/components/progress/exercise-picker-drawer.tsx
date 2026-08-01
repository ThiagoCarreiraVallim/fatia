import { useState } from 'react';
import { Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { workoutApi, type Exercise } from '@fatia/api-client';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFlatList,
  DrawerHeader,
  DrawerTitle,
  ErrorState,
  LoadingState,
} from '@/components/ui';
import { SheetField } from './sheet-field';

export type ExercisePickerFilter = 'cardio' | 'strength';

/**
 * Abre o seletor pedindo o resultado de volta.
 *
 * Os gráficos de força e cardio não montam o drawer eles mesmos — ver
 * `ui/drawer.tsx` para o porquê. Eles pedem a abertura à tela, que monta o
 * seletor fora do `ScrollView` e devolve o exercício escolhido por este retorno.
 */
export type OpenExercisePicker = (
  filter: ExercisePickerFilter,
  onPick: (exercise: Exercise) => void,
) => void;

/**
 * Réplica de `apps/web/src/components/progress/exercise-picker-drawer.tsx`.
 */
export function ExercisePickerDrawer({
  open,
  onClose,
  onPick,
  filter,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  /** `cardio` = só cardio; `strength` = tudo exceto cardio. */
  filter: ExercisePickerFilter;
}) {
  const [query, setQuery] = useState('');
  const { height } = useWindowDimensions();

  const exercises = useQuery({
    queryKey: ['exercises', 'search', query],
    queryFn: () => workoutApi.searchExercises(query || undefined),
    enabled: open,
  });

  const filtered = (exercises.data ?? []).filter((exercise) =>
    filter === 'cardio' ? exercise.muscleGroup === 'cardio' : exercise.muscleGroup !== 'cardio',
  );

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      // Lista longa precisa de altura fixa: com dimensionamento dinâmico o sheet
      // abriria ocupando a tela inteira e ainda assim sem rolagem previsível.
      snapPoints={['80%']}
    >
      <DrawerContent className="px-4">
        <DrawerHeader className="px-0">
          <DrawerTitle>
            {filter === 'cardio' ? 'Escolher exercício de cardio' : 'Escolher exercício de força'}
          </DrawerTitle>
          <DrawerDescription>
            {filter === 'cardio'
              ? 'Apenas exercícios marcados como cardio.'
              : 'Todos os exercícios exceto cardio.'}
          </DrawerDescription>
        </DrawerHeader>

        <View className="gap-3 py-3">
          <SheetField
            label="Buscar"
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar…"
            keyboardType="default"
            autoFocus
          />

          {exercises.isLoading ? <LoadingState label="" /> : null}

          {exercises.error ? (
            <ErrorState error={exercises.error} onRetry={() => exercises.refetch()} />
          ) : null}

          {!exercises.isLoading && !exercises.error ? (
            <DrawerFlatList
              data={filtered}
              style={{ height: Math.round(height * 0.45) }}
              keyExtractor={(exercise: Exercise) => String(exercise.id)}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <Text className="py-6 text-center text-xs text-muted-foreground">
                  Nenhum exercício encontrado.
                </Text>
              }
              renderItem={({ item }: { item: Exercise }) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${item.name}, ${item.muscleGroup}`}
                  onPress={() => onPick(item)}
                  className="min-h-[44px] flex-row items-center justify-between gap-2 rounded-lg px-3 py-2 active:bg-muted"
                >
                  <Text numberOfLines={1} className="flex-1 text-sm font-medium text-foreground">
                    {item.name}
                  </Text>
                  <Text className="text-[11px] capitalize text-muted-foreground">
                    {item.muscleGroup}
                  </Text>
                </Pressable>
              )}
            />
          ) : null}
        </View>
      </DrawerContent>
    </Drawer>
  );
}
