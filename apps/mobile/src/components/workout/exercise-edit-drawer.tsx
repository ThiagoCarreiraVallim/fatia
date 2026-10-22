import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BODYWEIGHT_EQUIPMENT,
  chooserQuery,
  OTHER_EQUIPMENT,
  sameEquipment,
  workoutApi,
  type Exercise,
} from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerScrollView,
  DrawerTextInput,
  DrawerTitle,
  FormMessage,
  Label,
} from '@/components/ui';
import { cores } from '@/theme/cores';
import { EquipmentChooser } from './equipment-chooser';

/**
 * Réplica de `apps/web/src/components/workout/exercise-edit-drawer.tsx`.
 */

interface Props {
  /** Exercício custom (ou cópia) a editar. */
  exercise: Exercise | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (exercise: Exercise) => void;
}

const FIELD_CLASS =
  'min-h-[44px] rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground';

export function ExerciseEditDrawer({ exercise, open, onOpenChange, onSaved }: Props) {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [equipment, setEquipment] = useState('');
  const [instructions, setInstructions] = useState('');
  const [showList, setShowList] = useState(false);
  // O equipamento próprio das academias da pessoa entra na lista, primeiro:
  // é com ele que o filtro "Na minha academia" casa o exercício pessoal.
  const gym = useQuery({
    queryKey: ['workout', 'equipment'],
    queryFn: () => workoutApi.gymEquipment(),
    enabled: open,
    staleTime: 60_000,
  });
  const custom = gym.data?.customEquipment ?? [];

  // Sincroniza os campos quando abre / muda de exercício. Ajuste durante o
  // render, e não num efeito (#187): a comparação é a mesma que estava no array
  // de dependências — identidade do objeto `exercise` — então os campos são
  // reespelhados nos mesmos momentos, só que antes de pintar. `previousExercise`
  // parte de `null` para reproduzir a passagem de montagem, em que o drawer já
  // chega com o exercício escolhido.
  const [previousExercise, setPreviousExercise] = useState<Exercise | null>(null);
  if (previousExercise !== exercise) {
    setPreviousExercise(exercise);
    if (exercise) {
      setName(exercise.name ?? '');
      setEquipment(exercise.equipment ?? '');
      setInstructions((exercise.instructions ?? []).join('\n'));
      setShowList(false);
    }
  }

  const save = useMutation({
    mutationFn: () => {
      if (!exercise) throw new Error('no exercise');
      return workoutApi.updateExercise(exercise.id, {
        name: name.trim(),
        equipment: equipment.trim(),
        instructions: instructions
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    },
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ['workout', 'exercises'] });
      qc.invalidateQueries({ queryKey: ['workout', 'exercise', exercise?.id] });
      onSaved?.(updated);
      onOpenChange(false);
    },
  });

  if (!exercise) return null;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['80%']}>
      <DrawerHeader>
        <DrawerTitle>Editar exercício</DrawerTitle>
        <DrawerDescription>
          Sua cópia editável. Os músculos do diagrama são mantidos.
        </DrawerDescription>
      </DrawerHeader>

      <DrawerScrollView className="flex-1 px-4" keyboardShouldPersistTaps="handled">
        <View className="gap-4 py-2">
          <View className="gap-1.5">
            <Label>Nome</Label>
            <DrawerTextInput
              value={name}
              onChangeText={setName}
              accessibilityLabel="Nome"
              placeholderTextColor={cores.placeholder}
              className={FIELD_CLASS}
            />
          </View>

          <View className="gap-1.5">
            <Label>Equipamento</Label>
            <DrawerTextInput
              value={equipment}
              onChangeText={setEquipment}
              accessibilityLabel="Equipamento"
              placeholder="Ex.: barra, halteres, leg press"
              placeholderTextColor={cores.placeholder}
              className={FIELD_CLASS}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showList }}
              onPress={() => setShowList(!showList)}
              className="min-h-[44px] justify-center self-start active:opacity-70"
            >
              <Text className="text-sm font-semibold text-primary">
                {showList ? 'Esconder a lista' : 'Escolher da lista'}
              </Text>
            </Pressable>
            {showList ? (
              // O campo acima é a busca: digitar filtra; tocar num item preenche.
              <EquipmentChooser
                single
                query={chooserQuery(equipment, custom)}
                custom={custom}
                customTitle="Da sua academia"
                extra={[
                  { key: BODYWEIGHT_EQUIPMENT, label: 'Peso corporal' },
                  { key: OTHER_EQUIPMENT, label: 'Outro' },
                ]}
                isSelected={(k) => sameEquipment(k, equipment)}
                onPick={(k) => {
                  setEquipment(k);
                  setShowList(false);
                }}
              />
            ) : null}
          </View>

          <View className="gap-1.5">
            <Label>Instruções (uma por linha)</Label>
            <DrawerTextInput
              value={instructions}
              onChangeText={setInstructions}
              accessibilityLabel="Instruções, uma por linha"
              multiline
              numberOfLines={6}
              textAlignVertical="top"
              placeholderTextColor={cores.placeholder}
              className={`${FIELD_CLASS} min-h-[140px]`}
            />
          </View>

          {save.isError ? <FormMessage>Não foi possível salvar</FormMessage> : null}
        </View>
      </DrawerScrollView>

      <DrawerFooter className="flex-row">
        <Button
          className="flex-1"
          disabled={name.trim().length === 0}
          loading={save.isPending}
          onPress={() => save.mutate()}
        >
          Salvar
        </Button>
        <Button variant="ghost" onPress={() => onOpenChange(false)}>
          Cancelar
        </Button>
      </DrawerFooter>
    </Drawer>
  );
}
