import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  customFoodPatch,
  customFoodToForm,
  emptyCustomFoodForm,
  nutritionApi,
  type CustomFoodForm as FormValues,
  type CustomFoodInput,
  type Food,
} from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  useConfirm,
} from '@/components/ui';
import { CustomFoodForm } from './custom-food-form';
import { mensagemDeErro } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/custom-food-drawer.tsx`:
 * cadastro (`food` nulo) ou edição, com apagar confirmado. `initial` chega
 * preenchido pelo leitor (o rótulo lido, o código não achado).
 */
export function CustomFoodDrawer({
  open,
  onOpenChange,
  food,
  initial,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  food: Food | null;
  initial?: FormValues;
  onSaved?: (food: Food) => void;
}) {
  const confirm = useConfirm();
  const qc = useQueryClient();

  const done = () => {
    // A busca e os atalhos guardam nome e valores do alimento.
    void qc.invalidateQueries({ queryKey: ['nutrition', 'custom-foods'] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
    onOpenChange(false);
  };

  const save = useMutation<Food, Error, CustomFoodInput>({
    mutationFn: (input) =>
      food
        ? nutritionApi.updateCustomFood(food.id, customFoodPatch(input))
        : nutritionApi.createCustomFood(input),
    onSuccess: (saved) => {
      done();
      onSaved?.(saved);
    },
  });

  const remove = useMutation<void, Error, number>({
    mutationFn: (id) => nutritionApi.deleteCustomFood(id),
    onSuccess: done,
  });

  const confirmRemove = (target: Food) =>
    confirm({
      title: `Apagar "${target.name}"?`,
      description:
        'Some da busca e dos atalhos. As refeições já registradas continuam com o nome e os valores.',
      confirmLabel: 'Apagar',
      destructive: true,
      onConfirm: () => remove.mutate(target.id),
    });

  const failure = save.error ?? remove.error;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <View className="flex-1 bg-background">
        <DrawerHeader>
          <DrawerTitle>{food ? 'Editar alimento' : 'Novo alimento'}</DrawerTitle>
          <DrawerDescription>
            {food
              ? 'Valores por 100 g. As medidas se ajustam ao registrar.'
              : 'Confira o rótulo. Ele aparece na busca ao registrar uma refeição.'}
          </DrawerDescription>
        </DrawerHeader>
        {open ? (
          <CustomFoodForm
            key={food?.id ?? 'novo'}
            initial={food ? customFoodToForm(food) : (initial ?? emptyCustomFoodForm())}
            editing={!!food}
            submitLabel="Salvar"
            pending={save.isPending}
            error={failure ? mensagemDeErro(failure, { conflito: failure.message }) : undefined}
            onSubmit={(input) => save.mutate(input)}
            onCancel={() => onOpenChange(false)}
            cancelLabel="Cancelar"
            footer={
              food ? (
                <Button variant="ghost" onPress={() => confirmRemove(food)}>
                  Apagar alimento
                </Button>
              ) : null
            }
          />
        ) : null}
      </View>
    </Drawer>
  );
}
