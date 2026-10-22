import { useState } from 'react';
import { Text, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  amountGrams,
  amountPayload,
  nutritionApi,
  type Amount,
  type FoodPortion,
  type MealItem,
} from '@fatia/api-client';
import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui';
import { DrawerInput } from './drawer-input';
import { mensagemDeErro } from './helpers';
import { SeletorDeQuantidade } from './seletor-de-quantidade';

/**
 * Réplica de `apps/web/src/components/nutrition/edit-meal-item-drawer.tsx`.
 *
 * Formulário curto, então o sheet dimensiona pelo conteúdo (`DrawerContent`,
 * sem `snapPoints`) — o teclado ocupa metade da tela e um sheet de altura fixa
 * empurraria o único campo para fora.
 */

/** Como o item foi gravado: na medida, se ela ainda existe; senão em gramas. */
function quantidadeDoItem(item: MealItem, medidas: FoodPortion[]): Amount {
  const medida = item.portionLabel ? medidas.find((m) => m.label === item.portionLabel) : undefined;
  return medida && item.portionQuantity
    ? { kind: 'portion', portionId: medida.id, quantity: item.portionQuantity }
    : { kind: 'grams', grams: String(item.grams) };
}

export function EditMealItemDrawer({
  item,
  date,
  onClose,
}: {
  item: MealItem | null;
  date: string;
  onClose: () => void;
}) {
  const aberto = item !== null;
  // `null` até a pessoa mexer: antes disso o valor sai do item e das medidas carregadas.
  const [editada, setEditada] = useState<Amount | null>(null);
  const [criadas, setCriadas] = useState<FoodPortion[]>([]);
  const qc = useQueryClient();

  // Ajuste durante o render, e não num efeito (#187): trocar de item descarta a edição.
  const [itemAnterior, setItemAnterior] = useState<MealItem | null>(null);
  if (itemAnterior !== item) {
    setItemAnterior(item);
    setEditada(null);
    setCriadas([]);
  }

  const foodId = item?.foodId ?? null;
  const consultaDeMedidas = useQuery({
    queryKey: ['nutrition', 'portions', foodId],
    queryFn: () => nutritionApi.portions(foodId as number),
    enabled: aberto && foodId !== null,
  });
  const medidas = [...(consultaDeMedidas.data ?? []), ...criadas];
  const quantidade: Amount | null = item ? (editada ?? quantidadeDoItem(item, medidas)) : null;
  const gramas = quantidade ? amountGrams(quantidade, medidas) : null;

  const salvar = useMutation({
    mutationFn: () => {
      if (!item || !quantidade || gramas === null) throw new Error('Quantidade inválida');
      return nutritionApi.updateItem(item.id, amountPayload(quantidade));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
      void qc.invalidateQueries({ queryKey: ['nutrition', 'history', 7] });
      onClose();
    },
  });

  const criarMedida = async (rotulo: string, g: number) => {
    if (foodId === null) throw new Error('Item sem alimento');
    const criada = await nutritionApi.createPortion(foodId, { label: rotulo, grams: g });
    setCriadas((anteriores) => [...anteriores, criada]);
    void qc.invalidateQueries({ queryKey: ['nutrition', 'portions', foodId] });
    return criada;
  };

  const erro = salvar.error
    ? mensagemDeErro(salvar.error, {
        conflito: 'Esse item já foi registrado nessa refeição.',
        alternativa: 'Não foi possível salvar. Tente de novo.',
      })
    : undefined;

  return (
    <Drawer open={aberto} onOpenChange={(estaAberto) => !estaAberto && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Editar item</DrawerTitle>
          <DrawerDescription>{item?.foodName}</DrawerDescription>
        </DrawerHeader>

        <View className="gap-4 px-4 py-3">
          {quantidade && foodId !== null ? (
            <SeletorDeQuantidade
              medidas={medidas}
              quantidade={quantidade}
              onChange={setEditada}
              onCriarMedida={criarMedida}
              autoFocus
            />
          ) : (
            // Item livre não tem alimento do catálogo, logo não tem medida para escolher.
            <DrawerInput
              label="Quantidade (g)"
              autoFocus
              keyboardType="numeric"
              inputMode="decimal"
              value={quantidade?.kind === 'grams' ? quantidade.grams : ''}
              onChangeText={(valor) => setEditada({ kind: 'grams', grams: valor })}
            />
          )}
          {erro ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {erro}
            </Text>
          ) : null}
        </View>

        <DrawerFooter className="flex-row">
          <Button variant="outline" className="flex-1" onPress={onClose}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onPress={() => salvar.mutate()}
            disabled={salvar.isPending || gramas === null}
            loading={salvar.isPending}
          >
            Salvar
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
