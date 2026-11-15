import { useState } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  amountGrams,
  amountPayload,
  formatDecimal,
  nutritionApi,
  scaleMealItem,
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
  Icon,
  useConfirm,
} from '@/components/ui';
import { TABULAR } from '@/components/today/parts';
import { colors } from '@/theme/colors';
import { DrawerInput } from './drawer-input';
import { mensagemDeErro } from './helpers';
import { AmountPicker } from './amount-picker';

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

const oneDecimal = (n: number) => formatDecimal(n, 1).replace(/,0$/, '');

/**
 * Editar item (prancha Al-N14): quantidade digitável ou no − e +, a medida
 * caseira, as contas refeitas antes de salvar e o remover com confirmação.
 */
export function EditMealItemDrawer({
  item,
  date,
  onClose,
  context,
  onChanged,
}: {
  item: MealItem | null;
  date: string;
  onClose: () => void;
  /** "Café da manhã · 07:36", embaixo do nome. */
  context?: string;
  /** Depois de salvar ou remover: a tela da refeição recarrega a dela. */
  onChanged?: () => void;
}) {
  const confirm = useConfirm();
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
  const preview = item ? scaleMealItem(item, gramas ?? item.grams) : null;

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['nutrition', 'summary', date] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'nutrient-summary', date] });
    void qc.invalidateQueries({ queryKey: ['nutrition', 'history', 7] });
    onChanged?.();
    onClose();
  };

  const salvar = useMutation({
    mutationFn: () => {
      if (!item || !quantidade || gramas === null) throw new Error('Quantidade inválida');
      return nutritionApi.updateItem(item.id, amountPayload(quantidade));
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: (id: string) => nutritionApi.deleteItem(id),
    onSuccess: done,
  });
  const askRemove = () => {
    if (!item) return;
    confirm({
      title: `Remover ${item.foodName}?`,
      description: 'O item sai da refeição e as contas do dia mudam.',
      confirmLabel: 'Remover',
      destructive: true,
      onConfirm: () => remove.mutate(item.id),
    });
  };

  const criarMedida = async (rotulo: string, g: number) => {
    if (foodId === null) throw new Error('Item sem alimento');
    const criada = await nutritionApi.createPortion(foodId, { label: rotulo, grams: g });
    setCriadas((anteriores) => [...anteriores, criada]);
    void qc.invalidateQueries({ queryKey: ['nutrition', 'portions', foodId] });
    return criada;
  };

  const failure = salvar.error ?? remove.error;
  const erro = failure
    ? mensagemDeErro(failure, {
        conflito: 'Esse item já foi registrado nessa refeição.',
        alternativa: 'Não foi possível salvar. Tente de novo.',
      })
    : undefined;

  return (
    <Drawer open={aberto} onOpenChange={(estaAberto) => !estaAberto && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerDescription>Editar item</DrawerDescription>
          <DrawerTitle>{item?.foodName ?? ''}</DrawerTitle>
          {context ? <Text className="text-xs text-muted-foreground">{context}</Text> : null}
        </DrawerHeader>

        <View className="gap-4 px-4 py-3">
          {quantidade && foodId !== null ? (
            <AmountPicker
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
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={quantidade?.kind === 'grams' ? quantidade.grams : ''}
              onChangeText={(valor) => setEditada({ kind: 'grams', grams: valor })}
            />
          )}
          {preview ? (
            <View className="gap-2 rounded-card bg-muted p-3">
              <View className="flex-row">
                <Stat label="Calorias" value={String(preview.kcal)} unit="kcal" />
                <Stat label="Proteína" value={oneDecimal(preview.proteinG)} unit="prot g" />
                <Stat label="Carboidratos" value={oneDecimal(preview.carbsG)} unit="carb g" />
                <Stat label="Gorduras" value={oneDecimal(preview.fatG)} unit="gord g" />
              </View>
              {item?.nutrients ? (
                <Text className="text-center text-xs text-muted-foreground">
                  {`Fibra ${oneDecimal(preview.fiberG)} g · Sódio ${preview.sodiumMg} mg`}
                </Text>
              ) : null}
            </View>
          ) : null}
          {erro ? (
            <Text accessibilityRole="alert" className="text-sm text-destructive">
              {erro}
            </Text>
          ) : null}
        </View>

        <DrawerFooter className="flex-row">
          <Button
            variant="outline"
            accessibilityLabel="Remover item"
            onPress={askRemove}
            disabled={remove.isPending}
          >
            <Icon name="trash" size={18} color={colors.destructive} />
          </Button>
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

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value} ${unit}`}
      className="flex-1 items-center"
    >
      <Text style={TABULAR} className="font-display text-lg">
        {value}
      </Text>
      <Text className="text-[11px] text-muted-foreground">{unit}</Text>
    </View>
  );
}
