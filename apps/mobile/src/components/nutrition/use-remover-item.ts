import { useMutation } from '@tanstack/react-query';
import { mealItemRestoreInput, nutritionApi, undoMessage, type MealItem } from '@fatia/api-client';
import { useToast } from '@/components/ui/toast';

/**
 * Remove um item da refeição na hora e oferece "Desfazer", que o devolve à
 * mesma refeição (`undo.ts` do api-client). A refeição inteira continua com
 * confirmação: refazê-la é caro.
 */
export function useRemoverItem(invalidar: () => void) {
  const toast = useToast();

  const devolver = useMutation({
    mutationFn: (item: MealItem) => nutritionApi.addItem(item.mealId, mealItemRestoreInput(item)),
    onSuccess: invalidar,
    onError: () => toast.show({ message: 'Não deu para desfazer. Adicione o item de novo.' }),
  });

  return useMutation({
    mutationFn: (item: MealItem) => nutritionApi.deleteItem(item.id),
    onSuccess: (_r, item) => {
      invalidar();
      toast.show({
        message: `${undoMessage('mealItem')}: ${item.foodName}`,
        action: { label: 'Desfazer', onPress: () => devolver.mutate(item) },
      });
    },
  });
}
