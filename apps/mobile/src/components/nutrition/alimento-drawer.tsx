import { Alert, View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  customFoodToForm,
  emptyCustomFoodForm,
  nutritionApi,
  type CustomFoodInput,
  type Food,
} from '@fatia/api-client';
import { Button, Drawer, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui';
import { FormularioDeAlimento } from './formulario-de-alimento';
import { mensagemDeErro } from './helpers';

/**
 * Réplica de `apps/web/src/components/nutrition/custom-food-drawer.tsx`:
 * cadastro (`food` nulo) ou edição, com apagar confirmado.
 */
export function AlimentoDrawer({
  open,
  onOpenChange,
  food,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  food: Food | null;
}) {
  const qc = useQueryClient();

  const concluir = () => {
    // A busca e os atalhos guardam nome e valores do alimento.
    void qc.invalidateQueries({ queryKey: ['nutrition', 'custom-foods'] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'search'] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'my-foods'] });
    onOpenChange(false);
  };

  const salvar = useMutation<Food, Error, CustomFoodInput>({
    mutationFn: (input) =>
      food ? nutritionApi.updateCustomFood(food.id, input) : nutritionApi.createCustomFood(input),
    onSuccess: concluir,
  });

  const apagar = useMutation<void, Error, number>({
    mutationFn: (id) => nutritionApi.deleteCustomFood(id),
    onSuccess: concluir,
  });

  const confirmarApagar = (alvo: Food) =>
    Alert.alert(
      `Apagar "${alvo.name}"?`,
      'Some da busca e dos atalhos. As refeições já registradas continuam com o nome e os valores.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Apagar', style: 'destructive', onPress: () => apagar.mutate(alvo.id) },
      ],
    );

  const falha = salvar.error ?? apagar.error;

  return (
    <Drawer open={open} onOpenChange={onOpenChange} snapPoints={['85%']}>
      <View className="flex-1 bg-background">
        <DrawerHeader>
          <DrawerTitle>{food ? 'Editar alimento' : 'Novo alimento'}</DrawerTitle>
          <DrawerDescription>
            {food
              ? 'Valores por 100 g. As medidas se ajustam ao registrar.'
              : 'Copie o rótulo. Ele aparece na busca ao registrar uma refeição.'}
          </DrawerDescription>
        </DrawerHeader>
        {open ? (
          <FormularioDeAlimento
            key={food?.id ?? 'novo'}
            inicial={food ? customFoodToForm(food) : emptyCustomFoodForm()}
            editando={!!food}
            rotuloDoEnvio="Salvar"
            enviando={salvar.isPending}
            erro={falha ? mensagemDeErro(falha, { conflito: falha.message }) : undefined}
            onEnviar={(input) => salvar.mutate(input)}
            onCancelar={() => onOpenChange(false)}
            rotuloDoCancelar="Cancelar"
            rodape={
              food ? (
                <Button variant="ghost" onPress={() => confirmarApagar(food)}>
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
